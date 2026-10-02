#!/usr/bin/env bash
# Probe: which packages the image has, whether TalkBack starts, and what it logs while Chrome is driven by keys.
set -u
out="${OUT:-artifacts/talkback}"
mkdir -p "$out"
log() { echo "== $*" | tee -a "$out/probe.txt"; }
run() { log "\$ $*"; "$@" 2>&1 | tee -a "$out/probe.txt"; }

TB=com.google.android.marvin.talkback
run adb root
sleep 3
run adb wait-for-device
run adb shell getprop ro.build.fingerprint
run adb shell getprop ro.build.type
run adb shell id
run adb shell 'pm list packages | grep -iE "talkback|accessibility|chrome|tts|webview"'
run adb shell "dumpsys package $TB | grep -E 'versionName|versionCode' | head -4"
run adb shell 'dumpsys package com.android.chrome | grep -E "versionName" | head -2'
run adb shell 'settings get secure tts_default_synth'

run adb shell "echo '_ --disable-fre --no-default-browser-check --no-first-run' > /data/local/tmp/chrome-command-line"
run adb shell 'am set-debug-app --persistent com.android.chrome'

run adb shell settings put secure enabled_accessibility_services "$TB/com.google.android.marvin.talkback.TalkBackService"
run adb shell settings put secure accessibility_enabled 1
sleep 15
run adb shell 'dumpsys accessibility | grep -iE "talkback|enabled services|bound services" | head -10'
run adb shell "ls -la /data/user_de/0/$TB/shared_prefs /data/data/$TB/shared_prefs"

log 'set verbose log level'
run adb shell settings put secure enabled_accessibility_services null
sleep 3
run adb shell am force-stop "$TB"
for dir in "/data/user_de/0/$TB/shared_prefs" "/data/data/$TB/shared_prefs"; do
  file="$dir/${TB}_preferences.xml"
  run adb shell "ls $file && head -c 3000 $file"
  run adb shell "if [ -f $file ]; then sed -i 's#</map>#<string name=\"pref_log_level\">2</string></map>#' $file; grep pref_log_level $file; fi"
done
run adb shell settings put secure enabled_accessibility_services "$TB/com.google.android.marvin.talkback.TalkBackService"
sleep 15

run adb logcat -c
run adb shell am start -a android.intent.action.VIEW -d "${TARGET_ORIGIN}/" com.android.chrome
sleep 25
adb exec-out screencap -p > "$out/01-opened.png"
for key in 61 61 61 61 61; do adb shell input keyevent "$key"; sleep 2; done
adb exec-out screencap -p > "$out/02-tabbed.png"
adb shell input keyevent 66
sleep 5
adb exec-out screencap -p > "$out/03-enter.png"
adb shell input keyevent 111
sleep 4
adb exec-out screencap -p > "$out/04-escape.png"
adb logcat -d -v threadtime > "$out/logcat.txt"
log 'talkback lines'
grep -iE 'talkback|speech|speak|tts' "$out/logcat.txt" | head -200 | tee -a "$out/probe.txt"
exit 0
