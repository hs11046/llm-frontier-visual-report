"""Linked, evidence-led Plotly Dash dashboard for COMP7507 Chapter 2."""

from __future__ import annotations

import json
import os
from typing import Any

import pandas as pd
import plotly.graph_objects as go
from dash import Dash, Input, Output, State, ctx, dcc, html
from plotly.subplots import make_subplots

from dashboard_data import (
    ALL_ENTITIES,
    COLORS,
    DATA,
    END_YEAR,
    GROUPS,
    GROUP_BY_ENTITY,
    START_YEAR,
)


FONT = "DM Sans, -apple-system, BlinkMacSystemFont, sans-serif"
GRID = "#e8eee7"
TEXT = "#173c39"
MUTED = "#71877c"
UNSELECTED_OPACITY = 0.2
LEGEND_FONT_SIZE = 11
GRAPH_IDS = (
    "scale-graph",
    "lab-revenue-graph",
    "revenue-comparison-graph",
    "eto-graph",
)
YEAR_FILTER_IDS = ("year-min", "year-max")
CLEAR_IDS = (
    "clear-scale",
    "clear-lab-revenue",
    "clear-revenue-comparison",
    "clear-eto",
)


def _empty(
    figure: go.Figure,
    message: str,
    row: int | None = None,
    col: int | None = None,
) -> None:
    subplot_key = (row, col or 1)
    subplot_axis = {
        (1, 1): "x",
        (1, 2): "x2",
        (2, 1): "x3",
        (2, 2): "x4",
    }.get(subplot_key)
    y_axis = {
        (1, 1): "y",
        (1, 2): "y2",
        (2, 1): "y3",
        (2, 2): "y4",
    }.get(subplot_key)
    annotation: dict[str, Any] = {
        "text": message,
        "xref": "paper" if row is None else f"{subplot_axis} domain",
        "yref": "paper" if row is None else f"{y_axis} domain",
        "x": 0.5,
        "y": 0.5,
        "showarrow": False,
        "font": {"size": 13, "color": MUTED},
    }
    figure.add_annotation(**annotation)


def _hover_entity_year(entity: str | None, year: int) -> list[Any]:
    return [entity, int(year)]


def _scale_figure(
    start_year: int,
    end_year: int,
    selected: set[str],
    retain_unselected: bool,
    selection_revision: int = 0,
) -> go.Figure:
    if not retain_unselected and not selected.intersection(GROUPS["Big companies"]):
        figure = go.Figure()
        figure.add_annotation(
            text=(
                "Scale Change shows public-company data.<br>"
                "Select a Big company or keep unselected data to compare."
            ),
            x=0.5,
            y=0.5,
            xref="paper",
            yref="paper",
            showarrow=False,
            align="center",
            font={"size": 13, "color": MUTED},
        )
        figure.update_layout(
            template="plotly_white",
            autosize=True,
            margin={"l": 12, "r": 12, "t": 16, "b": 12},
            font={"family": FONT, "color": TEXT},
            dragmode="select",
            selectionrevision=selection_revision,
        )
        figure.update_xaxes(visible=False, fixedrange=True)
        figure.update_yaxes(visible=False, fixedrange=True)
        return figure

    figure = make_subplots(
        rows=2,
        cols=2,
        horizontal_spacing=0.12,
        vertical_spacing=0.12,
        row_heights=[0.52, 0.48],
        subplot_titles=(
            "Market cap · USD bn",
            "Revenue · USD bn",
            "Market cap share",
            "Revenue share",
        ),
    )
    years = list(range(start_year, end_year + 1))

    market_cap = DATA["market_cap"]
    market_cap = market_cap[
        market_cap["Year"].between(start_year, end_year)
    ].copy()
    market_cap_visible = False
    for entity in ALL_ENTITIES:
        if entity not in selected and not retain_unselected:
            continue
        subset = market_cap[market_cap["Organization"] == entity]
        if subset.empty:
            continue
        market_cap_visible = True
        figure.add_trace(
            go.Scatter(
                x=subset["Date"].dt.strftime("%Y-%m-%d"),
                y=subset["Market cap (USD bn)"],
                name=entity,
                legendgroup=entity,
                mode="lines+markers",
                marker={"size": 7},
                line={"color": COLORS[entity], "width": 2.4},
                opacity=1 if entity in selected else UNSELECTED_OPACITY,
                showlegend=True,
                customdata=[
                    [
                        entity,
                        int(row.Year),
                        row["Share observation date"].strftime("%Y-%m-%d"),
                        float(row["Shares outstanding"]) / 1e9,
                    ]
                    for _, row in subset.iterrows()
                ],
                hovertemplate=(
                    "%{customdata[0]}<br>%{x|%Y-%m-%d}"
                    "<br>Market cap: $%{y:,.1f}B"
                    "<br>Shares reported on %{customdata[2]}: %{customdata[3]:.2f}B"
                    "<extra></extra>"
                ),
            ),
            row=1,
            col=1,
        )
    if not market_cap_visible:
        _empty(
            figure,
            "No listed-company market-cap data for this selection.",
            row=1,
            col=1,
        )

    revenue = DATA["public_revenue"]
    revenue = revenue[
        revenue["Year"].between(start_year, end_year)
    ]
    revenue_visible = False
    for entity in ALL_ENTITIES:
        if entity not in selected and not retain_unselected:
            continue
        subset = revenue[revenue["Organization"] == entity].sort_values("Year")
        if subset.empty:
            continue
        revenue_visible = True
        figure.add_trace(
            go.Scatter(
                x=subset["Year"],
                y=subset["Revenue (USD bn)"],
                name=entity,
                legendgroup=entity,
                showlegend=False,
                mode="lines+markers",
                marker={"size": 7},
                line={"color": COLORS[entity], "width": 2.4},
                opacity=1 if entity in selected else UNSELECTED_OPACITY,
                customdata=[
                    [entity, int(row.Year), row["Fiscal period start"].isoformat(), row["Fiscal period end"].isoformat()]
                    for _, row in subset.iterrows()
                ],
                hovertemplate=(
                    "%{customdata[0]}<br>Fiscal year-end: %{x}"
                    "<br>Revenue: $%{y:,.1f}B"
                    "<br>Period: %{customdata[2]} to %{customdata[3]}"
                    "<extra></extra>"
                ),
            ),
            row=1,
            col=2,
        )

    if not revenue_visible:
        _empty(
            figure,
            "No listed-company revenue records for this selection.",
            row=1,
            col=2,
        )

    market_cap_share = (
        market_cap.sort_values("Date")
        .groupby(["Organization", "Year"], as_index=False)
        .tail(1)
        .copy()
    )
    market_cap_share_visible = False
    if not market_cap_share.empty:
        market_cap_share["Year total"] = market_cap_share.groupby("Year")[
            "Market cap (USD bn)"
        ].transform("sum")
        market_cap_share["Market cap share (%)"] = (
            market_cap_share["Market cap (USD bn)"]
            / market_cap_share["Year total"]
            * 100
        )
        for entity in ALL_ENTITIES:
            if entity not in selected and not retain_unselected:
                continue
            subset = market_cap_share[
                market_cap_share["Organization"] == entity
            ].sort_values("Year")
            if subset.empty:
                continue
            market_cap_share_visible = True
            figure.add_trace(
                go.Bar(
                    x=subset["Year"],
                    y=subset["Market cap share (%)"],
                    name=entity,
                    legendgroup=entity,
                    showlegend=False,
                    marker={"color": COLORS[entity]},
                    opacity=1 if entity in selected else UNSELECTED_OPACITY,
                    customdata=[
                        [
                            entity,
                            int(row.Year),
                            float(row["Market cap (USD bn)"]),
                            float(row["Market cap share (%)"]),
                        ]
                        for _, row in subset.iterrows()
                    ],
                    hovertemplate=(
                        "%{customdata[0]}<br>%{x}"
                        "<br>Market cap: $%{customdata[2]:,.1f}B"
                        "<br>Share of all listed companies shown: %{customdata[3]:.1f}%"
                        "<extra></extra>"
                    ),
                ),
                row=2,
                col=1,
            )
    if not market_cap_share_visible:
        _empty(
            figure,
            "No market-cap values for this selection.",
            row=2,
            col=1,
        )

    revenue_composition = revenue[["Organization", "Year", "Revenue (USD bn)"]].copy()
    revenue_share_visible = False
    if not revenue_composition.empty:
        revenue_composition["Year total"] = revenue_composition.groupby("Year")[
            "Revenue (USD bn)"
        ].transform("sum")
        revenue_composition["Revenue share (%)"] = (
            revenue_composition["Revenue (USD bn)"]
            / revenue_composition["Year total"]
            * 100
        )
        for entity in ALL_ENTITIES:
            if entity not in selected and not retain_unselected:
                continue
            subset = revenue_composition[
                revenue_composition["Organization"] == entity
            ].sort_values("Year")
            if subset.empty:
                continue
            revenue_share_visible = True
            figure.add_trace(
                go.Bar(
                    x=subset["Year"],
                    y=subset["Revenue share (%)"],
                    name=entity,
                    legendgroup=entity,
                    showlegend=False,
                    marker={"color": COLORS[entity]},
                    opacity=1 if entity in selected else UNSELECTED_OPACITY,
                    customdata=[
                        [
                            entity,
                            int(row.Year),
                            float(row["Revenue (USD bn)"]),
                            float(row["Revenue share (%)"]),
                        ]
                        for _, row in subset.iterrows()
                    ],
                    hovertemplate=(
                        "%{customdata[0]}<br>Fiscal year-end: %{x}"
                        "<br>Revenue: $%{customdata[2]:,.1f}B"
                        "<br>Share of all listed companies shown: %{customdata[3]:.1f}%"
                        "<extra></extra>"
                    ),
                ),
                row=2,
                col=2,
            )
    if not revenue_share_visible:
        _empty(
            figure,
            "No revenue share for this selection.",
            row=2,
            col=2,
        )

    figure.update_layout(
        template="plotly_white",
        autosize=True,
        margin={"l": 58, "r": 14, "t": 48, "b": 34},
        font={"family": FONT, "color": TEXT},
        showlegend=False,
        hovermode="closest",
        barmode="stack",
        dragmode="select",
        selectionrevision=selection_revision,
    )
    figure.update_yaxes(
        title_text="Market cap (USD bn)",
        gridcolor=GRID,
        zeroline=False,
        row=1,
        col=1,
    )
    figure.update_yaxes(
        title_text="Annual revenue (USD bn)",
        gridcolor=GRID,
        zeroline=False,
        row=1,
        col=2,
    )
    figure.update_yaxes(
        ticksuffix="%",
        range=[0, 100] if retain_unselected else None,
        gridcolor=GRID,
        row=2,
        col=1,
        title_text=None,
    )
    figure.update_yaxes(
        ticksuffix="%",
        range=[0, 100] if retain_unselected else None,
        gridcolor=GRID,
        row=2,
        col=2,
        title_text=None,
    )
    figure.update_xaxes(
        tickmode="array",
        tickvals=[f"{year}-01-01" for year in years],
        ticktext=[str(year) for year in years],
        range=[f"{start_year}-01-01", f"{end_year}-12-31"],
        showgrid=False,
        row=1,
        col=1,
    )
    for row, col in ((1, 2), (2, 1), (2, 2)):
        figure.update_xaxes(
            tickmode="array",
            tickvals=years,
            ticktext=[str(year) for year in years],
            range=[start_year - 0.4, end_year + 0.4],
            showgrid=False,
            row=row,
            col=col,
        )
    figure.update_annotations(font={"size": 13, "color": TEXT})
    return figure


def _lab_revenue_figure(
    start_year: int,
    end_year: int,
    selected: set[str],
    retain_unselected: bool,
    axis_scale: str,
) -> go.Figure:
    frame = DATA["lab_revenue"]
    frame = frame[
        frame["Year"].between(start_year, end_year)
    ].sort_values("Date")
    figure = go.Figure()
    visible = False
    for entity in ALL_ENTITIES:
        if entity not in selected and not retain_unselected:
            continue
        subset = frame[frame["Organization"] == entity]
        if subset.empty:
            continue
        visible = True
        figure.add_trace(
            go.Scatter(
                x=subset["Date"],
                y=subset["Revenue run rate (USD bn)"],
                name=entity,
                legendgroup=entity,
                showlegend=True,
                mode="lines+markers",
                marker={"size": 7},
                line={"color": COLORS[entity], "width": 2.4},
                opacity=1 if entity in selected else UNSELECTED_OPACITY,
                customdata=[
                    _hover_entity_year(entity, year) for year in subset["Year"]
                ],
                hovertemplate=(
                    "%{customdata[0]}<br>Reported: %{x|%Y-%m-%d}"
                    "<br>Annualized revenue run rate: $%{y:,.2f}B"
                    "<extra></extra>"
                ),
            )
        )
    figure.update_layout(
        template="plotly_white",
        autosize=True,
        margin={"l": 56, "r": 10, "t": 18, "b": 18},
        font={"family": FONT, "color": TEXT},
        showlegend=False,
        hovermode="closest",
        dragmode="select",
    )
    if not visible:
        message = (
            "AI Lab Revenue Run Rate shows AI-lab data.<br>"
            "Select an AI lab or keep unselected data to compare."
            if not selected.intersection(GROUPS["AI labs"])
            else "No reported lab revenue snapshots for the selected organizations and years."
        )
        _empty(figure, message)
        figure.update_xaxes(visible=False, fixedrange=True)
        figure.update_yaxes(visible=False, fixedrange=True)
        return figure

    figure.update_xaxes(
        range=[f"{start_year}-01-01", f"{end_year}-12-31"],
        tickmode="array",
        tickvals=[f"{year}-01-01" for year in range(start_year, end_year + 1)],
        ticktext=[str(year) for year in range(start_year, end_year + 1)],
        tickfont={"size": 8},
        showgrid=False,
    )
    figure.update_yaxes(
        title_text="Run rate<br>(USD bn)",
        automargin=True,
        title_standoff=5,
        type=axis_scale,
        **(
            {
                "tickmode": "array",
                "tickvals": [0.01, 0.1, 1, 10, 50],
                "ticktext": ["0.01", "0.1", "1", "10", "50"],
            }
            if axis_scale == "log"
            else {"rangemode": "tozero"}
        ),
        gridcolor=GRID,
        zeroline=False,
    )
    return figure


def _series_legend_items(figure: go.Figure) -> list[Any]:
    items = []
    seen: set[str] = set()
    for trace in figure.data:
        if not trace.showlegend or trace.name in seen:
            continue
        seen.add(trace.name)
        color = trace.line.color or COLORS[trace.name]
        items.append(
            html.Div(
                [
                    html.Span(
                        [
                            html.Span(className="series-legend-line"),
                            html.Span(className="series-legend-point"),
                        ],
                        className="series-legend-symbol",
                        style={"color": color},
                    ),
                    html.Span(trace.name),
                ],
                className="series-legend-item",
                style={"color": TEXT, "opacity": trace.opacity or 1},
            )
        )
    return items


def _revenue_comparison_figure(
    end_year: int,
    selected: set[str],
    retain_unselected: bool,
) -> go.Figure:
    companies = (
        DATA["public_revenue"][DATA["public_revenue"]["Year"] <= end_year]
        .sort_values(["Organization", "Year"])
        .groupby("Organization", as_index=False)
        .tail(1)
        .sort_values("Organization")
    )
    labs = (
        DATA["lab_revenue"][DATA["lab_revenue"]["Year"] <= end_year]
        .sort_values(["Organization", "Date"])
        .groupby("Organization", as_index=False)
        .tail(1)
        .sort_values("Organization")
    )
    groups = [
        (
            "Public Tech Giants",
            [
                (
                    row["Organization"],
                    float(row["Revenue (USD bn)"]),
                    int(row["Year"]),
                    f"SEC fiscal-year revenue, FY{int(row['Year'])}",
                )
                for _, row in companies.iterrows()
            ],
        ),
        (
            "Independent AI Labs",
            [
                (
                    row["Organization"],
                    float(row["Revenue run rate (USD bn)"]),
                    row["Date"].strftime("%Y-%m-%d"),
                    f"Annualized run rate reported {row['Date']:%Y-%m-%d}",
                )
                for _, row in labs.iterrows()
            ],
        ),
    ]
    if not retain_unselected:
        groups = [
            (
                group_name,
                [item for item in items if item[0] in selected],
            )
            for group_name, items in groups
        ]
    has_visible_public_companies = any(
        items for group_name, items in groups if group_name == "Public Tech Giants"
    )
    has_visible_labs = any(
        items for group_name, items in groups if group_name == "Independent AI Labs"
    )
    grand_total = sum(value for _, items in groups for _, value, _, _ in items)
    figure = go.Figure()
    if grand_total <= 0:
        _empty(figure, f"No revenue snapshots available by {end_year}.")
    else:
        tile_width = (
            0.70
            if retain_unselected or has_visible_public_companies and has_visible_labs
            else 1.0
            if has_visible_public_companies
            else 0.55
        )
        tile_bottom = 0.03
        tile_height = 0.92
        x_cursor = 0.0
        lab_callouts: list[tuple[str, float, float, str, float, bool]] = []
        for group_name, items in groups:
            items = [
                item
                for item in items
                if retain_unselected or item[0] in selected
            ]
            if not items:
                continue
            group_total = sum(value for _, value, _, _ in items)
            if group_total <= 0:
                continue
            group_width = tile_width * group_total / grand_total
            y_cursor = tile_bottom
            for entity, value, reported_period, metric in items:
                height = tile_height * value / group_total
                y0 = y_cursor
                y1 = y_cursor + height
                x0 = x_cursor
                x1 = x_cursor + group_width
                opacity = 1 if entity in selected else UNSELECTED_OPACITY
                figure.add_trace(
                    go.Bar(
                        x=[(x0 + x1) / 2],
                        y=[height],
                        base=[y0],
                        width=[group_width],
                        orientation="v",
                        name=entity,
                        legendgroup=entity,
                        marker={
                            "color": COLORS[entity],
                            "line": {"color": "white", "width": 1.5},
                        },
                        opacity=opacity,
                        customdata=[[entity, end_year, value, reported_period, metric]],
                        hovertemplate=(
                            "%{customdata[0]}<br>%{customdata[4]}"
                            "<br>Revenue: $%{customdata[2]:,.2f}B"
                            "<extra></extra>"
                        ),
                    )
                )
                if group_name == "Public Tech Giants":
                    if height >= 0.09 and group_width >= 0.4:
                        figure.add_annotation(
                            x=(x0 + x1) / 2,
                            y=(y0 + y1) / 2,
                            text=entity,
                            showarrow=False,
                            font={"size": 9, "color": "white"},
                            align="center",
                            opacity=opacity,
                        )
                else:
                    lab_callouts.append(
                        (
                            entity,
                            (x0 + x1) / 2,
                            (y0 + y1) / 2,
                            entity,
                            opacity,
                            entity in selected,
                        )
                    )
                y_cursor = y1
            x_cursor += group_width

        lab_callouts.sort(key=lambda item: item[2])
        callout_positions = (
            [0.5]
            if len(lab_callouts) == 1
            else [
                0.08 + index * 0.84 / (len(lab_callouts) - 1)
                for index in range(len(lab_callouts))
            ]
        )
        for (entity, target_x, target_y, label, opacity, is_selected), label_y in zip(
            lab_callouts, callout_positions
        ):
            callout_x = min(tile_width + 0.03, 0.76)
            figure.add_annotation(
                x=target_x,
                y=target_y,
                xref="x",
                yref="y",
                ax=callout_x,
                ay=label_y,
                axref="x",
                ayref="y",
                text=label,
                showarrow=True,
                arrowhead=0,
                arrowwidth=1,
                arrowcolor=COLORS[entity],
                font={
                    "size": 10,
                    "color": TEXT,
                },
                align="left",
                xanchor="left",
                opacity=opacity,
            )
    figure.add_annotation(
        x=0.01,
        y=1.08,
        xref="paper",
        yref="paper",
        text=f"Year = Max Year = {end_year}",
        showarrow=False,
        xanchor="left",
        yanchor="bottom",
        font={"size": 10, "color": MUTED},
    )
    figure.update_layout(
        template="plotly_white",
        autosize=True,
        margin={"l": 2, "r": 2, "t": 38, "b": 8},
        font={"family": FONT, "color": TEXT},
        hovermode="closest",
        dragmode="select",
        barmode="overlay",
        showlegend=False,
    )
    figure.update_xaxes(
        range=[0, 1],
        visible=False,
        fixedrange=True,
    )
    figure.update_yaxes(
        range=[0, 1],
        visible=False,
        fixedrange=True,
    )
    return figure


def _eto_figure(
    start_year: int,
    end_year: int,
    selected: set[str],
    retain_unselected: bool,
) -> go.Figure:
    chart_start = min(start_year, 2025)
    chart_end = max(chart_start, min(end_year, 2025))
    years = list(range(chart_start, chart_end + 1))
    frame = DATA["publications"]
    frame = frame[
        frame["Year"].between(start_year, min(end_year, 2025))
    ].sort_values(["Organization", "Year"])
    figure = go.Figure()
    visible = False
    for entity in ALL_ENTITIES:
        subset = frame[frame["Organization"] == entity]
        if subset.empty or (entity not in selected and not retain_unselected):
            continue
        visible = True
        opacity = 1 if entity in selected else UNSELECTED_OPACITY
        by_year = subset.set_index("Year")
        for first_year, second_year, dash in (
            (2023, 2024, "solid"),
            (2024, 2025, "dash"),
        ):
            if first_year in by_year.index and second_year in by_year.index:
                segment = by_year.loc[[first_year, second_year]]
                figure.add_trace(
                    go.Scatter(
                        x=segment.index,
                        y=segment["Value"],
                        name=entity,
                        legendgroup=entity,
                        showlegend=False,
                        mode="lines",
                        line={"color": COLORS[entity], "width": 2.4, "dash": dash},
                        opacity=opacity,
                        hoverinfo="skip",
                    )
                )
        figure.add_trace(
            go.Scatter(
                x=subset["Year"],
                y=subset["Value"],
                name=entity,
                legendgroup=entity,
                showlegend=False,
                mode="markers",
                marker={
                    "size": 7,
                    "color": [
                        COLORS[entity] if complete else "white"
                        for complete in subset["Complete"]
                    ],
                    "line": {"color": COLORS[entity], "width": 2},
                    "symbol": "circle",
                },
                opacity=opacity,
                customdata=[
                    [entity, int(row.Year), "Complete" if complete else "Incomplete"]
                    for (_, row), complete in zip(
                        subset.iterrows(), subset["Complete"]
                    )
                ],
                hovertemplate=(
                    "%{customdata[0]}<br>%{x}: %{y:,} ETO-recorded publications"
                    "<br>Source status: %{customdata[2]}"
                    "<extra></extra>"
                ),
            )
        )
        figure.add_trace(
            go.Scatter(
                x=[chart_start, chart_end],
                y=[None, None],
                name=entity,
                legendgroup=entity,
                mode="lines+markers",
                line={"color": COLORS[entity], "width": 2.4},
                marker={"size": 7, "color": COLORS[entity]},
                opacity=opacity,
                showlegend=True,
                hoverinfo="skip",
            )
        )
    if not visible:
        _empty(
            figure,
            "No ETO AI-publication records for the selected organizations and years.",
        )
    figure.update_layout(
        template="plotly_white",
        autosize=True,
        margin={"l": 58, "r": 12, "t": 24, "b": 24},
        font={"family": FONT, "color": TEXT},
        showlegend=False,
        hovermode="closest",
        dragmode="select",
    )
    figure.update_xaxes(
        tickmode="array",
        tickvals=years,
        ticktext=[str(year) for year in years],
        range=[chart_start - 0.25, chart_end + 0.25],
        showgrid=False,
    )
    figure.update_yaxes(
        title_text="Publications",
        gridcolor=GRID,
        zeroline=False,
    )
    return figure


def build_figures(
    start_year: int,
    end_year: int,
    selected_entities: list[str] | None,
    selection_revision: int = 0,
    retain_unselected: bool = True,
    lab_revenue_scale: str = "linear",
) -> dict[str, go.Figure]:
    if not START_YEAR <= start_year <= end_year <= END_YEAR:
        raise ValueError(f"Select a year range within {START_YEAR}–{END_YEAR}.")
    if lab_revenue_scale not in ("log", "linear"):
        raise ValueError("AI-lab revenue scale must be either 'log' or 'linear'.")
    selected = set(ALL_ENTITIES if selected_entities is None else selected_entities)
    retain_unselected = retain_unselected or selected == set(ALL_ENTITIES)
    figures = {
        "scale": _scale_figure(
            start_year, end_year, selected, retain_unselected
        ),
        "lab-revenue": _lab_revenue_figure(
            start_year, end_year, selected, retain_unselected, lab_revenue_scale
        ),
        "revenue-comparison": _revenue_comparison_figure(
            end_year, selected, retain_unselected
        ),
        "eto": _eto_figure(
            start_year, end_year, selected, retain_unselected
        ),
    }
    for figure in figures.values():
        figure.update_layout(selectionrevision=selection_revision)
    return figures


def update_organization_options(
    group: str, current_selection: list[str] | None
) -> tuple[list[dict[str, str]], list[str]]:
    entities = ALL_ENTITIES if group == "All" else GROUPS[group]
    current = set(current_selection or [])
    selection = (
        entities.copy()
        if group == "All"
        else [entity for entity in entities if entity in current] or entities.copy()
    )
    return ([{"label": item, "value": item} for item in entities], selection)


def _normalize_year_inputs(
    min_value: int | float | None,
    max_value: int | float | None,
    triggered: str | None,
) -> list[int]:
    def bounded_year(value: int | float | None, fallback: int) -> int:
        try:
            year = int(value) if value is not None else fallback
        except (OverflowError, TypeError, ValueError):
            year = fallback
        return max(START_YEAR, min(year, END_YEAR))

    start_year = bounded_year(min_value, START_YEAR)
    end_year = bounded_year(max_value, END_YEAR)
    if start_year > end_year:
        if triggered == "year-min":
            end_year = start_year
        else:
            start_year = end_year
    return [start_year, end_year]


def _extract_point(point: dict[str, Any]) -> str | None:
    custom = point.get("customdata")
    if isinstance(custom, str):
        try:
            custom = json.loads(custom)
        except json.JSONDecodeError:
            custom = None
    if not isinstance(custom, (list, tuple)):
        return None
    return custom[0] if isinstance(custom[0], str) else None


def _controls_from_chart_data(
    event_data: dict[str, Any] | None,
    fallback_group: str,
    fallback_years: list[int],
    fallback_entities: list[str] | None = None,
) -> tuple[str, list[str], list[int]]:
    points = (event_data or {}).get("points", [])
    entities: set[str] = set()
    for point in points:
        entity = _extract_point(point)
        if entity in ALL_ENTITIES:
            entities.add(entity)
    selected = [entity for entity in ALL_ENTITIES if entity in entities]
    if not selected:
        selected = list(
            fallback_entities
            or (
                ALL_ENTITIES
                if fallback_group == "All"
                else GROUPS[fallback_group]
            )
        )
    selected_groups = {GROUP_BY_ENTITY[entity] for entity in selected}
    group = next(iter(selected_groups)) if len(selected_groups) == 1 else "All"
    years_range = list(map(int, fallback_years))
    return group, selected, years_range


def _filter_snapshot(
    group: str, organizations: list[str], years: list[int]
) -> dict[str, Any]:
    return {
        "group": group,
        "organizations": list(organizations),
        "years": list(map(int, years)),
    }


def _restore_chart_snapshot(
    state: dict[str, Any], graph_id: str
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    snapshots = dict(state.get("snapshots", {}))
    snapshot = snapshots.get(graph_id)
    if snapshot is not None:
        snapshots.clear()
    state["snapshots"] = snapshots
    state["selection_revision"] = int(state.get("selection_revision", 0)) + 1
    return state, snapshot


def _handle_chart_selection(
    state: dict[str, Any],
    graph_id: str,
    event_data: dict[str, Any] | None,
    group: str,
    organizations: list[str],
    years: list[int],
) -> tuple[dict[str, Any], str, list[str], list[int]]:
    snapshots = dict(state.get("snapshots", {}))
    snapshots.setdefault(
        graph_id,
        _filter_snapshot(group, organizations, years),
    )
    state["snapshots"] = snapshots
    if event_data and event_data.get("points"):
        group, organizations, years = _controls_from_chart_data(
            event_data, group, years, organizations
        )
    return state, group, organizations, years


app = Dash(__name__, title="Chapter 2 | Divergence", requests_pathname_prefix="/dashboard/ch2/", routes_pathname_prefix="/")
app.layout = html.Div(
    [
        html.Header(
            [
                html.Div(
                    [
                        html.Div(
                            "COMP7507 · GROUP 3 · CHAPTER 2",
                            className="eyebrow",
                        ),
                        html.H1(
                            "Big companies and AI labs are on different tracks",
                            className="page-title",
                        ),
                        html.P(
                            "Compare public-company market capitalization, revenue, AI-lab revenue "
                            "run rates, and academic output across 2023–2026.",
                            className="subtitle",
                        ),
                    ],
                    className="hero-copy",
                ),
                html.Section(
                    [
                        html.Div(
                            "HOW TO USE THIS DASHBOARD",
                            className="usage-label",
                        ),
                        html.P(
                            [
                                "The filters apply to every chart. Click a data mark "
                                "to focus its organization, or drag with the left mouse "
                                "button to select multiple organizations. The year range "
                                "is controlled only by the year filter. ",
                                html.Strong(
                                    "Each chart's Clear selection button restores the filters "
                                    "from before that chart's first selection."
                                ),
                                " Clear all filters restores all organizations and 2023–2026.",
                            ],
                            className="usage-copy",
                        ),
                    ],
                    className="usage-card",
                ),
            ],
            className="hero",
        ),
        html.Div(
            [
                html.Aside(
                    [
                        html.Section(
                            [
                                html.Div(
                                    [
                                        html.Label(
                                            "Compare group",
                                            htmlFor="group-filter",
                                            className="filter-title",
                                        ),
                                        dcc.Dropdown(
                                            id="group-filter",
                                            options=[
                                                {"label": value, "value": value}
                                                for value in ("All", "Big companies", "AI labs")
                                            ],
                                            value="All",
                                            clearable=False,
                                        ),
                                    ],
                                    className="filter-control filter-block",
                                ),
                                html.Div(
                                    [
                                        html.Label(
                                            "Organizations",
                                            htmlFor="organization-filter",
                                            className="filter-title",
                                        ),
                                        dcc.Dropdown(
                                            id="organization-filter",
                                            options=[
                                                {"label": item, "value": item}
                                                for item in ALL_ENTITIES
                                            ],
                                            value=ALL_ENTITIES,
                                            multi=True,
                                            clearable=False,
                                        ),
                                    ],
                                    className="filter-control filter-block organization-filter",
                                ),
                                html.Div(
                                    [
                                        html.Label("Year range", className="filter-title"),
                                        html.Div(
                                            [
                                                html.Div(
                                                    [
                                                        html.Label("Min", htmlFor="year-min"),
                                                        dcc.Input(
                                                            id="year-min",
                                                            type="number",
                                                            min=START_YEAR,
                                                            max=END_YEAR,
                                                            step=1,
                                                            value=START_YEAR,
                                                        ),
                                                    ],
                                                    className="year-input-control",
                                                ),
                                                html.Div(
                                                    [
                                                        html.Label("Max", htmlFor="year-max"),
                                                        dcc.Input(
                                                            id="year-max",
                                                            type="number",
                                                            min=START_YEAR,
                                                            max=END_YEAR,
                                                            step=1,
                                                            value=END_YEAR,
                                                        ),
                                                    ],
                                                    className="year-input-control",
                                                ),
                                            ],
                                            className="year-filter-stack",
                                        ),
                                    ],
                                    className="filter-control filter-block year-filter",
                                ),
                                html.Div(
                                    [
                                        html.Label(
                                            "Visibility",
                                            htmlFor="retain-unselected",
                                            className="filter-title",
                                        ),
                                        dcc.Checklist(
                                            id="retain-unselected",
                                            options=[
                                                {
                                                    "label": "Keep unselected data (greyed out)",
                                                    "value": "keep",
                                                }
                                            ],
                                            value=["keep"],
                                            className="retain-unselected",
                                        ),
                                    ],
                                    className="filter-control filter-block",
                                ),
                                html.Div(
                                    [
                                        html.Button(
                                            "Clear all filters",
                                            id="clear-all",
                                            n_clicks=0,
                                            className="clear-button global-clear",
                                        ),
                                        html.Div(
                                            id="selection-summary",
                                            className="selection-summary",
                                        ),
                                    ],
                                    className="filter-actions filter-block",
                                ),
                            ],
                            className="filter-panel",
                        ),
                        dcc.Store(
                            id="interaction-state",
                            storage_type="memory",
                            data={"snapshots": {}, "selection_revision": 0},
                        ),
                    ],
                    className="filter-sidebar",
                ),
                html.Main(
                    [
        html.Section(
            [
                html.Div(
                    [
                        html.Div(
                            [
                                html.H2("Scale Change", className="module-title"),
                                html.Button(
                                    "Clear selection",
                                    id="clear-scale",
                                    n_clicks=0,
                                    className="clear-button",
                                ),
                            ],
                            className="section-heading",
                        ),
                        dcc.Graph(
                            id="scale-graph",
                            className="chart-graph",
                            config={
                                "displayModeBar": False,
                                "responsive": True,
                            },
                            style={"height": "100%"},
                        ),
                        html.Div(
                            id="scale-legend",
                            className="chart-legend bottom-chart-legend",
                        ),
                        html.P(
                            "Market cap is monthly closing price multiplied by historical "
                            "shares outstanding; stacked share bars compare all listed companies "
                            "shown. Revenue uses SEC fiscal-year values and its share bars use "
                            "the same all-listed-company denominator.",
                            className="chart-note",
                        ),
                    ],
                    className="chart-card scale-chart-card",
                ),
                html.Div(
                    [
                html.Div(
                    [
                        html.Div(
                            [
                                html.H2(
                                    "AI Lab Revenue Run Rate",
                                    className="module-title lab-revenue-title",
                                ),
                                html.Button(
                                    "Clear selection",
                                    id="clear-lab-revenue",
                                    n_clicks=0,
                                    className="clear-button",
                                ),
                            ],
                            className="section-heading",
                        ),
                        html.Div(
                            [
                                html.Label(
                                    "Y-axis",
                                    htmlFor="lab-revenue-axis-scale",
                                ),
                                dcc.RadioItems(
                                    id="lab-revenue-axis-scale",
                                    options=[
                                        {"label": "Log", "value": "log"},
                                        {"label": "Linear", "value": "linear"},
                                    ],
                                    value="linear",
                                    inline=True,
                                    className="axis-scale-options",
                                ),
                            ],
                            className="axis-scale-control",
                        ),
                        dcc.Graph(
                            id="lab-revenue-graph",
                            className="chart-graph",
                            config={
                                "displayModeBar": False,
                                "responsive": True,
                            },
                            style={"height": "100%"},
                        ),
                        html.Div(
                            id="lab-revenue-legend",
                            className="chart-legend ai-revenue-legend",
                        ),
                        html.P(
                            "Unaudited run rates; lines connect reported snapshots.",
                            className="chart-note",
                        ),
                    ],
                    className="chart-card lab-revenue-card",
                ),
                html.Div(
                    [
                        html.Div(
                            [
                                html.H2(
                                    "Revenue Scale",
                                    className="module-title",
                                ),
                                html.Button(
                                    "Clear selection",
                                    id="clear-revenue-comparison",
                                    n_clicks=0,
                                    className="clear-button",
                                ),
                            ],
                            className="section-heading",
                        ),
                        dcc.Graph(
                            id="revenue-comparison-graph",
                            className="chart-graph",
                            config={
                                "displayModeBar": False,
                                "responsive": True,
                            },
                            style={"height": "100%"},
                        ),
                        html.P(
                            "Latest values; SEC revenue and lab run rates differ.",
                            className="chart-note",
                        ),
                    ],
                    className="chart-card",
                ),
                    ],
                    className="comparison-grid",
                ),
                html.Div(
                    [
                        html.Div(
                            [
                                html.H2("Academic Output", className="module-title"),
                                html.Button(
                                    "Clear selection",
                                    id="clear-eto",
                                    n_clicks=0,
                                    className="clear-button",
                                ),
                            ],
                            className="section-heading",
                        ),
                        dcc.Graph(
                            id="eto-graph",
                            className="chart-graph",
                            config={
                                "displayModeBar": False,
                                "responsive": True,
                            },
                            style={"height": "100%"},
                        ),
                        html.Div(
                            id="eto-legend",
                            className="chart-legend bottom-chart-legend",
                        ),
                        html.P(
                            "Shows 2023–2025; the 2024–2025 segment is dashed. Open marks "
                            "indicate incomplete source records. A recorded zero is not proof "
                            "of no research.",
                            className="chart-note",
                        ),
                    ],
                    className="chart-card academic-card",
                ),
            ],
            className="section-stack",
        ),
                    ],
                    className="dashboard-main",
                ),
            ],
            className="dashboard-shell",
        ),
    ],
    className="page",
)

app.index_string = """<!DOCTYPE html>
<html>
    <head>
        {%metas%}
        <title>{%title%}</title>
        {%favicon%}
        {%css%}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap">
        <style>
            * { box-sizing: border-box; }
            html, body { width: 100%; height: 100%; overflow: hidden; }
            body { margin: 0; background: #f7f8f4; color: #173c39; font-family: "DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
            .page { width: min(100%, 1720px); height: 100vh; height: 100dvh; margin: 0 auto; padding: 12px 16px; display: flex; flex-direction: column; overflow: hidden; }
            .hero { display: grid; grid-template-columns: minmax(96px, 7.5vw) minmax(0, 1.12fr) minmax(0, 1fr); align-items: stretch; gap: 12px; flex: 0 0 auto; padding: 3px 2px 8px; border-bottom: 1px solid #dbe4db; }
            .hero-copy { align-self: center; min-width: 0; }
            .hero-copy { grid-column: 1 / span 2; }
            .eyebrow { color: #33856c; font-size: 10px; font-weight: 750; letter-spacing: .13em; }
            .page-title { margin: 4px 0 3px; color: #173c39; font-size: clamp(20px, 2.2vw, 30px); line-height: 1.08; }
            .subtitle { margin: 0; color: #60786e; font-size: 11px; line-height: 1.35; }
            .usage-card { grid-column: 3; align-self: center; padding: 9px 11px; border-left: 3px solid #3b9d7e; border-radius: 8px; background: white; }
            .usage-label { color: #71877c; font-size: 9px; font-weight: 750; letter-spacing: .1em; }
            .usage-copy { margin: 4px 0 0; color: #4d635b; font-size: 10px; line-height: 1.4; }
            .dashboard-shell { display: grid; grid-template-columns: minmax(205px, 18vw) minmax(0, 1fr); gap: 12px; flex: 1 1 auto; min-height: 0; margin-top: 8px; }
            .filter-sidebar { display: flex; flex-direction: column; gap: 8px; height: 100%; min-height: 0; overflow-y: auto; padding-right: 2px; }
            .filter-panel { display: flex; flex: 1 1 auto; flex-direction: column; gap: 9px; height: 100%; min-height: 0; padding: 12px 10px; border: 1px solid #dbe4db; border-radius: 10px; background: white; }
            .filter-control { min-width: 0; }
            .filter-block { flex: 0 0 auto; }
            .filter-title { display: block; margin-bottom: 6px; color: #173c39 !important; font-size: clamp(12px, 1.1vw, 16px) !important; line-height: 1.15; font-weight: 700 !important; }
            .filter-control .Select-control { border-color: #dbe4db; border-radius: 7px; }
            .filter-control .Select-placeholder, .filter-control .Select-value-label { color: #4d635b; font-size: 12px; }
            .filter-control .Select-value { display: block !important; float: none !important; flex: 0 0 auto; max-width: 100%; white-space: normal; background: #edf3eb; border: 1px solid #dbe4db; border-radius: 4px; }
            .organization-filter { flex: 0 0 auto; min-height: 0; }
            .organization-filter .Select { height: auto !important; }
            .organization-filter .Select-control { height: auto !important; min-height: 132px; }
            .organization-filter .Select-multi-value-wrapper { display: block; max-height: 124px; max-width: calc(100% - 24px); overflow-x: hidden; overflow-y: auto; white-space: normal; }
            .year-filter { padding: 0; }
            .year-filter-stack { display: grid; grid-template-columns: minmax(0, 1fr); gap: 5px; }
            .year-input-control { display: grid; grid-template-columns: 30px minmax(0, 1fr); align-items: center; gap: 6px; }
            .year-input-control label { margin: 0; color: #4d635b; font-size: 12px; font-weight: 500; }
            .year-input-control input { width: 100%; min-width: 0; padding: 5px 6px; border: 1px solid #dbe4db; border-radius: 6px; color: #4d635b; font: inherit; font-size: 12px; }
            .retain-unselected label { display: flex; align-items: flex-start; gap: 6px; color: #4d635b; font-size: 12px; line-height: 1.3; font-weight: 400; }
            .retain-unselected input { margin: 0; }
            .filter-actions { display: flex; flex: 0 0 auto; flex-direction: column; gap: 8px; }
            .global-clear { align-self: flex-start; }
            .selection-summary { color: #71877c; font-size: 12px; line-height: 1.35; }
            .dashboard-main, .section-stack { min-width: 0; min-height: 0; height: 100%; }
            .section-stack { display: grid; grid-template-columns: minmax(0, 1.12fr) minmax(0, 1fr); grid-template-rows: repeat(2, minmax(0, 1fr)); gap: 10px; }
            .scale-chart-card { grid-column: 1; grid-row: 1 / span 2; }
            .comparison-grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, .9fr); grid-column: 2; grid-row: 1; min-width: 0; min-height: 0; gap: 8px; }
            .academic-card { grid-column: 2; grid-row: 2; }
            .chart-card { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; padding: 7px 8px 4px; border: 1px solid #dbe4db; border-radius: 9px; background: white; container-type: inline-size; }
            .section-heading { display: flex; flex: 0 0 auto; justify-content: space-between; align-items: center; gap: 6px; margin: 0 4px; }
            .module-title { margin: 0; color: #173c39; font-size: clamp(12px, 1.1vw, 16px); line-height: 1.15; }
            .lab-revenue-title { white-space: nowrap; }
            .axis-scale-control { display: flex; flex: 0 0 auto; align-items: center; gap: 6px; margin: 3px 4px 0; color: #4d635b; font-size: 9px; }
            .axis-scale-options { display: flex; gap: 8px; }
            .axis-scale-options label { display: inline-flex; align-items: center; gap: 3px; margin: 0; white-space: nowrap; }
            .axis-scale-options input { margin: 0; }
            .clear-button { padding: 5px 7px; border: 1px solid #c7d9cc; border-radius: 6px; background: #fff; color: #4d635b; cursor: pointer; font-size: 9px; font-weight: 650; white-space: normal; }
            .clear-button:hover { background: #edf3eb; }
            .global-clear { justify-self: start; }
            .chart-graph { flex: 1 1 auto; min-height: 0; width: 100%; }
            .chart-graph .js-plotly-plot, .chart-graph .plot-container { width: 100% !important; height: 100% !important; }
            .chart-legend { display: flex; flex: 0 0 auto; flex-wrap: wrap; justify-content: center; align-items: center; gap: 4px 8px; min-height: 20px; margin: 0 4px; color: #4d635b; font-family: "DM Sans", -apple-system, BlinkMacSystemFont, sans-serif; font-size: 11px; line-height: 1.2; white-space: nowrap; }
            .bottom-chart-legend { margin-bottom: 9px; }
            .series-legend-item { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 4px; color: inherit; }
            .series-legend-symbol { position: relative; display: inline-block; flex: 0 0 30px; width: 30px; height: 10px; color: inherit; }
            .series-legend-line { position: absolute; top: 4px; right: 0; left: 0; height: 2px; background: currentColor; }
            .series-legend-point { position: absolute; top: 1px; left: 11px; width: 8px; height: 8px; border: 0; border-radius: 50%; background: currentColor; }
            .ai-revenue-legend { display: grid; grid-template-columns: repeat(3, max-content); justify-content: space-around; }
            .chart-note { flex: 0 0 auto; max-height: 30px; overflow: hidden; margin: 1px 5px 2px; color: #71877c; font-size: 9px; line-height: 1.3; }
            .hero { background: #173c39; border-bottom: 0; border-radius: 10px; padding: 13px 15px; }
            .hero .eyebrow { color: #9bd0b2; }
            .hero .page-title { color: #f2f8f2; }
            .hero .subtitle { color: #c2d8ca; }
            .usage-card { background: #244d43; border-left-color: #71bd96; }
            .usage-label { color: #a7d2b6; }
            .usage-copy { color: #e0eee3; }
            .filter-control .Select-control:hover, .filter-control .Select-control.is-focused { border-color: #6fb18e; }
            .clear-button:hover { background: #eaf3e9; }
            @media (max-width: 980px) {
                .page { padding: 9px 10px; }
                .dashboard-shell { grid-template-columns: minmax(175px, 19vw) minmax(0, 1fr); gap: 8px; }
                .section-stack { grid-template-columns: minmax(0, .95fr) minmax(0, 1.05fr); gap: 7px; }
                .comparison-grid { grid-template-columns: minmax(0, 1.1fr) minmax(0, .9fr); gap: 6px; }
                .chart-card { padding: 5px 6px 3px; }
                .chart-note { font-size: 8px; }
                .hero { grid-template-columns: minmax(88px, 110px) minmax(0, .95fr) minmax(0, 1.05fr); gap: 8px; }
            }
            @media (max-width: 700px) {
                html, body { height: auto; overflow: auto; }
                .page { height: auto; min-height: 100dvh; overflow: visible; }
                .hero { grid-template-columns: minmax(0, 1fr); gap: 6px; }
                .hero-copy, .usage-card { grid-column: 1; }
                .usage-card { padding: 5px 8px; }
                .usage-copy { font-size: 9px; }
                .dashboard-shell { display: block; }
                .filter-sidebar { height: auto; max-height: none; overflow: visible; }
                .filter-panel { height: auto; gap: 8px; padding: 10px; }
                .organization-filter .Select-control { min-height: 100px; }
                .organization-filter .Select-multi-value-wrapper { max-height: 95px; }
                .dashboard-main { height: auto; margin-top: 10px; }
                .section-stack { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto; gap: 10px; height: auto; }
                .scale-chart-card, .comparison-grid, .academic-card { grid-column: 1; grid-row: auto; }
                .scale-chart-card, .academic-card { min-height: 400px; }
                .comparison-grid { grid-template-columns: minmax(0, 1fr); gap: 10px; }
                .comparison-grid .chart-card { min-height: 340px; }
                .chart-graph { min-height: 280px; }
            }
            @media (max-width: 480px) {
                .page-title { font-size: 18px; }
                .subtitle { font-size: 9px; }
                .section-heading { align-items: flex-start; flex-direction: column; gap: 3px; }
                .clear-button { padding: 3px 5px; font-size: 8px; }
                .chart-note { display: none; }
            }
        </style>
    </head>
    <body>
        {%app_entry%}
        <footer>
            {%config%}
            {%scripts%}
            {%renderer%}
        </footer>
    </body>
</html>"""


@app.callback(
    Output("group-filter", "value"),
    Output("organization-filter", "options"),
    Output("organization-filter", "value"),
    Output("year-min", "value"),
    Output("year-max", "value"),
    Output("scale-graph", "figure"),
    Output("scale-legend", "children"),
    Output("lab-revenue-graph", "figure"),
    Output("lab-revenue-legend", "children"),
    Output("revenue-comparison-graph", "figure"),
    Output("eto-graph", "figure"),
    Output("eto-legend", "children"),
    Output("selection-summary", "children"),
    Output("interaction-state", "data"),
    Input("group-filter", "value"),
    Input("organization-filter", "value"),
    Input("year-min", "value"),
    Input("year-max", "value"),
    Input("retain-unselected", "value"),
    Input("lab-revenue-axis-scale", "value"),
    Input("scale-graph", "clickData"),
    Input("scale-graph", "selectedData"),
    Input("lab-revenue-graph", "clickData"),
    Input("lab-revenue-graph", "selectedData"),
    Input("revenue-comparison-graph", "clickData"),
    Input("revenue-comparison-graph", "selectedData"),
    Input("eto-graph", "clickData"),
    Input("eto-graph", "selectedData"),
    Input("clear-scale", "n_clicks"),
    Input("clear-lab-revenue", "n_clicks"),
    Input("clear-revenue-comparison", "n_clicks"),
    Input("clear-eto", "n_clicks"),
    Input("clear-all", "n_clicks"),
    State("interaction-state", "data"),
)
def synchronize_dashboard(
    group_input: str,
    organizations_input: list[str] | None,
    year_min_input: int | float | None,
    year_max_input: int | float | None,
    retain_unselected_input: list[str] | None,
    lab_revenue_axis_scale: str,
    scale_click: dict[str, Any] | None,
    scale_selection: dict[str, Any] | None,
    lab_revenue_click: dict[str, Any] | None,
    lab_revenue_selection: dict[str, Any] | None,
    revenue_comparison_click: dict[str, Any] | None,
    revenue_comparison_selection: dict[str, Any] | None,
    eto_click: dict[str, Any] | None,
    eto_selection: dict[str, Any] | None,
    clear_scale: int,
    clear_lab_revenue: int,
    clear_revenue_comparison: int,
    clear_eto: int,
    clear_all: int,
    interaction_state: dict[str, Any] | None,
) -> tuple[Any, ...]:
    triggered = ctx.triggered_id
    state = dict(interaction_state or {})
    state["snapshots"] = dict(state.get("snapshots", {}))
    state["selection_revision"] = int(state.get("selection_revision", 0))
    group = group_input or "All"
    organizations = [
        item for item in (organizations_input or []) if item in ALL_ENTITIES
    ]
    years = _normalize_year_inputs(
        year_min_input, year_max_input, triggered
    )
    current_filter_state = _filter_snapshot(group, organizations, years)
    last_written = state.get("last_written")
    is_internal_echo = current_filter_state == last_written

    if triggered in ("group-filter", "organization-filter", *YEAR_FILTER_IDS):
        if not is_internal_echo:
            state["snapshots"] = {}
            state["selection_revision"] += 1
        if triggered == "group-filter" and not is_internal_echo:
            group = group_input or "All"
            organizations = (
                ALL_ENTITIES.copy() if group == "All" else GROUPS[group].copy()
            )
        elif triggered == "organization-filter":
            organizations = [
                item for item in (organizations_input or []) if item in ALL_ENTITIES
            ]
            if organizations:
                groups = {GROUP_BY_ENTITY[item] for item in organizations}
                if len(groups) != 1 or group not in groups:
                    group = next(iter(groups)) if len(groups) == 1 else "All"
    elif triggered in GRAPH_IDS:
        events = {
            "scale-graph": (scale_click, scale_selection),
            "lab-revenue-graph": (lab_revenue_click, lab_revenue_selection),
            "revenue-comparison-graph": (
                revenue_comparison_click,
                revenue_comparison_selection,
            ),
            "eto-graph": (eto_click, eto_selection),
        }[triggered]
        property_id = next(iter(ctx.triggered_prop_ids), "")
        event = events[1] if property_id.endswith(".selectedData") else events[0]
        if event and event.get("points"):
            state, group, organizations, years = _handle_chart_selection(
                state,
                triggered,
                event,
                group,
                organizations,
                years,
            )
        elif property_id.endswith(".selectedData"):
            state, snapshot = _restore_chart_snapshot(state, triggered)
            if snapshot is not None:
                group = snapshot["group"]
                organizations = snapshot["organizations"]
                years = snapshot["years"]
    elif triggered in CLEAR_IDS:
        state, snapshot = _restore_chart_snapshot(state, triggered.removeprefix("clear-") + "-graph")
        if snapshot is not None:
            group = snapshot["group"]
            organizations = snapshot["organizations"]
            years = snapshot["years"]
    elif triggered == "clear-all":
        group = "All"
        organizations = ALL_ENTITIES.copy()
        years = [START_YEAR, END_YEAR]
        state["snapshots"] = {}
        state["selection_revision"] += 1

    if triggered in ("group-filter", "organization-filter", *YEAR_FILTER_IDS) and not is_internal_echo:
        state["last_written"] = None
    if group not in ("All", *GROUPS):
        group = "All"
    valid_entities = ALL_ENTITIES if group == "All" else GROUPS[group]
    organizations = [item for item in organizations if item in valid_entities]
    options = [{"label": item, "value": item} for item in valid_entities]
    if years is None or len(years) != 2:
        years = [START_YEAR, END_YEAR]
    start_year, end_year = map(int, years)
    start_year = max(START_YEAR, min(start_year, END_YEAR))
    end_year = max(start_year, min(end_year, END_YEAR))
    years = [start_year, end_year]
    figures = build_figures(
        start_year,
        end_year,
        organizations,
        selection_revision=state["selection_revision"],
        retain_unselected="keep" in (retain_unselected_input or []),
        lab_revenue_scale=lab_revenue_axis_scale,
    )
    group_text = "All groups" if group == "All" else group
    summary = f"{group_text} · {len(organizations)} orgs · {start_year}–{end_year}"
    state["last_written"] = _filter_snapshot(group, organizations, years)
    return (
        group,
        options,
        organizations,
        start_year,
        end_year,
        figures["scale"],
        _series_legend_items(figures["scale"]),
        figures["lab-revenue"],
        _series_legend_items(figures["lab-revenue"]),
        figures["revenue-comparison"],
        figures["eto"],
        _series_legend_items(figures["eto"]),
        summary,
        state,
    )


if __name__ == "__main__":
    app.run(debug=False, port=int(os.environ.get("PORT", "8050")))
