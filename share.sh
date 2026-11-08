#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
port="${PORT:-8966}"
tools_dir="$(pwd)/.tools"
cloudflared_bin="${CLOUDFLARED_BIN:-}"

if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi
if ! .venv/bin/python -c 'import flask, dash, pandas, plotly, numpy, waitress' >/dev/null 2>&1; then
  .venv/bin/python -m pip install -r requirements.txt --quiet --disable-pip-version-check
fi

if [ -z "$cloudflared_bin" ]; then
  if command -v cloudflared >/dev/null 2>&1; then
    cloudflared_bin="$(command -v cloudflared)"
  else
    cloudflared_bin="$tools_dir/cloudflared"
  fi
fi

if [ ! -x "$cloudflared_bin" ]; then
  case "$(uname -s)/$(uname -m)" in
    Darwin/arm64) asset="cloudflared-darwin-arm64.tgz" ;;
    Darwin/x86_64) asset="cloudflared-darwin-amd64.tgz" ;;
    *) echo "Install cloudflared from https://developers.cloudflare.com/tunnel/downloads/ and retry." >&2; exit 1 ;;
  esac
  mkdir -p "$tools_dir"
  archive="$(mktemp)"
  trap 'rm -f "$archive"' EXIT
  curl --fail --location --silent --show-error --retry 3 \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/$asset" -o "$archive"
  tar -xzf "$archive" -C "$tools_dir" cloudflared
  chmod +x "$cloudflared_bin"
  rm -f "$archive"
  trap - EXIT
fi

if curl --fail --silent --max-time 2 "http://127.0.0.1:$port/" >/dev/null; then
  echo "Port $port is already in use. Set PORT to another number and retry." >&2
  exit 1
fi

.venv/bin/waitress-serve --listen="127.0.0.1:$port" app:application &
server_pid=$!
cleanup() {
  kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for _ in {1..30}; do
  if curl --fail --silent --max-time 2 "http://127.0.0.1:$port/" >/dev/null; then
    break
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo "The local web server stopped before it was ready." >&2
    exit 1
  fi
  sleep 1
done

if ! curl --fail --silent --max-time 2 "http://127.0.0.1:$port/" >/dev/null; then
  echo "The local web server did not become ready." >&2
  exit 1
fi

echo "Local site: http://127.0.0.1:$port/"
echo "Creating a shareable HTTPS link. Keep this terminal open while teammates visit."
"$cloudflared_bin" tunnel --url "http://127.0.0.1:$port" "$@"
