# From Open Labs to Closed Empires · Five-Chapter Visual Report

This is the local web work product for COMP7507 Group 3. Python Flask serves the narrative report, a summary-data API, and unified dashboard routes. HTML/CSS/JS renders the report figures. The original four team dashboards retain their interactions, and the Chapter 5 synthesis dashboard is available from the same entry point.

## Run

From this directory:

```bash
bash start.sh
```

On first run, the script creates `.venv` and installs `requirements.txt`. Open <http://127.0.0.1:8764/>. To choose another port, run `PORT=8765 bash start.sh` and use that port in the URL. Press `Ctrl+C` to stop the server.

## Share from this Mac

Double-click `share.command`, or run `bash share.sh` in this directory. The script starts the Python WSGI server on a local-only port and creates a temporary HTTPS address through Cloudflare Tunnel. Copy the `https://...trycloudflare.com` address printed in the terminal and send it to teammates. No router port forwarding or Cloudflare account is needed. The first run installs Python dependencies and downloads the official `cloudflared` binary into `.tools/` if necessary.

Keep the Mac awake, connected to the internet, and the terminal open while others visit. Press `Ctrl+C` to stop sharing. The address changes on each restart, and anyone with the address can view the site. Restricting access or keeping a permanent address requires a named tunnel and a Cloudflare account.

After editing the main report's HTML, CSS, or JavaScript, teammates can refresh their browser to see the change at the same address. Restart `share.sh` after editing Python code or dashboard server logic; a quick tunnel assigns a new address when restarted. For local preview while editing, continue using `start.sh`.

`index.html` is the static entry and run guide for the course package. The full report is served at the Flask root path. No download of the original datasets or the 6.4 GB RAR archive is needed. Chart libraries and visualization data are included locally; fonts have a system fallback.

## Pages and contributors

| Page | Route | Contributor | Focus |
| --- | --- | --- | --- |
| Narrative report | `/` | Huang Shan | Storyline, summary figures, and measurement limits |
| Ch1 | `/dashboard/ch1/` | Ruan Lixin | Interactive Arena ranks and licenses |
| Ch2 | `/dashboard/ch2/` | Qi Yingying | Market capitalization, revenue, and academic output |
| Ch3 | `/dashboard/ch3/` | Wong Yan Yuet | Training costs, funding threshold, and model origins |
| Ch4 | `/dashboard/ch4/` | Wang Ling | Evaluation share, HF supply, exposure, talent, and adoption |
| Ch5 | `/dashboard/ch5/` | Huang Shan | Ranking shift, open-weight challengers, and linked organization evidence |

Each dashboard includes a **Back to report** link. The dark chapter cards in the report open the matching interactive page. The Chapter 5 dashboard links back to the report, where Ch1–Ch4 can be explored in story order.

## Data and interpretation

- **Ch1:** Arena `overall` uses the last observed snapshot of each month. Top N uses source rank ≤N and preserves ties. A period with fewer than 50 models is not treated as a complete Top 50.
- **Ch2:** Market capitalization is month-end closing price × historical shares outstanding. Private-lab revenue run rates and listed-company annual revenue have different definitions and are not subtracted. The 2026 financial coverage is partial.
- **Ch3:** Training costs are Epoch estimates in 2023 USD, not audited expenditure. Academia/industry origin shares come from Stanford AI Index Figure 1.1.5.
- **Ch4:** Proprietary recorded-evaluation share comes from quarter-end Arena snapshots; HF supply counts new model repositories per quarter. The units and denominators differ. BTOS measures broad AI use among U.S. employer businesses and does not identify the models used.
- **Ch5:** The linked views place multiple measures for one organization side by side. They show association and timing, not an identified causal effect.

The report figures are derived from the supplied dashboard data under `dashboards/`. The original dashboards retain their own data files and annotations. These are locally saved source versions, not live online updates.

## Package

Exclude `.venv/`, `.tools/`, `__pycache__/`, and `.DS_Store` when packaging this directory. The course-required final group and individual PDF reports were not included in the dashboard materials. Add them to the submission package and link them from `index.html` once they are complete.
