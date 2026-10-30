#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
plugin_root="$repo_root/plugins/hcmus-course"
output_dir="$repo_root/dist/plugin"
staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT HUP INT TERM

cp -R "$plugin_root/plugin.json" "$plugin_root/README.md" "$plugin_root/skills" "$plugin_root/assets" "$staging/"
mkdir -p "$output_dir"
rm -f "$output_dir/hcmus-course-0.2.0-codex.zip"
cd "$staging"
zip -q -r "$output_dir/hcmus-course-0.2.0-codex.zip" plugin.json README.md skills assets
