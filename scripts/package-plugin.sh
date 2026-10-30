#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
plugin_root="$repo_root/plugins/hcmus-course"
output_dir="$repo_root/dist/plugin"
version=$(node -p "JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8')).version" "$plugin_root/plugin.json")
archive="$output_dir/hcmus-course-$version-codex.zip"
staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT HUP INT TERM

cp -R "$plugin_root/plugin.json" "$plugin_root/README.md" "$plugin_root/skills" "$plugin_root/assets" "$staging/"
mkdir -p "$output_dir"
rm -f "$archive"
cd "$staging"
zip -q -r "$archive" plugin.json README.md skills assets
