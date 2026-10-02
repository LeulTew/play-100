#!/usr/bin/env bash
# TalkBack smoke: drives Chrome on an Android emulator with real key events while TalkBack runs, and asserts on
# TalkBack's own spoken text (its verbose log, tag "talkback", "action=SPEAK text=..."). Page state is only read,
# through the DevTools socket, to know which element the keys reached. Journeys (a) and (c) of the desktop smoke.
set -u
out="${OUT:-artifacts/talkback}"
origin="${TARGET_ORIGIN:-https://play-100-collection.vercel.app}"
origin="${origin%/}"
mkdir -p "$out"
TB=com.google.android.marvin.talkback
export CDP_PORT=9222
fails=0
: > "$out/checks.tsv"
: > "$out/speech.txt"

log() { echo "== $*" | tee -a "$out/run.txt"; }
run() { log "\$ $*"; "$@" 2>&1 | tee -a "$out/run.txt"; }
cdp() { node scripts/talkback-smoke/cdp.ts "$1" 2>>"$out/cdp-errors.txt"; }
shot() { adb exec-out screencap -p > "$out/$1.png"; }
lower() { tr '[:upper:]' '[:lower:]'; }

# One step: clear the log, press keys, wait, then keep what TalkBack said.
step=0
press() {
  local name="$1" wait="$2"; shift 2
  step=$((step + 1))
  adb logcat -c
  for code in "$@"; do adb shell input keyevent "$code"; sleep 0.4; done
  sleep "$wait"
  adb logcat -d -v threadtime > "$out/raw/$(printf %03d $step).txt"
  grep -oP 'action=SPEAK\s+text="\K[^"]*' "$out/raw/$(printf %03d $step).txt" > "$out/last-speech.txt" || true
  {
    echo "## $step $name"
    sed 's/^/  > /' "$out/last-speech.txt"
  } >> "$out/speech.txt"
  echo "[$step] $name: $(paste -sd '|' "$out/last-speech.txt")"
}
spoken() { lower < "$out/last-speech.txt"; }

check() {
  local journey="$1" name="$2" ok="$3" detail="$4"
  if [ "$ok" = 1 ]; then echo "PASS	$journey	$name	$detail" >> "$out/checks.tsv"; echo "PASS $journey: $name ($detail)"
  else echo "FAIL	$journey	$name	$detail" >> "$out/checks.tsv"; echo "FAIL $journey: $name ($detail)"; fails=$((fails + 1)); fi
}
has() { grep -qiF -- "$2" <<< "$1" && echo 1 || echo 0; }
lacks() { grep -qiF -- "$2" <<< "$1" && echo 0 || echo 1; }

FOCUS='(() => { const a = document.activeElement; const card = a && a.closest("li.game-card[data-game]");
  const radio = a && a.matches("input[type=radio]") ? a : null;
  return { tag: a ? a.tagName : null, id: a ? a.id : "", link: !!(a && a.matches("a.game-link")),
    text: a ? (a.getAttribute("aria-label") || a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80) : "",
    card: card ? (card.querySelector("h3")?.textContent || "").replace(/\s+/g, " ").trim() : null,
    radio: radio ? { label: (radio.labels?.[0]?.textContent || "").replace(/\s+/g, " ").trim(), checked: radio.checked } : null,
    dialog: !!document.querySelector("dialog[open]"),
    dialogTitle: document.querySelector("dialog[open] h2")?.textContent?.trim() || null }; })()'
focus() { cdp "$FOCUS" > "$out/focus.json"; cat "$out/focus.json"; }
field() { jq -r "$1" "$out/focus.json" 2>/dev/null; }

# Tab (or Shift+Tab) until the focused element satisfies a jq predicate on the focus JSON.
tab_until() {
  local name="$1" predicate="$2" max="$3" i
  for ((i = 1; i <= max; i++)); do
    press "$name (Tab $i)" 0.8 61 > /dev/null
    focus > /dev/null
    if [ "$(jq -r "$predicate" "$out/focus.json" 2>/dev/null)" = true ]; then
      echo "reached after $i Tab: $(cat "$out/focus.json")"; return 0
    fi
  done
  echo "not reached after $max Tab: $(cat "$out/focus.json")"; return 1
}

open_page() {
  local url="$1"
  run adb shell am start -a android.intent.action.VIEW -d "$url" com.android.chrome
  for i in $(seq 1 40); do
    sleep 2
    adb forward tcp:$CDP_PORT localabstract:chrome_devtools_remote > /dev/null 2>&1
    [ "$(cdp 'document.querySelectorAll("li.game-card[data-game]").length > 0 && document.readyState === "complete"')" = true ] && break
  done
  sleep 3
}

mkdir -p "$out/raw"
log "target $origin"
curl -fsS -H 'cache-control: no-cache' "$origin/index.html" -o "$out/index.html"
index_sha=$(sha256sum "$out/index.html" | cut -d' ' -f1)
log "index.html sha256 $index_sha"

run adb root
sleep 3
run adb wait-for-device

# Chrome: skip first run, allow its notifications so no prompt covers the page.
run adb shell "echo '_ --disable-fre --no-default-browser-check --no-first-run' > /data/local/tmp/chrome-command-line"
run adb shell am set-debug-app --persistent com.android.chrome
run adb shell pm grant com.android.chrome android.permission.POST_NOTIFICATIONS
run adb shell pm grant "$TB" android.permission.POST_NOTIFICATIONS

# TalkBack reads its log level when the service starts, so seed it before the first start; enable it once.
dir="/data/user_de/0/$TB"
owner=$(adb shell stat -c %u:%g "$dir" | tr -d '\r')
printf '%s\n' "<?xml version='1.0' encoding='utf-8' standalone='yes' ?>" '<map>' \
  '    <string name="pref_log_level">2</string>' '</map>' > "$out/talkback-prefs.xml"
run adb push "$out/talkback-prefs.xml" /data/local/tmp/talkback-prefs.xml
run adb shell "mkdir -p $dir/shared_prefs && cp /data/local/tmp/talkback-prefs.xml $dir/shared_prefs/${TB}_preferences.xml \
  && chown -R $owner $dir/shared_prefs && chmod 771 $dir/shared_prefs && chmod 660 $dir/shared_prefs/${TB}_preferences.xml \
  && restorecon -R $dir/shared_prefs && ls -laZ $dir/shared_prefs"
adb logcat -c
run adb shell settings put secure enabled_accessibility_services "$TB/com.google.android.marvin.talkback.TalkBackService"
run adb shell settings put secure accessibility_enabled 1
started=0
for i in $(seq 1 30); do
  sleep 2
  # The first start plays an earcon but may speak nothing; a bound service with verbose pipeline logs is enough.
  if adb logcat -d | grep -qE ' talkback: (Actors|Pipeline): '; then started=1; sleep 10; break; fi
done
run adb shell 'dumpsys accessibility | grep -iE "bound services|enabled services" | head -4'
adb logcat -d -v threadtime > "$out/talkback-start.txt"
grep -oP 'action=SPEAK\s+text="\K[^"]*' "$out/talkback-start.txt" | tee "$out/talkback-start-speech.txt"
check setup 'TalkBack runs with verbose speech logging' "$started" "$(paste -sd '|' "$out/talkback-start-speech.txt")"

{
  echo "{"
  echo "  \"targetOrigin\": \"$origin\","
  echo "  \"indexSha256\": \"$index_sha\","
  echo "  \"talkback\": \"$(adb shell dumpsys package $TB | grep -m1 versionName | cut -d= -f2 | tr -d '\r')\","
  echo "  \"chrome\": \"$(adb shell dumpsys package com.android.chrome | grep -m1 versionName | cut -d= -f2 | tr -d '\r')\","
  echo "  \"tts\": \"$(adb shell settings get secure tts_default_synth | tr -d '\r')\","
  echo "  \"fingerprint\": \"$(adb shell getprop ro.build.fingerprint | tr -d '\r')\","
  echo "  \"runner\": \"${ImageOS:-} ${ImageVersion:-}\","
  echo "  \"run\": \"${GITHUB_SERVER_URL:-}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-}\""
  echo "}"
} > "$out/receipt.json"
cat "$out/receipt.json"

if [ "$started" = 1 ]; then
  # (a) Tab to a card in The 100, open it with Enter, hear it; Escape returns to the card.
  log 'journey (a): card detail dialog'
  echo '# (a) card detail dialog' >> "$out/speech.txt"
  open_page "$origin/?catalogs=off"
  shot a-01-opened
  if tab_until 'Tab to a card' '.link == true and .card != null' 120; then
    title=$(field .card)
    press 'open with Enter' 5 66
    heard=$(spoken)
    shot a-02-open
    focus
    tail_words=$(cdp '(document.querySelector("dialog[open] .rationale")?.textContent || "").replace(/\s+/g, " ").trim().split(" ").slice(-5).join(" ")' | jq -r .)
    check a 'the dialog opened' "$([ "$(field .dialog)" = true ] && echo 1 || echo 0)" "$(field .dialogTitle)"
    check a 'the game name is spoken' "$(has "$heard" "$title")" "$title"
    check a 'the dialog role is spoken' "$(has "$heard" dialog)" 'dialog'
    check a 'the dialog is not announced as clickable' "$(lacks "$heard" clickable)" 'clickable'
    if [ -n "$tail_words" ]; then
      check a 'the body is not read automatically' "$(lacks "$heard" "$tail_words")" "$tail_words"
    fi
    echo "dialog: $(grep -oiw dialog <<< "$heard" | wc -l), heading: $(grep -oiw heading <<< "$heard" | wc -l)" | tee -a "$out/counts-a.txt"
    press 'close with Escape' 4 111
    heard=$(spoken)
    shot a-03-closed
    focus
    check a 'Escape closes the dialog' "$([ "$(field .dialog)" = false ] && echo 1 || echo 0)" "dialog open: $(field .dialog)"
    check a 'focus returns to the card' "$([ "$(field .link)" = true ] && [ "$(field .card)" = "$title" ] && echo 1 || echo 0)" "$(field .tag) $(field .card)"
    check a 'the card name is spoken on return' "$(has "$heard" "$title")" "$title"
  else
    shot a-fail
    check a 'a card is reachable by Tab' 0 "$(cat "$out/focus.json")"
  fi

  # (c) Menu, then Settings & backups: choose Lite, hear it saved, close, and return to Menu.
  log 'journey (c): settings'
  echo '# (c) settings' >> "$out/speech.txt"
  open_page "$origin/?catalogs=off&talkback=c"
  shot c-01-opened
  if tab_until 'Tab to Menu' '.tag == "BUTTON" and .text == "Menu"' 60; then
    press 'open Menu with Enter' 3 66
    if tab_until 'Tab to Settings & backups' '.tag == "BUTTON" and (.text | startswith("Settings & backups"))' 40; then
      press 'open Settings & backups with Enter' 4 66
      shot c-02-settings
      if tab_until 'Tab to the visual experience radios' '.radio != null' 40; then
        saved=0; lite=0; heard_all=''
        for i in 1 2 3 4; do
          press "ArrowUp toward Lite ($i)" 3 19
          heard_all="$heard_all $(spoken)"
          focus > /dev/null
          if [ "$(field .radio.label)" = Lite ] && [ "$(field .radio.checked)" = true ]; then lite=1; break; fi
        done
        shot c-03-lite
        check c 'Lite is selected by keyboard' "$lite" "$(field .radio.label) checked=$(field .radio.checked)"
        check c 'the save is announced' "$(has "$heard_all" 'Visual preference saved.')" 'Visual preference saved.'
        check c 'Lite is spoken' "$(has "$heard_all" lite)" 'Lite'
        heard=''
        for i in 1 2 3; do
          press "close Settings & backups with Escape ($i)" 3 111
          heard="$heard $(spoken)"
          focus > /dev/null
          [ "$(field .dialog)" = false ] && break
        done
        shot c-04-closed
        check c 'Escape closes Settings & backups' "$([ "$(field .dialog)" = false ] && echo 1 || echo 0)" "$(field .tag) $(field .text)"
        check c 'focus returns to Menu' "$([ "$(field .text)" = Menu ] && echo 1 || echo 0)" "$(field .tag) $(field .text)"
        check c 'Menu is spoken on return' "$(has "$heard" menu)" 'Menu'
      else check c 'the radios are reachable by Tab' 0 "$(cat "$out/focus.json")"; fi
    else check c 'Settings & backups is reachable by Tab' 0 "$(cat "$out/focus.json")"; fi
  else check c 'Menu is reachable by Tab' 0 "$(cat "$out/focus.json")"; fi
fi

log 'checks'
cat "$out/checks.tsv" | tee -a "$out/run.txt"
{
  echo "### TalkBack smoke: $origin"
  echo ''
  echo "index.html SHA-256 \`$index_sha\`"
  echo ''
  echo '| Result | Journey | Check | Detail |'
  echo '|---|---|---|---|'
  sed 's/|/\\|/g; s/\t/ | /g; s/^/| /; s/$/ |/' "$out/checks.tsv"
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
log "failed checks: $fails"
[ "$fails" -eq 0 ]
