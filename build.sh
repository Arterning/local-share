#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd -- "$project_dir"

for tool in node pnpm go; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        printf 'ERROR: %s is required and must be on PATH.\n' "$tool" >&2
        exit 1
    fi
done

printf '[1/3] Building frontend...\n'
pnpm --dir web build
test -f web/dist/index.html

printf '[2/3] Copying frontend to api/dist...\n'
# Only this fixed, generated directory is replaced; root dist holds user files.
if [[ -L "$project_dir/api" || -L "$project_dir/api/dist" ]]; then
    printf 'ERROR: Refusing to replace frontend assets through a symlink.\n' >&2
    exit 1
fi
rm -rf -- "$project_dir/api/dist"
mkdir -p -- "$project_dir/api/dist"
cp -R -- "$project_dir/web/dist/." "$project_dir/api/dist/"

printf '[3/3] Building dist/localshare...\n'
mkdir -p -- "$project_dir/dist"
go -C api build -trimpath -o ../dist/localshare .

printf '\nBuild complete: %s/dist/localshare\n' "$project_dir"
