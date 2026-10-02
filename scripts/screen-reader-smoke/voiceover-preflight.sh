#!/usr/bin/env bash
# Makes VoiceOver AppleScript control deterministic on hosted macOS runners, then proves it before the journeys.
#
# guidepup setup grants Apple Events with INSERT OR IGNORE for a fixed list of clients. A host whose TCC database
# already holds a deny row for the same client and target keeps that denial, and a job started under a different
# parent process is never granted. Either gives "Not authorized to send Apple events to VoiceOver (-1743)". This
# script upserts allow rows for the job's real process chain, reloads tccd, and checks AppleScript control with
# retries, so a broken host fails here with diagnostics instead of inside every journey.
set -uo pipefail

# It widens the TCC grants of shells and Node, so it runs only on an ephemeral GitHub-hosted runner, never on a
# workstation or a self-hosted runner.
if [ "${GITHUB_ACTIONS:-}" != true ] || [ "${RUNNER_ENVIRONMENT:-}" != github-hosted ]; then
  echo "voiceover-preflight.sh runs only on GitHub-hosted runners" >&2
  exit 2
fi

out="${1:-artifacts/voiceover}"
mkdir -p "$out"
diag="$out/voiceover-preflight.txt"
: > "$diag"
log() { echo "$*" | tee -a "$diag"; }

clients=(/bin/bash /bin/zsh /bin/sh /usr/bin/osascript /usr/bin/env)
node_bin="$(command -v node || true)"
[ -n "$node_bin" ] && clients+=("$node_bin" "$(realpath "$node_bin" 2>/dev/null || echo "$node_bin")")

log "== process chain"
pid=$$
while [ -n "$pid" ] && [ "$pid" -gt 1 ]; do
  exe="$(ps -o comm= -p "$pid" 2>/dev/null || true)"
  log "$pid $exe"
  case "$exe" in /*) clients+=("$exe") ;; esac
  pid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')"
done

targets=(com.apple.VoiceOver com.apple.systemevents com.apple.VoiceOverUtility com.google.Chrome com.apple.finder)
epoch="$(date +%s)"
user_db="$HOME/Library/Application Support/com.apple.TCC/TCC.db"
system_db="/Library/Application Support/com.apple.TCC/TCC.db"
cols="service,client,client_type,auth_value,auth_reason,auth_version,csreq,policy_id,indirect_object_identifier_type,indirect_object_identifier,indirect_object_code_identity,flags,last_modified,pid,pid_version,boot_uuid,last_reminded"

upsert() {
  local db="$1" service="$2" client="$3" target="$4" type="$5"
  sudo sqlite3 "$db" "INSERT OR REPLACE INTO access ($cols) VALUES('$service','$client',1,2,3,1,NULL,NULL,$type,'$target',NULL,0,$epoch,NULL,NULL,'UNUSED',$epoch);" 2>>"$diag"
}

unique=()
while IFS= read -r client; do unique+=("$client"); done < <(printf '%s\n' "${clients[@]}" | awk 'NF && !seen[$0]++')
log "== granting ${#unique[@]} clients"
for db in "$user_db" "$system_db"; do
  [ -f "$db" ] || { log "missing $db"; continue; }
  for client in "${unique[@]}"; do
    for target in "${targets[@]}"; do upsert "$db" kTCCServiceAppleEvents "$client" "$target" 0; done
    upsert "$db" kTCCServiceAccessibility "$client" UNUSED NULL
    upsert "$db" kTCCServicePostEvent "$client" UNUSED NULL
  done
  log "== $db VoiceOver Apple Events rows"
  sudo sqlite3 "$db" "SELECT client,auth_value FROM access WHERE service='kTCCServiceAppleEvents' AND indirect_object_identifier='com.apple.VoiceOver';" 2>&1 | tee -a "$diag"
done

# tccd caches decisions; restart both daemons so they read the updated databases.
sudo pkill -x tccd || true
pkill -x tccd || true
sleep 3

defaults write com.apple.VoiceOver4/default SCREnableAppleScript -bool true
log "SCREnableAppleScript: $(defaults read com.apple.VoiceOver4/default SCREnableAppleScript 2>&1)"

ok=0
for attempt in 1 2 3 4; do
  log "== AppleScript control check, attempt $attempt"
  /System/Library/CoreServices/VoiceOver.app/Contents/MacOS/VoiceOverStarter >/dev/null 2>&1 || true
  for _ in $(seq 1 30); do pgrep -xq VoiceOver && break; sleep 1; done
  sleep 2
  if result="$(osascript -e 'tell application "VoiceOver" to return name of (get vo cursor)' 2>&1)" ||
     result="$(osascript -e 'tell application "VoiceOver" to output "ready"' 2>&1)"; then
    log "ok: ${result:-ready}"
    ok=1
    break
  fi
  log "failed: $result"
  sudo pkill -x tccd || true
  pkill -x tccd || true
  sleep 5
done

osascript -e 'tell application "VoiceOver" to quit' >/dev/null 2>&1 || true
for _ in $(seq 1 20); do pgrep -xq VoiceOver || break; sleep 1; done
pkill -x VoiceOver 2>/dev/null || true
sleep 2

if [ "$ok" != 1 ]; then
  log "VoiceOver AppleScript control is not authorized on this host"
  exit 1
fi
