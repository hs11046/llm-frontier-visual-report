#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/rendered_pdfs"
mkdir -p "$OUT_DIR"

CHROME=""
for candidate in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium" \
  "$(command -v google-chrome 2>/dev/null || true)" \
  "$(command -v chromium 2>/dev/null || true)" \
  "$(command -v chromium-browser 2>/dev/null || true)"; do
  if [[ -n "$candidate" && -x "$candidate" ]]; then
    CHROME="$candidate"
    break
  fi
done

if [[ -z "$CHROME" ]]; then
  echo "Error: Google Chrome or Chromium not found. Install Chrome or print the HTML files to PDF (A4, no margins, background graphics ON) from your browser." >&2
  exit 1
fi

REP_PDF="$OUT_DIR/final_report_draft.pdf"
AI_PDF="$OUT_DIR/ai_usage_report_draft.pdf"
if [[ "${1:-}" == "--final" ]]; then
  REP_PDF="$OUT_DIR/COMP7507_Group3_Final_Report.pdf"
  AI_PDF="$OUT_DIR/COMP7507_Group3_AI_Usage_Report.pdf"
fi

"$CHROME" --headless=new --disable-gpu --no-sandbox \
  --print-to-pdf="$REP_PDF" --no-pdf-header-footer \
  "file://$SCRIPT_DIR/final_report.html" >/dev/null 2>&1

"$CHROME" --headless=new --disable-gpu --no-sandbox \
  --print-to-pdf="$AI_PDF" --no-pdf-header-footer \
  "file://$SCRIPT_DIR/ai_usage_report.html" >/dev/null 2>&1

echo "Generated:"
ls -lh "$REP_PDF" "$AI_PDF"
