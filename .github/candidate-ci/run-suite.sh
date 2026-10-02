#!/usr/bin/env bash
# Runs one Candidate CI suite from the candidate checkout (the current directory).
# Inputs come from the environment: SUITE, SPECS, PROJECT, REPEAT, WORKERS, GREP and OUT (the evidence directory).
# Mirrors scripts/release-gate.ts: zero retries, no CI or GITHUB_SHA in the test environment, emulator suites under
# `firebase emulators:exec --project demo-play100 --only auth,firestore`, and the cloud UI against a cloud-test vite
# server on 127.0.0.1:4187.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
unset CI GITHUB_SHA DEBUG
: "${SUITE:?}" "${OUT:?}" "${REPEAT:=1}" "${PROJECT:=both}"
mkdir -p "$OUT"
read -r -a specs <<<"${SPECS:-}"

playwright_projects() {
  case "$PROJECT" in
    desktop) echo --project=desktop ;;
    mobile) echo --project=mobile ;;
    both) echo --project=desktop --project=mobile ;;
    *) echo "Unknown project: $PROJECT" >&2; exit 2 ;;
  esac
}

playwright_args() {
  local config="$1" workers="$2"
  # shellcheck disable=SC2207
  args=(test --config "$config" --forbid-only --retries=0 "--workers=$workers" "--repeat-each=$REPEAT"
    --trace=retain-on-failure --reporter=list,json,junit "--output=$OUT/test-results" $(playwright_projects))
  if [[ -n "${GREP:-}" ]]; then args+=(--grep "$GREP"); fi
  args+=("${specs[@]}")
}

run_playwright() {
  local name="$1"; shift
  PLAYWRIGHT_JSON_OUTPUT_FILE="$OUT/$name.json" PLAYWRIGHT_JUNIT_OUTPUT_FILE="$OUT/$name.junit.xml" \
    npx --no-install playwright "$@" 2>&1 | tee "$OUT/$name.log"
}

# Runs one named check, logging to $OUT/<name>.log and recording its exit code; later checks still run.
failed_checks=()
check() {
  local name="$1"; shift
  echo "== $name: $*"
  local status=0
  "$@" 2>&1 | tee "$OUT/$name.log" || status=$?
  echo "$name $status" >>"$OUT/checks.txt"
  if [[ $status -ne 0 ]]; then failed_checks+=("$name"); fi
}
finish_checks() {
  cat "$OUT/checks.txt"
  if [[ ${#failed_checks[@]} -gt 0 ]]; then
    echo "Failed: ${failed_checks[*]}" >&2
    exit 1
  fi
}

case "$SUITE" in
  checks)
    : >"$OUT/checks.txt"
    check tsc-build npx --no-install tsc -b
    check typecheck-functions npm run typecheck:functions
    check eslint npx --no-install eslint . --max-warnings 0
    check format-check npm run format:check
    for project in unit browser; do
      check "vitest-$project" npx --no-install vitest run --project "$project" --reporter=default --reporter=json \
        --reporter=junit "--outputFile.json=$OUT/vitest-$project.json" "--outputFile.junit=$OUT/vitest-$project.junit.xml"
    done
    finish_checks
    ;;
  csp-refresh)
    : >"$OUT/checks.txt"
    check csp-write npm run csp:write
    git diff --binary >"$OUT/csp-refresh.patch"
    git status --porcelain --untracked-files=no >"$OUT/csp-refresh.files.txt"
    echo "Files changed by csp:write:"
    cat "$OUT/csp-refresh.files.txt"
    check check-csp npm run check:csp
    check check-budgets npm run check:budgets -- --json "$OUT/budgets.json"
    finish_checks
    ;;
  e2e-prod | e2e-offline)
    playwright_args playwright.config.ts "${WORKERS:-3}"
    PLAY100_TEST_BUILD=production run_playwright playwright "${args[@]}"
    ;;
  e2e-dev)
    playwright_args playwright.config.ts "${WORKERS:-3}"
    PLAY100_TEST_BUILD=development run_playwright playwright "${args[@]}"
    ;;
  cloud-rules)
    # Each iteration gets fresh emulators, as the gate's convergence-N and handle-race-N steps do.
    filter=()
    if [[ -n "${GREP:-}" ]]; then filter=(-t "$GREP"); fi
    for ((i = 1; i <= REPEAT; i++)); do
      inner=(npx --no-install vitest run --config vitest.cloud.config.ts "--maxWorkers=${WORKERS:-1}" --retry=0
        --reporter=default --reporter=json --reporter=junit
        "--outputFile.json=$OUT/vitest-$i.json" "--outputFile.junit=$OUT/vitest-$i.junit.xml"
        "${filter[@]}" "${specs[@]}")
      printf -v command '%q ' "${inner[@]}"
      echo "== cloud-rules iteration $i/$REPEAT"
      npx --no-install firebase emulators:exec --project demo-play100 --only auth,firestore "$command" 2>&1 |
        tee "$OUT/cloud-rules-$i.log"
    done
    ;;
  cloud-ui)
    printf -v command '%q ' bash "$here/run-suite.sh"
    SUITE=cloud-ui-inner npx --no-install firebase emulators:exec --project demo-play100 --only auth,firestore \
      "$command" 2>&1 | tee "$OUT/emulators.log"
    ;;
  cloud-ui-inner)
    VITE_USE_FIREBASE_EMULATORS=true npx --no-install vite --mode cloud-test --host 127.0.0.1 --port 4187 \
      --strictPort >"$OUT/vite-cloud-test.log" 2>&1 &
    vite_pid=$!
    trap 'kill "$vite_pid" 2>/dev/null || true' EXIT
    probe="$OUT/online-availability.probe.js"
    for _ in $(seq 1 60); do
      if curl -fsS --max-time 30 http://127.0.0.1:4187/src/lib/online-availability.ts -o "$probe"; then break; fi
      sleep 1
    done
    # The same identity check the gate makes before it trusts the server on 4187.
    grep -Eq 'MODE"?[[:space:]]*:[[:space:]]*"cloud-test"' "$probe"
    grep -Eq 'VITE_USE_FIREBASE_EMULATORS"?[[:space:]]*:[[:space:]]*"true"' "$probe"
    workers="${WORKERS:-1}"
    allocate=0
    if [[ ${#specs[@]} -eq 0 ]]; then allocate=1; fi
    for spec in "${specs[@]}"; do
      if [[ "$spec" == *compare-orientation* ]]; then allocate=1; fi
    done
    if [[ $allocate -eq 1 ]]; then
      export PLAY100_COMPARE_FIXTURE="$OUT/compare-fixture.json"
      PLAYWRIGHT_JSON_OUTPUT_FILE="$OUT/compare-fixture-report.json" npx --no-install playwright test \
        --config playwright.compare-fixture.config.ts --reporter=list,json "--output=$OUT/compare-fixture-results" \
        2>&1 | tee "$OUT/compare-fixture.log"
      node -e 'const f=require(process.argv[1]); if (f.status !== "READY") { console.error("Comparison fixture is not READY."); process.exit(1); }' \
        "$PLAY100_COMPARE_FIXTURE"
      export PLAY100_RELEASE_GATE=1
    fi
    playwright_args playwright.cloud.config.ts "$workers"
    run_playwright playwright "${args[@]}"
    ;;
  floor)
    # The gate's floor-smoke partition: Firefox, WebKit and the old Chromium on the configured build, two workers.
    : "${PLAY100_FLOOR_CHROMIUM:?The floor suite needs the old Chromium}"
    export PLAY100_FLOOR_CHROMIUM
    args=(test --config playwright.floor.config.ts --forbid-only --retries=0 "--workers=${WORKERS:-2}"
      "--repeat-each=$REPEAT" --trace=retain-on-failure --reporter=list,json,junit "--output=$OUT/test-results"
      --project=floor-firefox --project=floor-webkit --project=floor-chromium)
    if [[ -n "${GREP:-}" ]]; then args+=(--grep "$GREP"); fi
    args+=("${specs[@]}")
    PLAY100_TEST_BUILD=production run_playwright playwright "${args[@]}"
    # The gate wants all 15 configured cases per pass with no skips.
    node -e 'const s=require(process.argv[1]).stats; console.log(JSON.stringify(s)); if (s.skipped || s.unexpected || s.flaky) process.exit(1); if (!process.argv[2] && s.expected !== 15 * Number(process.argv[3])) { console.error(`Expected ${15 * Number(process.argv[3])} passes`); process.exit(1); }' \
      "$OUT/playwright.json" "${GREP:-}${SPECS:-}" "$REPEAT"
    ;;
  lighthouse)
    bash "$here/lighthouse.sh"
    ;;
  *)
    echo "Unknown suite: $SUITE" >&2
    exit 2
    ;;
esac
