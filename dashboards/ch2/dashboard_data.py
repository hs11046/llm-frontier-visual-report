"""Data loading and source-specific normalization for the Chapter 2 dashboard."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

import pandas as pd

from market_cap_sources import (
    CAPEX_DIR,
    MARKET_CAP_FILE,
    PRICE_FILE,
    TICKER_TO_ENTITY,
)


APP_DIR = Path(__file__).resolve().parent
PROJECT_DIR = APP_DIR.parent
DATA_DIR = APP_DIR / "source_data"
START_YEAR = 2023
END_YEAR = 2026

REVENUE_FILE = DATA_DIR / "2.1_规模市值收入" / "fig_4.2.18.csv"
PUBLICATION_FILE = DATA_DIR / "2.3_论文专利" / "yearly_publication_counts.csv"

GROUPS = {
    "Big companies": [
        "Amazon",
        "Alphabet / Google",
        "Meta",
        "Microsoft",
        "NVIDIA",
        "Alibaba / Qwen",
    ],
    "AI labs": [
        "OpenAI",
        "Anthropic",
        "xAI",
        "Mistral AI",
        "Z.ai",
        "DeepSeek",
        "EleutherAI",
        "AllenAI",
        "NousResearch",
        "01.AI",
        "MosaicML",
    ],
}
ALL_ENTITIES = GROUPS["Big companies"] + GROUPS["AI labs"]
GROUP_BY_ENTITY = {
    entity: group for group, entities in GROUPS.items() for entity in entities
}
COLORS = {
    "Amazon": "#425e58",
    "Alphabet / Google": "#678caa",
    "Meta": "#3b9d7e",
    "Microsoft": "#426c80",
    "NVIDIA": "#7ca35b",
    "Alibaba / Qwen": "#b89a55",
    "OpenAI": "#d47662",
    "Anthropic": "#a56f77",
    "xAI": "#665d6e",
    "Mistral AI": "#d29a68",
    "Z.ai": "#a07eaf",
    "DeepSeek": "#5989a7",
    "EleutherAI": "#7a9f76",
    "AllenAI": "#568e86",
    "NousResearch": "#9f7a9e",
    "01.AI": "#ad8b69",
    "MosaicML": "#5e9c9b",
}

PUBLICATION_TO_ENTITY = {
    "Alphabet (including Google)": "Alphabet / Google",
    "Alibaba": "Alibaba / Qwen",
    "Meta": "Meta",
    "OpenAI": "OpenAI",
    "Anthropic": "Anthropic",
    "Mistral": "Mistral AI",
}


def _read_market_cap() -> pd.DataFrame:
    if not MARKET_CAP_FILE.is_file():
        raise FileNotFoundError(
            f"Historical market-cap data not found: {MARKET_CAP_FILE}. "
            "Run `python download_market_cap.py` to generate it."
        )
    frame = pd.read_csv(
        MARKET_CAP_FILE,
        parse_dates=["Date", "Share observation date"],
    )
    frame["Date"] = pd.to_datetime(frame["Date"], errors="coerce")
    frame["Market cap (USD bn)"] = pd.to_numeric(
        frame["Market cap (USD bn)"], errors="coerce"
    )
    frame = frame.dropna(subset=["Date", "Market cap (USD bn)"])
    frame = frame[
        frame["Organization"].isin(TICKER_TO_ENTITY.values())
        & frame["Date"].between(f"{START_YEAR}-01-01", f"{END_YEAR}-12-31")
        & (frame["Market cap (USD bn)"] > 0)
    ].copy()
    frame["Year"] = frame["Date"].dt.year
    frame = frame.sort_values(["Organization", "Date"])
    counts = frame.groupby("Organization")["Date"].count()
    missing = set(TICKER_TO_ENTITY.values()) - set(counts.index)
    if missing or (counts < 45).any():
        raise ValueError(
            "Historical market-cap data must contain 45 monthly observations "
            f"for each listed company; missing={sorted(missing)}, counts={counts.to_dict()}."
        )
    return frame


def _read_public_company_revenue() -> pd.DataFrame:
    tag_preferences = (
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "Revenues",
        "SalesRevenueNet",
    )
    rows: list[dict[str, Any]] = []
    for ticker, organization in TICKER_TO_ENTITY.items():
        path = CAPEX_DIR / f"{ticker}.json"
        if not path.is_file():
            raise FileNotFoundError(f"Required SEC company facts not found: {path}")
        with path.open(encoding="utf-8") as handle:
            facts = json.load(handle).get("facts", {}).get("us-gaap", {})
        for year in range(START_YEAR, END_YEAR + 1):
            selected = None
            for tag in tag_preferences:
                entries = facts.get(tag, {}).get("units", {}).get("USD", [])
                annual = []
                for entry in entries:
                    if (
                        entry.get("form") != "10-K"
                        or not entry.get("start")
                        or not entry.get("end")
                        or entry.get("val") is None
                    ):
                        continue
                    start = date.fromisoformat(entry["start"])
                    end = date.fromisoformat(entry["end"])
                    if (
                        end.year != year
                        or not 350 <= (end - start).days <= 380
                    ):
                        continue
                    annual.append(
                        (
                            date.fromisoformat(entry.get("filed", entry["end"])),
                            start,
                            end,
                            float(entry["val"]) / 1e9,
                            tag,
                        )
                    )
                if annual:
                    selected = max(annual, key=lambda value: value[0])
                    break
            if selected is not None:
                filed, start, end, amount, tag = selected
                rows.append(
                    {
                        "Organization": organization,
                        "Ticker": ticker,
                        "Year": year,
                        "Fiscal period start": start,
                        "Fiscal period end": end,
                        "Filed": filed,
                        "Revenue (USD bn)": amount,
                        "SEC tag": tag,
                    }
                )
    frame = pd.DataFrame(rows)
    if frame.empty:
        raise ValueError("No annual SEC revenue observations were found for 2023–26.")
    return frame


def _read_lab_revenue() -> pd.DataFrame:
    if not REVENUE_FILE.is_file():
        raise FileNotFoundError(f"Required lab revenue data not found: {REVENUE_FILE}")
    frame = pd.read_csv(REVENUE_FILE)
    value_column = "Annualized revenue (in billions of US dollars - log scale)"
    frame["Date"] = pd.to_datetime(frame["Date"], format="mixed", errors="coerce")
    frame["Revenue run rate (USD bn)"] = pd.to_numeric(
        frame[value_column], errors="coerce"
    )
    frame = frame.dropna(subset=["Date", "Revenue run rate (USD bn)", "Label"])
    frame = frame[
        frame["Date"].between(f"{START_YEAR}-01-01", f"{END_YEAR}-12-31")
        & (frame["Revenue run rate (USD bn)"] > 0)
    ].copy()
    frame["Year"] = frame["Date"].dt.year
    return frame.rename(columns={"Label": "Organization"})


def _read_publications() -> pd.DataFrame:
    if not PUBLICATION_FILE.is_file():
        raise FileNotFoundError(f"Required ETO publication data not found: {PUBLICATION_FILE}")
    frame = pd.read_csv(
        PUBLICATION_FILE,
        usecols=["Name", "Dataset", "Category", "Year", "Value", "Complete"],
    )
    frame = frame[
        (frame["Dataset"] == "Publications")
        & (frame["Category"] == "AI publications")
        & frame["Name"].isin(PUBLICATION_TO_ENTITY)
    ].copy()
    frame["Year"] = pd.to_numeric(frame["Year"], errors="coerce")
    frame["Value"] = pd.to_numeric(frame["Value"], errors="coerce")
    frame["Complete"] = frame["Complete"].astype(str).str.lower().eq("true")
    frame = frame.dropna(subset=["Year", "Value"])
    frame = frame[frame["Year"].between(START_YEAR, END_YEAR)].copy()
    frame["Year"] = frame["Year"].astype(int)
    frame["Value"] = frame["Value"].astype(int)
    frame["Organization"] = frame["Name"].map(PUBLICATION_TO_ENTITY)
    return frame


def load_data() -> dict[str, pd.DataFrame]:
    return {
        "market_cap": _read_market_cap(),
        "public_revenue": _read_public_company_revenue(),
        "lab_revenue": _read_lab_revenue(),
        "publications": _read_publications(),
    }


DATA = load_data()
