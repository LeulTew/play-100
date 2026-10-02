#!/usr/bin/env bash
# Lighthouse on the candidate's configured production build, served as production serves it (HTTPS, HTTP/2, Brotli,
# vercel.json headers and rewrites). Two font cells, each mobile and desktop, three runs apiece:
#   linux-liberation: the runner's fonts after `playwright install --with-deps` (Arial resolves to Liberation Sans);
#   linux-dejavu: a fontconfig with only DejaVu, so no Impact, Arial, Liberation or Arimo face exists (the Android
#   path, as in the earlier first-paint captures).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${OUT:?}"
lighthouse="$here/lighthouse/node_modules/.bin/lighthouse"
runs="${LIGHTHOUSE_RUNS:-3}"
mkdir -p "$OUT/lighthouse"

npx --no-install tsx "$here/serve-build.mjs" "$OUT/lighthouse/origin.txt" >"$OUT/lighthouse/server.log" 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do
  if [[ -s "$OUT/lighthouse/origin.txt" ]]; then break; fi
  sleep 1
done
origin="$(tr -d '[:space:]' <"$OUT/lighthouse/origin.txt")"
curl -fsSk --http2 -o /dev/null -w 'probe %{http_code} %{http_version}\n' "$origin/"

export CHROME_PATH
CHROME_PATH="$(node -e 'console.log(require("@playwright/test").chromium.executablePath())')"

dejavu_conf="$RUNNER_TEMP/fonts-android-path.conf"
cat >"$dejavu_conf" <<EOF
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <!-- DejaVu only, so no Impact, Arial, Liberation or Arimo face exists (the Android path). -->
  <dir>/usr/share/fonts/truetype/dejavu</dir>
  <cachedir>$RUNNER_TEMP/fc-cache-dejavu</cachedir>
</fontconfig>
EOF
test -d /usr/share/fonts/truetype/dejavu

for cell in linux-liberation linux-dejavu; do
  if [[ "$cell" == linux-dejavu ]]; then export FONTCONFIG_FILE="$dejavu_conf"; else unset FONTCONFIG_FILE; fi
  {
    echo "cell: $cell"
    echo "FONTCONFIG_FILE: ${FONTCONFIG_FILE:-<system>}"
    for family in Impact Arial sans-serif serif monospace; do echo "fc-match $family: $(fc-match "$family")"; done
    echo "fc-list families:"
    fc-list : family | sort -u
  } >"$OUT/lighthouse/fonts-$cell.txt"
  if [[ "$cell" == linux-dejavu ]] && fc-list : family | grep -vq '^DejaVu'; then
    echo "The DejaVu cell exposes a face other than DejaVu." >&2
    exit 1
  fi
  for form in mobile desktop; do
    preset=()
    if [[ "$form" == desktop ]]; then preset=(--preset=desktop); fi
    for ((i = 1; i <= runs; i++)); do
      name="lh-$cell-$form-$i"
      echo "== $name"
      "$lighthouse" "$origin/" "${preset[@]}" --output=json --output=html \
        --output-path="$OUT/lighthouse/$name" --max-wait-for-load=60000 \
        --chrome-flags="--headless=new --no-sandbox --ignore-certificate-errors" --quiet
    done
  done
done

node "$here/lighthouse-summary.mjs" "$OUT/lighthouse" | tee "$OUT/lighthouse/summary.txt"
