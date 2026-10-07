#!/bin/sh
set -eu
project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
label="local.mobile-desktop-preview"
plist="$HOME/Library/LaunchAgents/$label.plist"
node_bin=$(command -v node)
# LaunchAgents run a local runtime copy rather than starting from Desktop.
# Re-run this installer after changing wrapper code or preview configuration.
runtime_dir="$HOME/Library/Application Support/Mobile Desktop Preview"
mkdir -p "$runtime_dir/public"
cp "$project_dir/server.mjs" "$runtime_dir/server.mjs"
cp -R "$project_dir/public/." "$runtime_dir/public/"
if [ -f "$project_dir/.preview.json" ]; then
  cp "$project_dir/.preview.json" "$runtime_dir/.preview.json"
  chmod 600 "$runtime_dir/.preview.json"
fi
mkdir -p "$runtime_dir/.profiles"
# Runtime owns a snapshot of the registered profiles, refreshed on each install.
find "$runtime_dir/.profiles" -name '*.json' -type f -delete
if [ -d "$project_dir/.profiles" ]; then cp -R "$project_dir/.profiles/." "$runtime_dir/.profiles/"; fi
mkdir -p "$HOME/Library/LaunchAgents"
node --input-type=module - "$project_dir/assets/macos-service.plist" "$runtime_dir" "$node_bin" "$plist" <<'JS'
import {readFileSync, writeFileSync} from 'node:fs';
const [template, runtime, node, output] = process.argv.slice(2);
const xml = value => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
let content = readFileSync(template, 'utf8').replaceAll('__PROJECT__',xml(runtime)).replaceAll('__NODE__',xml(node));
content = content.replace('</dict></plist>', `<key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(process.env.PATH || '/usr/bin:/bin')}</string></dict></dict></plist>`);
writeFileSync(output, content, {mode:0o600});
JS
plutil -lint "$plist"
launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
launchctl enable "gui/$(id -u)/$label"
# bootout may return before launchd has fully removed the old job.
attempt=0
until launchctl bootstrap "gui/$(id -u)" "$plist" 2>"$runtime_dir/bootstrap-error.log"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 10 ]; then
    cat "$runtime_dir/bootstrap-error.log" >&2
    exit 1
  fi
  sleep 0.5
done
launchctl kickstart -k "gui/$(id -u)/$label"
echo "Installed $label"
