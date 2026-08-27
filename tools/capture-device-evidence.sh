#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"
label="${1:-auto-restart}"
safe_label="$(printf '%s' "$label" | tr -cs 'A-Za-z0-9._-' '-')"
connected_devices="$(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')"
device_count="$(printf '%s\n' "$connected_devices" | sed '/^$/d' | wc -l | tr -d ' ')"

if [ "$device_count" -ne 1 ]; then
  echo "Expected exactly one authorized ADB device, found $device_count." >&2
  adb devices -l >&2
  exit 1
fi

serial="$(printf '%s\n' "$connected_devices" | sed -n '1p')"
timestamp="$(date '+%Y%m%d-%H%M%S')"
output_dir="$repo_root/evidence/private/$timestamp-$safe_label"
mkdir -p "$output_dir"

{
  echo "captured_at=$(date '+%Y-%m-%dT%H:%M:%S%z')"
  echo "serial=$serial"
  echo "manufacturer=$(adb shell getprop ro.product.manufacturer | tr -d '\r')"
  echo "model=$(adb shell getprop ro.product.model | tr -d '\r')"
  echo "device=$(adb shell getprop ro.product.device | tr -d '\r')"
  echo "android=$(adb shell getprop ro.build.version.release | tr -d '\r')"
  echo "build_id=$(adb shell getprop ro.build.display.id | tr -d '\r')"
  echo "incremental=$(adb shell getprop ro.build.version.incremental | tr -d '\r')"
  echo "fingerprint=$(adb shell getprop ro.build.fingerprint | tr -d '\r')"
  echo "source_commit=$(git rev-parse HEAD)"
  echo "source=$repo_root"
} > "$output_dir/device-info.txt"

echo "Private evidence directory: $output_dir"
echo
echo "Fixed voice protocol:"
echo "  1. 王秘书说他凌晨一点半"
echo "  2. Pause for 2 to 3 seconds"
echo "  3. 在蓝色会议室"
echo "  4. Pause for 2 to 3 seconds"
echo "  5. 桌上放着一份文件"
echo "  6. Repeat for at least 10 rounds or until WATCHDOG_NO_CALLBACK"
echo
echo "Capturing full logcat. Press Ctrl-C after the run."

finish_capture() {
  echo
  echo "Capture stopped. Raw files remain private: $output_dir"
}
trap finish_capture EXIT INT TERM

adb logcat -v threadtime | tee "$output_dir/logcat-full.log"
