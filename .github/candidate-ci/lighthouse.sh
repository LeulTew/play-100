#!/usr/bin/env bash
# Lighthouse on the candidate's configured production build, served as production serves it (HTTPS, HTTP/2, Brotli,
# vercel.json headers and rewrites). Three font cells (LIGHTHOUSE_CELLS), each mobile and desktop, three runs apiece:
#   linux-liberation: the runner's fonts after `playwright install --with-deps` (Arial resolves to Liberation Sans);
#   linux-dejavu: only DejaVu installed, so no Impact, Arial, Liberation or Arimo face exists (the Android path), with
#   sans-serif resolving to DejaVu Sans as on a Linux desktop;
#   linux-tall-fallback: the bare DejaVu directory, where sans-serif falls to a face with tall metrics.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${OUT:?}" "${CI_SCRIPTS:?}"
lighthouse="$here/lighthouse/node_modules/.bin/lighthouse"
runs="${LIGHTHOUSE_RUNS:-3}"
mkdir -p "$OUT/lighthouse"

npx --no-install tsx "$CI_SCRIPTS/serve-build.ts" "$OUT/lighthouse/origin.txt" >"$OUT/lighthouse/server.log" 2>&1 &
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

# The DejaVu cell is a Linux desktop with only DejaVu installed: the system's fontconfig rules (aliases, rendering) over
# the DejaVu directory alone, with the generic families pinned as a desktop resolves them, so sans-serif is DejaVu Sans.
dejavu_conf="$RUNNER_TEMP/fonts-dejavu.conf"
cat >"$dejavu_conf" <<EOF
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <!-- DejaVu only, so no Impact, Arial, Liberation or Arimo face exists (the Android path). -->
  <dir>/usr/share/fonts/truetype/dejavu</dir>
  <cachedir>$RUNNER_TEMP/fc-cache-dejavu</cachedir>
  <alias binding="same"><family>sans-serif</family><prefer><family>DejaVu Sans</family></prefer></alias>
  <alias binding="same"><family>serif</family><prefer><family>DejaVu Serif</family></prefer></alias>
  <alias binding="same"><family>monospace</family><prefer><family>DejaVu Sans Mono</family></prefer></alias>
  <include ignore_missing="yes">/etc/fonts/conf.d</include>
</fontconfig>
EOF
# The tall-fallback cell keeps the bare DejaVu directory without the system rules, where sans-serif falls to a face
# with tall metrics (DejaVu Math TeX Gyre): a cheap check that the card targets survive tall fallback metrics.
tall_conf="$RUNNER_TEMP/fonts-tall-fallback.conf"
cat >"$tall_conf" <<EOF
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>/usr/share/fonts/truetype/dejavu</dir>
  <cachedir>$RUNNER_TEMP/fc-cache-tall</cachedir>
</fontconfig>
EOF
test -d /usr/share/fonts/truetype/dejavu
for cell in ${LIGHTHOUSE_CELLS:-linux-liberation linux-dejavu linux-tall-fallback}; do
  case "$cell" in
    linux-liberation) unset FONTCONFIG_FILE ;;
    linux-dejavu) export FONTCONFIG_FILE="$dejavu_conf" ;;
    linux-tall-fallback) export FONTCONFIG_FILE="$tall_conf" ;;
    *) echo "Unknown Lighthouse cell: $cell" >&2; exit 2 ;;
  esac
  {
    echo "cell: $cell"
    echo "FONTCONFIG_FILE: ${FONTCONFIG_FILE:-<system>}"
    for family in Impact Arial sans-serif serif monospace; do echo "fc-match $family: $(fc-match "$family")"; done
    echo "fc-list families:"
    fc-list : family | sort -u
  } >"$OUT/lighthouse/fonts-$cell.txt"
  if [[ "$cell" != linux-liberation ]] && fc-list : family | grep -vq '^DejaVu'; then
    echo "The $cell cell exposes a face other than DejaVu." >&2
    exit 1
  fi
  if [[ "$cell" == linux-dejavu && "$(fc-match -f '%{family[0]}' sans-serif)" != "DejaVu Sans" ]]; then
    echo "The DejaVu cell resolves sans-serif to $(fc-match sans-serif), not DejaVu Sans." >&2
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

npx --no-install tsx "$CI_SCRIPTS/lighthouse-summary.ts" "$OUT/lighthouse" | tee "$OUT/lighthouse/summary.txt"
