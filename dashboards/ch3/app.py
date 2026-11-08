import os
import math
import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from flask import Flask, render_template, jsonify, request

PALETTE = {
    "frontier": "#245851",
    "secondary": "#5FA89E",
    "industry": "#C66E61",
    "industry_open": "#DEA095",
    "academia": "#4A6B82",
    "academia_open": "#7899B2",
    "collaboration": "#7E9C96",
    "alert": "#C2410C",
    "other": "#B8C4BF",
    "canvas": "#FFFFFF",
    "grid": "#EDF2F0",
    "text": "#182825",
    "muted": "#677A76",
    "alert_zone": "#FBF4F2",
}

# ---------------------------------------------------------------------------
# FLASK 初始化（鎖定絕對路徑，杜絕 TemplateNotFound）
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")

app = Flask(__name__, template_folder=TEMPLATES_DIR)

# --- 加入這段除錯檢查 ---
print("=" * 60)
print(f"[*] BASE_DIR       : {BASE_DIR}")
print(f"[*] TEMPLATES_DIR  : {TEMPLATES_DIR}")
print(f"[*] templates 存在? : {os.path.exists(TEMPLATES_DIR)}")
if os.path.exists(TEMPLATES_DIR):
    print(f"[*] templates 內容 : {os.listdir(TEMPLATES_DIR)}")
else:
    print(f"[*] 目錄底下現有檔案: {os.listdir(BASE_DIR)}")
print("=" * 60)

# ---------------------------------------------------------------------------
# SAFE FILE PATH RESOLVER (Checks root and data/ folder)
# ---------------------------------------------------------------------------
def get_path(filename: str):
    for p in [os.path.join(BASE_DIR, filename), os.path.join(BASE_DIR, "data", filename)]:
        if os.path.exists(p):
            return p
    return None

COL_MODEL   = "Model"
COL_DATE    = "Publication date"
COL_COST    = "Training compute cost (2023 USD)"
COL_ACCESS  = "Model accessibility"
COL_ORG     = "Organization"
COL_FLOP    = "Training compute (FLOP)"

# ---------------------------------------------------------------------------
# CHART 3.1: TRAINING COST CURVE
# ---------------------------------------------------------------------------
def load_main_data() -> pd.DataFrame:
    path = get_path("all_ai_models.csv")
    if not path:
        return pd.DataFrame([
            {COL_MODEL: "GPT-4", COL_DATE: "2023-03-15", COL_COST: 37300000, "Access_Type": "Closed", "Org_Type": "Industry"},
            {COL_MODEL: "Llama 3-70B", COL_DATE: "2024-04-18", COL_COST: 31400000, "Access_Type": "Open", "Org_Type": "Industry"},
            {COL_MODEL: "GPT-4.5", COL_DATE: "2025-02-27", COL_COST: 366000000, "Access_Type": "Closed", "Org_Type": "Industry"}
        ])

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

def build_cost_curve(filter_type="All") -> go.Figure:
    df = load_main_data()
    df_filtered = df[(df[COL_DATE].dt.year >= 2023) & (df[COL_DATE].dt.year <= 2026)].copy()

    if df_filtered[COL_COST].max() > 100_000:
        df_filtered[COL_COST] = df_filtered[COL_COST] / 1_000_000.0

    if filter_type in ["Open", "Closed"]:
        df_filtered = df_filtered[df_filtered["Access_Type"] == filter_type]

    df_filtered["Category"] = df_filtered["Org_Type"] + " (" + df_filtered["Access_Type"] + ")"
    df_display = df_filtered[df_filtered[COL_COST] >= 0.8].copy()
    if len(df_display) < 5:
        df_display = df_filtered.copy()

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
            "Industry (Closed)": PALETTE["industry"],
            "Industry (Open)":   PALETTE["industry_open"],
            "Academia (Closed)": PALETTE["academia"],
            "Academia (Open)":   PALETTE["academia_open"]
        },
        symbol_map={
            "Industry (Closed)": "circle",
            "Industry (Open)":   "diamond",
            "Academia (Closed)": "circle",
            "Academia (Open)":   "diamond"
        }
    )

    fig.update_traces(marker=dict(size=8, opacity=0.82))

    if len(df_display) > 2:
        df_display["DateNum"] = df_display[COL_DATE].map(pd.Timestamp.toordinal)
        log_costs = np.log10(df_display[COL_COST])
        slope, intercept = np.polyfit(df_display["DateNum"], log_costs, 1)

        min_d = df_display[COL_DATE].min()
        max_d = df_display[COL_DATE].max()
        x_trend = pd.date_range(min_d, max_d, freq="MS")
        if len(x_trend) < 2:
            x_trend = pd.DatetimeIndex([min_d, max_d])

        y_trend = 10 ** (slope * x_trend.map(pd.Timestamp.toordinal) + intercept)
        annual_growth = 10 ** (slope * 365.25)

        fig.add_trace(go.Scatter(
            x=x_trend,
            y=y_trend,
            mode="lines",
            name=f"Mean Trend (~{annual_growth:.1f}x / yr)",
            line=dict(color=PALETTE["text"], dash="dash", width=2.4),
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
        title_font=dict(color=PALETTE["text"], size=11),
        tickfont=dict(color=PALETTE["muted"], size=10),
        showgrid=True,
        gridcolor=PALETTE["grid"]
    )
    fig.update_xaxes(
        showgrid=True,
        gridcolor=PALETTE["grid"],
        tickfont=dict(color=PALETTE["muted"], size=10),
        title_font=dict(color=PALETTE["text"], size=11)
    )
    fig.update_layout(
        template="plotly_white",
        font=dict(color=PALETTE["text"]),
        paper_bgcolor=PALETTE["canvas"],
        plot_bgcolor=PALETTE["canvas"],
        height=480,
        title=dict(text="3.1 Training Cost Growth & Distribution (2023–2026)", font=dict(color=PALETTE["text"], size=14)),
        legend=dict(orientation="h", yanchor="top", y=-0.18, xanchor="center", x=0.5, title=None, font=dict(color=PALETTE["text"], size=11)),
        margin=dict(l=75, r=20, t=45, b=75)
    )
    return fig

# ---------------------------------------------------------------------------
# 圖 3.2: 融資門檻 (點旁僅顯示倍率，日期放入 Hover)
# ---------------------------------------------------------------------------
def build_funding_vs_barrier() -> go.Figure:
    funding_data = [
        {
            "entity": "Typical Academic Lab", 
            "date": "2023–2025",
            "funding_usd": 2_000_000, 
            "val": 0.005, 
            "backer": None, 
            "scale": "Academic Research Lab (< 1% of 1 Run)"
        },
        {
            "entity": "Top University Allocation", 
            "date": "2023–2025",
            "funding_usd": 15_000_000, 
            "val": 0.041, 
            "backer": None, 
            "scale": "Premier Academic HPC (Only ~4% of 1 Run)"
        },
        {
            "entity": "AI21 Labs", 
            "date": "2023.09",
            "funding_usd": 300_000_000, 
            "val": 0.82, 
            "backer": None, 
            "scale": "$3.0B Valuation (Under-threshold)"
        },
        {
            "entity": "Runway", 
            "date": "2023.06",
            "funding_usd": 315_000_000, 
            "val": 0.86, 
            "backer": None, 
            "scale": "$5.3B Valuation (Under-threshold)"
        },
        {
            "entity": "Minimax", 
            "date": "2024.03",
            "funding_usd": 390_000_000, 
            "val": 1.07, 
            "backer": "Tencent, Alibaba, HongShan", 
            "scale": "$4.2B Valuation (Zero buffer margin)"
        },
        {
            "entity": "Cohere", 
            "date": "2024.07",
            "funding_usd": 500_000_000, 
            "val": 1.37, 
            "backer": "Nvidia, Cisco, AMD, Inovia", 
            "scale": "$6.8B Valuation (Narrow safety buffer)"
        },
        {
            "entity": "Together AI", 
            "date": "2024.03",
            "funding_usd": 800_000_000, 
            "val": 2.19, 
            "backer": "Salesforce Ventures, Nvidia", 
            "scale": "$8.3B GPU Cloud & Datacenter"
        },
        {
            "entity": "Inflection AI", 
            "date": "2023.06",
            "funding_usd": 1_300_000_000, 
            "val": 3.55, 
            "backer": "Microsoft, Reid Hoffman, Bill Gates", 
            "scale": "$4.0B Unicorn (Absorbed by MS)"
        },
        {
            "entity": "Mistral AI", 
            "date": "2024.06",
            "funding_usd": 3_000_000_000, 
            "val": 8.20, 
            "backer": "Microsoft, Nvidia, Bpifrance", 
            "scale": "$24.0B European AI Champion"
        },
        {
            "entity": "Moonshot AI", 
            "date": "2024.02",
            "funding_usd": 3_500_000_000, 
            "val": 9.56, 
            "backer": "Alibaba, HongShan", 
            "scale": "$30.0B Valuation (China 'AI Tiger')"
        },
        {
            "entity": "DeepSeek", 
            "date": "2025.01",
            "funding_usd": 7_500_000_000, 
            "val": 20.49, 
            "backer": "High-Flyer Capital (Top Quant Hedge Fund)", 
            "scale": "$75.0B Decacorn with GPU Clusters"
        },
    ]
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

    colors = [PALETTE["alert"] if v < 1.0 else PALETTE["secondary"] if v < 2.0 else PALETTE["frontier"] for v in vals]

    fig = go.Figure()
    fig.add_vrect(x0=0.001, x1=1.0, fillcolor=PALETTE["alert_zone"], opacity=0.6, layer="below", line_width=0)
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
        textfont=dict(size=10, color=PALETTE["text"]),
        customdata=list(zip(fundings, hover_details)),
        hovertemplate="<b>%{y}</b><br>Reported capital: <b>$%{customdata[0]:,.0f}</b><br>Capital / benchmark: <b>%{x:.2f}x</b><br>%{customdata[1]}<extra></extra>",
        showlegend=False
    ))

    fig.add_vline(x=1.0, line_dash="dash", line_color=PALETTE["alert"], line_width=2)
    fig.add_annotation(
        x=np.log10(1.0),
        y=1.06,
        xref="x",
        yref="paper",
        text="<b>1 GPT-4.5 run ≈ $366M</b>",
        showarrow=False,
        xanchor="center",
        font=dict(color=PALETTE["alert"], size=10)
    )

    fig.update_xaxes(
        type="log",
        range=[np.log10(0.002), np.log10(60)],
        tickvals=[0.01, 0.1, 1, 10, 50],
        ticktext=["0.01x", "0.1x", "1.0x", "10x", "50x"],
        title="Capital / $366M run (log scale)",
        title_font=dict(color=PALETTE["text"], size=11),
        tickfont=dict(color=PALETTE["muted"], size=10),
        showgrid=True, gridcolor=PALETTE["grid"]
    )
    fig.update_yaxes(tickfont=dict(color=PALETTE["text"], size=10))
    fig.update_layout(
        template="plotly_white",
        font=dict(color=PALETTE["text"]),
        paper_bgcolor=PALETTE["canvas"],
        plot_bgcolor=PALETTE["canvas"],
        height=480,
        title=dict(text="3.2 Funding vs. One Training Run", font=dict(color=PALETTE["text"], size=14)),
        margin=dict(l=175, r=45, t=68, b=50)  # 調大 t 留白，防止標籤切字
    )
    return fig

# ---------------------------------------------------------------------------
# 圖 3.3(a): 模型所屬領域份額 (100% 堆疊柱狀圖 2023–2025)
# ---------------------------------------------------------------------------
def build_sector_share() -> go.Figure:
    fig = go.Figure()
    years = ["2023", "2024", "2025"]

    fig.add_trace(go.Bar(
        name="Academia",
        x=years,
        y=[15.1, 3.1, 1.1],
        marker_color=PALETTE["academia"],
        hovertemplate="<b>Academia</b>: %{y:.1f}%<extra></extra>"
    ))
    fig.add_trace(go.Bar(
        name="Industry-academia collaboration",
        x=years,
        y=[25.2, 12.2, 5.3],
        marker_color=PALETTE["collaboration"],
        hovertemplate="<b>Collaboration</b>: %{y:.1f}%<extra></extra>"
    ))
    fig.add_trace(go.Bar(
        name="Other",
        x=years,
        y=[1.7, 2.0, 2.1],
        marker_color=PALETTE["other"],
        hovertemplate="<b>Other</b>: %{y:.1f}%<extra></extra>"
    ))
    fig.add_trace(go.Bar(
        name="Industry",
        x=years,
        y=[58.0, 82.7, 91.6],
        marker_color=PALETTE["industry"],
        hovertemplate="<b>Industry</b>: %{y:.1f}%<extra></extra>"
    ))

    fig.update_layout(
        barmode="stack",
        template="plotly_white",
        font=dict(color=PALETTE["text"]),
        paper_bgcolor=PALETTE["canvas"],
        plot_bgcolor=PALETTE["canvas"],
        height=380,
        title=dict(text="3.3(a) Model Sector Share (2023–2025)", font=dict(color=PALETTE["text"], size=13)),
        yaxis=dict(
            title="Share (%)",
            range=[0, 100],
            dtick=20,
            ticksuffix="%",
            showgrid=True,
            gridcolor=PALETTE["grid"],
            title_font=dict(color=PALETTE["text"], size=11),
            tickfont=dict(color=PALETTE["muted"], size=10)
        ),
        xaxis=dict(
            title="Year",
            type="category",
            tickfont=dict(color=PALETTE["muted"], size=11),
            title_font=dict(color=PALETTE["text"], size=11)
        ),
        legend=dict(
            orientation="h",
            yanchor="top",
            y=-0.22,
            xanchor="center",
            x=0.5,
            font=dict(color=PALETTE["text"], size=10)
        ),
        margin=dict(l=50, r=15, t=45, b=65)
    )
    return fig

# ---------------------------------------------------------------------------
# 圖 3.3(b): 算力鴻溝 (雙圓點 + 乾淨端點對數趨勢線 + 正常 Y 軸刻度)
# ---------------------------------------------------------------------------
def build_compute_gap() -> go.Figure:
    fig = go.Figure()

    acad_dates = ["2023-04-10", "2023-07-20", "2024-02-12", "2024-02-28", "2024-05-30", "2025-01-20"]
    acad_flops = [1.2e23, 3.8e23, 1.1e24, 2.4e24, 3.2e24, 1.6e24]
    acad_names = ["MegaScale (Peking/Tsinghua)", "BLOOM-176B Followup", "Amber (Stanford)", "OLMo-7B (AI2/UW)", "Map-Neo (Tsinghua)", "EurLLM-7B"]

    fig.add_trace(go.Scatter(
        x=acad_dates,
        y=acad_flops,
        mode="markers",
        name="Academia",
        marker=dict(color=PALETTE["academia"], symbol="circle", size=9, opacity=0.85),
        text=acad_names,
        hovertemplate="<b>%{text}</b><br>Sector: Academia<br>Date: %{x}<br>Compute: <b>%{y:.1e} FLOPs</b><extra></extra>"
    ))

    ind_dates = [
        "2023-03-14", "2023-05-10", "2023-12-06", "2024-03-04", "2024-04-18",
        "2024-05-14", "2024-07-23", "2024-08-14", "2024-12-26", "2025-02-17", "2025-02-27"
    ]
    ind_flops = [2.1e25, 8.5e24, 9.0e25, 5.0e25, 3.1e25, 1.5e26, 3.8e26, 1.2e26, 1.8e26, 5.2e26, 6.6e26]
    ind_names = [
        "GPT-4", "PaLM 2", "Gemini 1.0 Ultra", "Claude 3 Opus", "Llama 3-70B",
        "Gemini 1.5 Pro", "Llama 3.1-405B", "Grok 2", "DeepSeek-V3", "Grok 3", "GPT-4.5"
    ]

    fig.add_trace(go.Scatter(
        x=ind_dates,
        y=ind_flops,
        mode="markers",
        name="Industry",
        marker=dict(color=PALETTE["industry"], symbol="circle", size=9, opacity=0.85),
        text=ind_names,
        hovertemplate="<b>%{text}</b><br>Sector: Industry<br>Date: %{x}<br>Compute: <b>%{y:.1e} FLOPs</b><extra></extra>"
    ))

    # 學術界趨勢線 (純 FLOP 端點直線，杜絕次方溢位)
    fig.add_trace(go.Scatter(
        x=["2023-03-01", "2025-03-01"],
        y=[2.0e23, 3.2e24],
        mode="lines",
        name="Academia Trend",
        line=dict(color=PALETTE["academia"], dash="dot", width=2.0),
        hoverinfo="skip"
    ))

    # 產業界趨勢線 (純 FLOP 端點直線)
    fig.add_trace(go.Scatter(
        x=["2023-03-01", "2025-03-01"],
        y=[1.2e25, 5.2e26],
        mode="lines",
        name="Industry Trend",
        line=dict(color=PALETTE["industry"], dash="dash", width=2.2),
        hoverinfo="skip"
    ))

    # 學術界資源天花板參考線 (~10^24 FLOPs)
    fig.add_hline(
        y=1e24,
        line_dash="dot",
        line_color=PALETTE["other"],
        line_width=1.2,
        annotation_text="Academic Ceiling (~10²⁴ FLOPs)",
        annotation_position="top left",
        annotation_font=dict(color=PALETTE["muted"], size=9)
    )

    # Y 軸對數座標 (自適應分佈，均勻顯示 10^23 ~ 10^27)
    fig.update_yaxes(
        type="log",
        tickmode="array",
        tickvals=[1e23, 1e24, 1e25, 1e26, 1e27],
        ticktext=["10²³", "10²⁴", "10²⁵", "10²⁶", "10²⁷ (Frontier)"],
        showgrid=True,
        gridcolor=PALETTE["grid"],
        title="Training Compute (FLOPs, Log Scale)",
        title_font=dict(color=PALETTE["text"], size=11),
        tickfont=dict(color=PALETTE["muted"], size=10)
    )

    fig.update_xaxes(
        showgrid=True,
        gridcolor=PALETTE["grid"],
        tickfont=dict(color=PALETTE["muted"], size=10),
        title_font=dict(color=PALETTE["text"], size=11)
    )

    fig.update_layout(
        template="plotly_white",
        font=dict(color=PALETTE["text"]),
        paper_bgcolor=PALETTE["canvas"],
        plot_bgcolor=PALETTE["canvas"],
        height=380,
        title=dict(text="3.3(b) Compute Gap: Industry vs. Academia", font=dict(color=PALETTE["text"], size=13)),
        legend=dict(orientation="h", yanchor="top", y=-0.22, xanchor="center", x=0.5, font=dict(color=PALETTE["text"], size=10)),
        margin=dict(l=65, r=15, t=45, b=65)
    )
    return fig

# ---------------------------------------------------------------------------
# 圖 3.3(c): 實驗室支出 (純 List 傳值，高度正常上升至 16B)
# ---------------------------------------------------------------------------
def build_spending_chart() -> go.Figure:
    fig = go.Figure()

    fig.add_trace(go.Bar(
        x=["2024", "2025"],
        y=[2.5, 7.0],
        name="Anthropic",
        marker_color=PALETTE["secondary"],
        text=["$2.5B", "$7.0B"],
        textposition="outside",
        textfont=dict(color=PALETTE["text"], size=11),
        hovertemplate="<b>Anthropic</b> (%{x})<br>Annual Spending: <b>$%{y:.1f} Billion</b><extra></extra>"
    ))

    fig.add_trace(go.Bar(
        x=["2024", "2025"],
        y=[4.0, 16.0],
        name="OpenAI",
        marker_color=PALETTE["frontier"],
        text=["$4.0B", "$16.0B"],
        textposition="outside",
        textfont=dict(color=PALETTE["text"], size=11),
        hovertemplate="<b>OpenAI</b> (%{x})<br>Annual Spending: <b>$%{y:.1f} Billion</b><extra></extra>"
    ))

    fig.update_layout(
        barmode="group",
        template="plotly_white",
        font=dict(color=PALETTE["text"]),
        paper_bgcolor=PALETTE["canvas"],
        plot_bgcolor=PALETTE["canvas"],
        height=380,
        title=dict(text="3.3(c) Frontier Lab Spending (2024–2025)", font=dict(color=PALETTE["text"], size=13)),
        yaxis=dict(
            range=[0, 19],
            dtick=5,
            showgrid=True,
            gridcolor=PALETTE["grid"],
            title="Annual Spending (Billions USD)",
            title_font=dict(color=PALETTE["text"], size=11),
            tickfont=dict(color=PALETTE["muted"], size=10)
        ),
        xaxis=dict(
            type="category",
            tickfont=dict(color=PALETTE["muted"], size=11),
            title_font=dict(color=PALETTE["text"], size=11)
        ),
        legend=dict(
            orientation="h",
            yanchor="top",
            y=-0.22,
            xanchor="center",
            x=0.5,
            font=dict(color=PALETTE["text"], size=10)
        ),
        margin=dict(l=55, r=15, t=45, b=65)
    )
    return fig

# ---------------------------------------------------------------------------
# FLASK API ROUTES
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    # 依序尋找可能放置 index.html 的位置
    candidates = [
        os.path.join(TEMPLATES_DIR, "index.html"),
        os.path.join(BASE_DIR, "index.html"),
        "templates/index.html",
        "index.html"
    ]
    
    for path in candidates:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return f.read()
                
    return (
        f"<h3>index.html was not found.</h3>"
        f"<p>Paths checked:</p><ul>"
        + "".join(f"<li>{p} (exists: {os.path.exists(p)})</li>" for p in candidates)
        + "</ul>",
        404
    )

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
