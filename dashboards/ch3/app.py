from pathlib import Path
import json

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from flask import Flask, jsonify, render_template, request

BASE = Path(__file__).resolve().parent
app = Flask(__name__, template_folder=str(BASE / "templates"),
            static_folder=str(BASE.parents[1] / "static"), static_url_path="/static")
EXHIBITS = json.loads((BASE / "data/chapter-exhibits.json").read_text())

COL_MODEL   = "Model"
COL_DATE    = "Publication date"
COL_COST    = "Training compute cost (2023 USD)"
COL_ACCESS  = "Model accessibility"
COL_ORG     = "Organization"
COL_FLOP    = "Training compute (FLOP)"

# ---------------------------------------------------------------------------
# CHART 3.1: TRAINING COST CURVE (RED VS BLUE)
# ---------------------------------------------------------------------------
def load_main_data() -> pd.DataFrame:
    path = BASE / "data" / "all_ai_models.csv"
    df = pd.read_csv(path, low_memory=False)
    df[COL_DATE] = pd.to_datetime(df[COL_DATE], errors="coerce")
    df[COL_COST] = pd.to_numeric(df[COL_COST], errors="coerce")
    df[COL_FLOP] = pd.to_numeric(df[COL_FLOP], errors="coerce")
    df[COL_COST] = df[COL_COST].fillna(df[COL_FLOP] * 4e-18)

    def _access(val):
        if pd.isna(val): return "Closed"
        v = str(val).strip().lower()
        return "Open" if any(k in v for k in ["open", "weights"]) else "Closed"

    df["Access_Type"] = df[COL_ACCESS].apply(_access)

    def _org(val):
        if pd.isna(val): return "Industry"
        v = str(val).lower()
        academic_terms = ["university", "academia", "institute", "college", "school", "cern", "inria", "tsinghua", "stanford", "mit"]
        return "Academia" if any(term in v for term in academic_terms) else "Industry"

    df["Org_Type"] = df[COL_ORG].apply(_org)
    df = df.dropna(subset=[COL_DATE, COL_COST])
    df = df[df[COL_COST] >= 1000]
    return df.sort_values(COL_DATE).reset_index(drop=True)


def cost_observations(filter_type):
    df = load_main_data()
    df = df[df[COL_DATE].dt.year.between(2023, 2026)].copy()
    df[COL_COST] /= 1_000_000  # The source and FLOP proxy are both in USD.
    if filter_type in {"Open", "Closed"}:
        df = df[df["Access_Type"] == filter_type].copy()
    df["Category"] = df["Org_Type"] + " (" + df["Access_Type"] + ")"
    display = df[df[COL_COST] >= 0.8]
    if len(display) < 5:
        display = df
    trend, growth = [], None
    if len(display) > 2 and display[COL_DATE].nunique() > 1:
        ordinal = display[COL_DATE].map(pd.Timestamp.toordinal)
        slope, intercept = np.polyfit(ordinal, np.log10(display[COL_COST]), 1)
        start, end = display[COL_DATE].min(), display[COL_DATE].max()
        dates = pd.date_range(start, end, freq="MS")
        if len(dates) < 2:
            dates = pd.DatetimeIndex([start, end])
        trend = [(d.strftime("%Y-%m-%d"), float(10 ** (slope * d.toordinal() + intercept))) for d in dates]
        growth = float(10 ** (slope * 365.25))
    return display, trend, growth


@app.get("/api/observations/cost")
def cost_data():
    frame, trend, growth = cost_observations(request.args.get("filter", "All"))
    fields = {COL_MODEL: "model", COL_DATE: "date", COL_COST: "cost", COL_ORG: "org",
              "Org_Type": "sector", "Access_Type": "access"}
    points = frame[list(fields)].rename(columns=fields).copy()
    points["date"] = points["date"].dt.strftime("%Y-%m-%d")
    return jsonify(points=points.fillna("").to_dict("records"), trend=trend, annualGrowth=growth)


@app.get("/api/observations/exhibits")
def exhibit_data():
    return jsonify(EXHIBITS)


@app.get("/")
def index():
    return render_template("index.html")


# Compatibility for clients that consume the original figure JSON APIs.
def build_cost_curve(filter_type="All") -> go.Figure:
    df_display, trend, annual_growth = cost_observations(filter_type)

    fig = px.scatter(
        df_display,
        x=COL_DATE,
        y=COL_COST,
        log_y=True,
        color="Category",
        symbol="Category",
        hover_name=COL_MODEL,
        hover_data={COL_ORG: True, COL_COST: ":$.1fM", COL_DATE: "|%B %d, %Y", "Category": False},
        labels={COL_COST: "Training Cost (USD, Log Scale)", COL_DATE: "Publication Date"},
        color_discrete_map={
            "Industry (Closed)": "#dc2626",
            "Industry (Open)":   "#ef4444",
            "Academia (Closed)": "#2563eb",
            "Academia (Open)":   "#0284c7"
        },
        symbol_map={
            "Industry (Closed)": "circle",
            "Industry (Open)":   "diamond",
            "Academia (Closed)": "circle",
            "Academia (Open)":   "diamond"
        }
    )

    fig.update_traces(marker=dict(size=8, opacity=0.82))

    if trend:
        x_trend, y_trend = zip(*trend)
        fig.add_trace(go.Scatter(
            x=x_trend,
            y=y_trend,
            mode="lines",
            name=f"Mean Trend (~{annual_growth:.1f}x / yr)",
            line=dict(color="#182825", dash="dash", width=2.4),
            hoverinfo="skip"
        ))

    # 對齊幾何十倍刻度：$1M, $10M, $100M, $1B
    fig.update_yaxes(
        type="log",
        tickmode="array",
        tickvals=[1, 10, 100, 1000],
        ticktext=["$1M", "$10M", "$100M", "$1B"],
        range=[np.log10(0.1), np.log10(800)],
        title="Training Compute Cost (2023 USD, Log Scale)",
        title_font=dict(color="#182825", size=11),
        tickfont=dict(color="#677a76", size=10),
        showgrid=True,
        gridcolor="#edf2f0"
    )
    fig.update_xaxes(
        showgrid=True,
        gridcolor="#edf2f0",
        tickfont=dict(color="#677a76", size=10),
        title_font=dict(color="#182825", size=11)
    )
    fig.update_layout(
        template="plotly_white",
        paper_bgcolor="#ffffff",
        plot_bgcolor="#ffffff",
        height=480,
        title=dict(text="3.1 Training Cost Growth & Distribution (2023–2026)", font=dict(color="#182825", size=14)),
        legend=dict(orientation="h", yanchor="top", y=-0.18, xanchor="center", x=0.5, title=None, font=dict(color="#182825", size=11)),
        margin=dict(l=75, r=20, t=45, b=75)
    )
    return fig

# ---------------------------------------------------------------------------
# 圖 3.2: 融資門檻 (點旁僅顯示倍率，日期放入 Hover)
# ---------------------------------------------------------------------------
def build_funding_vs_barrier() -> go.Figure:
    funding_data = EXHIBITS["funding"]
    df_f = pd.DataFrame(funding_data).sort_values("val").reset_index(drop=True)

    entities = df_f["entity"].tolist()
    vals = df_f["val"].tolist()
    fundings = df_f["funding_usd"].tolist()

    hover_details = []
    for _, row in df_f.iterrows():
        if row["val"] < 1.0 or not row["backer"]:
            hover_details.append(f"Funding Date: <b>{row['date']}</b><br>Scale / Status: <i>{row['scale']}</i>")
        else:
            hover_details.append(f"Funding Date: <b>{row['date']}</b><br>Strategic Backer: <b>{row['backer']}</b><br>Scale / Status: <i>{row['scale']}</i>")

    colors = ["#c2410c" if v < 1.0 else "#ca8a04" if v < 2.0 else "#358177" for v in vals]

    fig = go.Figure()
    fig.add_vrect(x0=0.001, x1=1.0, fillcolor="#fbf4f2", opacity=0.6, layer="below", line_width=0)
    fig.add_vrect(x0=1.0, x1=60.0, fillcolor="#edf6f4", opacity=0.6, layer="below", line_width=0)

    stem_x, stem_y = [], []
    for ent, v in zip(entities, vals):
        stem_x.extend([0.002, v, None])
        stem_y.extend([ent, ent, None])

    fig.add_trace(go.Scatter(x=stem_x, y=stem_y, mode="lines", line=dict(color="#d5deda", width=2.8), hoverinfo="skip", showlegend=False))
    
    clean_labels = [f"  {v:.2f}x" if v >= 0.1 else f"  {v:.3f}x" for v in vals]

    fig.add_trace(go.Scatter(
        x=vals, y=entities, mode="markers+text",
        marker=dict(color=colors, size=13, line=dict(color="white", width=1.5)),
        text=clean_labels,
        textposition="middle right",
        textfont=dict(size=10, color="#182825"),
        customdata=list(zip(fundings, hover_details)),
        hovertemplate="<b>%{y}</b><br>Total Capital: <b>$%{customdata[0]:,.0f}</b><br>Frontier Models Affordable: <b>%{x:.2f}x</b><br>%{customdata[1]}<extra></extra>",
        showlegend=False
    ))

    fig.add_vline(x=1.0, line_dash="dash", line_color="#c2410c", line_width=2)
    fig.add_annotation(
        x=np.log10(1.0),
        y=1.06,
        xref="x",
        yref="paper",
        text=(
            "<b>Survival Threshold: 1 Frontier Model (~$366M)</b><br>"
            "<span style='font-size:8.5px;color:#c2410c;font-weight:normal;'>"
            "GPT-4.5 estimated training cost, 2025"
            "</span>"
        ),
        showarrow=False,
        xanchor="center",
        font=dict(color="#c2410c", size=10)  # 改為與紅線一致的顏色
    )

    fig.update_xaxes(
        type="log",
        range=[np.log10(0.002), np.log10(60)],
        tickvals=[0.01, 0.1, 1, 10, 50],
        ticktext=["0.01x", "0.1x", "1.0x", "10x", "50x"],
        title="Number of Frontier Models Affordable (Log Scale)",
        title_font=dict(color="#182825", size=11),
        tickfont=dict(color="#677a76", size=10),
        showgrid=True, gridcolor="#edf2f0"
    )
    fig.update_yaxes(tickfont=dict(color="#182825", size=10))
    fig.update_layout(
        template="plotly_white",
        paper_bgcolor="#ffffff",
        plot_bgcolor="#ffffff",
        height=480,
        title=dict(text="3.2 · Small-lab funding vs. cost barrier", font=dict(color="#182825", size=14)),
        margin=dict(l=220, r=45, t=68, b=50)  # 由原先的 175 調大為 220，防止左側文字被截斷
    )
    return fig

# ---------------------------------------------------------------------------
# 圖 3.3(a): 模型所屬領域份額 (100% 堆疊柱狀圖 2023–2025)
# ---------------------------------------------------------------------------
def build_sector_share() -> go.Figure:
    fig = go.Figure()
    years = EXHIBITS["sector"]["years"]

    fig.add_trace(go.Bar(
        name="Academia",
        x=years,
        y=EXHIBITS["sector"]["shares"]["Academia"],
        marker_color="#2563eb",
        hovertemplate="<b>Academia</b>: %{y:.1f}%<extra></extra>"
    ))
    fig.add_trace(go.Bar(
        name="Industry-academia collaboration",
        x=years,
        y=EXHIBITS["sector"]["shares"]["Industry-academia collaboration"],
        marker_color="#8b5cf6",
        hovertemplate="<b>Collaboration</b>: %{y:.1f}%<extra></extra>"
    ))
    fig.add_trace(go.Bar(
        name="Other",
        x=years,
        y=EXHIBITS["sector"]["shares"]["Other"],
        marker_color="#94a3b8",
        hovertemplate="<b>Other</b>: %{y:.1f}%<extra></extra>"
    ))
    fig.add_trace(go.Bar(
        name="Industry",
        x=years,
        y=EXHIBITS["sector"]["shares"]["Industry"],
        marker_color="#dc2626",
        hovertemplate="<b>Industry</b>: %{y:.1f}%<extra></extra>"
    ))

    fig.update_layout(
        barmode="stack",
        template="plotly_white",
        paper_bgcolor="#ffffff",
        plot_bgcolor="#ffffff",
        height=380,
        title=dict(text="3.3(a) Model Sector Share (2023–2025)", font=dict(color="#182825", size=13)),
        yaxis=dict(
            title="Share (%)",
            range=[0, 100],
            dtick=20,
            ticksuffix="%",
            showgrid=True,
            gridcolor="#edf2f0",
            title_font=dict(color="#182825", size=11),
            tickfont=dict(color="#677a76", size=10)
        ),
        xaxis=dict(
            title="Year",
            type="category",
            tickfont=dict(color="#677a76", size=11),
            title_font=dict(color="#182825", size=11)
        ),
        legend=dict(
            orientation="h",
            yanchor="top",
            y=-0.22,
            xanchor="center",
            x=0.5,
            font=dict(color="#182825", size=10)
        ),
        margin=dict(l=50, r=15, t=45, b=65)
    )
    return fig

# ---------------------------------------------------------------------------
# 圖 3.3(b): 算力鴻溝 (雙圓點 + 乾淨端點對數趨勢線 + 正常 Y 軸刻度)
# ---------------------------------------------------------------------------
def build_compute_gap() -> go.Figure:
    fig = go.Figure()

    models = EXHIBITS["compute"]["Academia"]["models"]
    acad_dates, acad_flops, acad_names = zip(*[(r["date"], r["flops"], r["model"]) for r in models])

    fig.add_trace(go.Scatter(
        x=acad_dates,
        y=acad_flops,
        mode="markers",
        name="Academia",
        marker=dict(color="#2563eb", symbol="circle", size=9, opacity=0.85),
        text=acad_names,
        hovertemplate="<b>%{text}</b><br>Sector: Academia<br>Date: %{x}<br>Compute: <b>%{y:.1e} FLOPs</b><extra></extra>"
    ))

    models = EXHIBITS["compute"]["Industry"]["models"]
    ind_dates, ind_flops, ind_names = zip(*[(r["date"], r["flops"], r["model"]) for r in models])

    fig.add_trace(go.Scatter(
        x=ind_dates,
        y=ind_flops,
        mode="markers",
        name="Industry",
        marker=dict(color="#dc2626", symbol="circle", size=9, opacity=0.85),
        text=ind_names,
        hovertemplate="<b>%{text}</b><br>Sector: Industry<br>Date: %{x}<br>Compute: <b>%{y:.1e} FLOPs</b><extra></extra>"
    ))

    # 學術界趨勢線 (純 FLOP 端點直線，杜絕次方溢位)
    fig.add_trace(go.Scatter(
        x=[r[0] for r in EXHIBITS["compute"]["Academia"]["trend"]],
        y=[r[1] for r in EXHIBITS["compute"]["Academia"]["trend"]],
        mode="lines",
        name="Academia Trend",
        line=dict(color="#2563eb", dash="dot", width=2.0),
        hoverinfo="skip"
    ))

    # 產業界趨勢線 (純 FLOP 端點直線)
    fig.add_trace(go.Scatter(
        x=[r[0] for r in EXHIBITS["compute"]["Industry"]["trend"]],
        y=[r[1] for r in EXHIBITS["compute"]["Industry"]["trend"]],
        mode="lines",
        name="Industry Trend",
        line=dict(color="#dc2626", dash="dash", width=2.2),
        hoverinfo="skip"
    ))

    # 學術界資源天花板參考線 (~10^24 FLOPs)
    fig.add_hline(
        y=1e24,
        line_dash="dot",
        line_color="#94a3b8",
        line_width=1.2,
        annotation_text="Academic Ceiling (~10²⁴ FLOPs)",
        annotation_position="top left",
        annotation_font=dict(color="#64748b", size=9)
    )

    # Y 軸對數座標 (自適應分佈，均勻顯示 10^23 ~ 10^27)
    fig.update_yaxes(
        type="log",
        tickmode="array",
        tickvals=[1e23, 1e24, 1e25, 1e26, 1e27],
        ticktext=["10²³", "10²⁴", "10²⁵", "10²⁶", "10²⁷ (Frontier)"],
        showgrid=True,
        gridcolor="#edf2f0",
        title="Training Compute (FLOPs, Log Scale)",
        title_font=dict(color="#182825", size=11),
        tickfont=dict(color="#677a76", size=10)
    )

    fig.update_xaxes(
        showgrid=True,
        gridcolor="#edf2f0",
        tickfont=dict(color="#677a76", size=10),
        title_font=dict(color="#182825", size=11)
    )

    fig.update_layout(
        template="plotly_white",
        paper_bgcolor="#ffffff",
        plot_bgcolor="#ffffff",
        height=380,
        title=dict(text="3.3(b) Compute Gap: Industry vs. Academia", font=dict(color="#182825", size=13)),
        legend=dict(orientation="h", yanchor="top", y=-0.22, xanchor="center", x=0.5, font=dict(color="#182825", size=10)),
        margin=dict(l=65, r=15, t=45, b=65)
    )
    return fig

# ---------------------------------------------------------------------------
# 圖 3.3(c): 實驗室支出 (純 List 傳值，高度正常上升至 16B)
# ---------------------------------------------------------------------------
def build_spending_chart() -> go.Figure:
    fig = go.Figure()

    fig.add_trace(go.Bar(
        x=EXHIBITS["spending"]["years"],
        y=EXHIBITS["spending"]["labs"]["Anthropic"],
        name="Anthropic",
        marker_color="#d97706",
        text=["$2.5B", "$7.0B"],
        textposition="outside",
        textfont=dict(color="#182825", size=11),
        hovertemplate="<b>Anthropic</b> (%{x})<br>Annual Spending: <b>$%{y:.1f} Billion</b><extra></extra>"
    ))

    fig.add_trace(go.Bar(
        x=EXHIBITS["spending"]["years"],
        y=EXHIBITS["spending"]["labs"]["OpenAI"],
        name="OpenAI",
        marker_color="#059669",
        text=["$4.0B", "$16.0B"],
        textposition="outside",
        textfont=dict(color="#182825", size=11),
        hovertemplate="<b>OpenAI</b> (%{x})<br>Annual Spending: <b>$%{y:.1f} Billion</b><extra></extra>"
    ))

    fig.update_layout(
        barmode="group",
        template="plotly_white",
        paper_bgcolor="#ffffff",
        plot_bgcolor="#ffffff",
        height=380,
        title=dict(text="3.3(c) Frontier Lab Spending (2024–2025)", font=dict(color="#182825", size=13)),
        yaxis=dict(
            range=[0, 19],
            dtick=5,
            showgrid=True,
            gridcolor="#edf2f0",
            title="Annual Spending (Billions USD)",
            title_font=dict(color="#182825", size=11),
            tickfont=dict(color="#677a76", size=10)
        ),
        xaxis=dict(
            type="category",
            tickfont=dict(color="#677a76", size=11),
            title_font=dict(color="#182825", size=11)
        ),
        legend=dict(
            orientation="h",
            yanchor="top",
            y=-0.22,
            xanchor="center",
            x=0.5,
            font=dict(color="#182825", size=10)
        ),
        margin=dict(l=55, r=15, t=45, b=65)
    )
    return fig

@app.route("/api/cost-curve")
def get_cost_curve():
    """Serve the exact Chapter 3 Fig. 3.1 traces to the report."""
    return app.response_class(build_cost_curve("All").to_json(), mimetype="application/json")

@app.route("/api/charts")
def get_charts():
    filter_type = request.args.get("filter", "All")
    return jsonify({
        "chart1":  build_cost_curve(filter_type).to_json(),
        "chart2":  build_funding_vs_barrier().to_json(),
        "chart3a": build_sector_share().to_json(),
        "chart3b": build_compute_gap().to_json(),
        "chart3c": build_spending_chart().to_json(),
    })

if __name__ == "__main__":
    app.run(debug=True, port=5000)
