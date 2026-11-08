"""Shared paths and tickers for public-company market-cap calculations."""

from pathlib import Path


APP_DIR = Path(__file__).resolve().parent
PROJECT_DIR = APP_DIR.parent
DATA_DIR = APP_DIR / "source_data"
PRICE_FILE = DATA_DIR / "2.1_规模市值收入" / "prices_all.csv"
CAPEX_DIR = DATA_DIR / "2.2_投资capex与融资"
MARKET_CAP_FILE = APP_DIR / "data" / "market_cap_monthly.csv"

TICKER_TO_ENTITY = {
    "AMZN": "Amazon",
    "GOOGL": "Alphabet / Google",
    "META": "Meta",
    "MSFT": "Microsoft",
    "NVDA": "NVIDIA",
}
