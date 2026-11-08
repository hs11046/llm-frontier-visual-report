"""Single local entry point for the narrative report and five original dashboards."""

from __future__ import annotations

import csv
import importlib.util
import json
import os
import sys
from pathlib import Path

from flask import Flask, abort, jsonify, redirect, render_template, request, send_from_directory
from werkzeug.middleware.dispatcher import DispatcherMiddleware


ROOT = Path(__file__).resolve().parent
DASHBOARDS = ROOT / "dashboards"
app = Flask(__name__, template_folder=str(ROOT / "templates"), static_folder=str(ROOT / "static"))
app.config["TEMPLATES_AUTO_RELOAD"] = True


def rows(path):
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def report_data():
    arena = json.loads((DASHBOARDS / "ch1/data/arena/overall.json").read_text())
    ch1 = []
    for period in arena["periods"]:
        top50 = [m for m in period["models"] if m.get("rank", 999) <= 50]
        top10 = [m for m in period["models"] if m.get("rank", 999) <= 10]
        frontier = period.get("frontier") or {}
        best_open = frontier.get("open")
        best_closed = frontier.get("closed")
        ch1.append({
            "month": period["month"],
            "date": period["date"],
            "n50": len(top50),
            "open50": sum(m.get("access") == "open_weights" for m in top50),
            "closed50": sum(m.get("access") == "closed" for m in top50),
            "unknown50": sum(m.get("access") == "unknown" for m in top50),
            "open10": sum(m.get("access") == "open_weights" for m in top10),
            "closed10": sum(m.get("access") == "closed" for m in top10),
            "n10": len(top10),
            "frontier_gap": best_open["rank"] - best_closed["rank"] if best_open and best_closed and period["month"] >= "2023-12" else None,
        })

    market = rows(DASHBOARDS / "ch2/data/market_cap_monthly.csv")
    ch2 = [
        {"date": r["Date"], "name": r["Organization"], "value": round(float(r["Market cap (USD bn)"]), 1)}
        for r in market if r.get("Market cap (USD bn)")
    ]

    academic = [
        {"year": int(r["Year"]), "value": round(float(r["Notable AI models (% of total)"]) * 100, 2), "label": r["Label"]}
        for r in rows(DASHBOARDS / "ch3/data/fig_1.1.5.csv")
        if r["Year"] in {"2023", "2024", "2025"}
    ]
    share_supply = [
        {"quarter": r["quarter"], "share": float(r["proprietary_share_pct"]),
         "supply": int(float(r["created_models"])) if r["created_models"] else None}
        for r in rows(DASHBOARDS / "ch4/data/quarterly_share_supply.csv")
    ]
    adoption = [
        {"date": r["ref_start"], "value": round(float(r["adoption"]) * 100, 2)}
        for r in rows(DASHBOARDS / "ch4/data/business_adoption.csv")
        if r.get("adoption")
    ]
    adoption.sort(key=lambda r: r["date"])
    return {
        "ch1": ch1, "ch2": ch2, "ch3_academic": academic,
        "ch4_share_supply": share_supply, "ch4_adoption": adoption,
    }


DATA = report_data()
CH5_STATE = {"selection": None, "last_sync": None, "source": "report"}


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/api/report-data")
def data():
    return jsonify(DATA)


@app.get("/dashboard/<name>")
def dashboard_redirect(name):
    return redirect(f"/dashboard/{name}/", code=308)


@app.get("/dashboard/ch5/static/<path:filename>")
def ch5_static(filename):
    return send_from_directory(DASHBOARDS / "ch5/static", filename)


@app.get("/dashboard/<name>/")
@app.get("/dashboard/<name>/<path:filename>")
def static_dashboard(name, filename="index.html"):
    if name not in {"ch1", "ch4", "ch5"}:
        abort(404)
    if name == "ch5":
        base = DASHBOARDS / "ch5/static"
    else:
        base = DASHBOARDS / name
    return send_from_directory(base, filename)


@app.get("/dashboard/ch5/api/v1/<section>")
def ch5_api(section):
    if section == "selection":
        return jsonify(CH5_STATE)
    if section not in {"bundle", "meta", "orgs", "rank", "votes", "costs", "market", "adoption", "capex", "flip"}:
        abort(404)
    return send_from_directory(DASHBOARDS / "ch5/data", f"{section}.json")


@app.post("/dashboard/ch5/api/v1/selection")
def ch5_selection():
    from datetime import datetime, timezone
    payload = request.get_json(silent=True) or {}
    CH5_STATE.update(selection=payload.get("orgId"), source=payload.get("source", "ch5"),
                     last_sync=datetime.now(timezone.utc).isoformat(timespec="seconds"))
    return jsonify({"ok": True, **CH5_STATE})


def import_app(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


# Dash and the Chapter 3 Flask app keep their original callbacks and routes.
sys.path.insert(0, str(DASHBOARDS / "ch2"))
ch2 = import_app("chapter2_app", DASHBOARDS / "ch2/app.py")
ch3 = import_app("chapter3_app", DASHBOARDS / "ch3/app.py")
application = DispatcherMiddleware(app, {
    "/dashboard/ch2": ch2.app.server,
    "/dashboard/ch3": ch3.app,
})


if __name__ == "__main__":
    from werkzeug.serving import run_simple
    port = int(os.environ.get("PORT", "8764"))
    run_simple("127.0.0.1", port, application, use_reloader=False, threaded=True)
