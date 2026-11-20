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

printf '[1/4] Building frontend...\n'
pnpm --dir web build
test -f web/dist/index.html

printf '[2/4] Copying frontend to api/internal/server/dist...\n'
# Only this fixed, generated directory is replaced; root dist holds user files.
if [[ -L "$project_dir/api" || -L "$project_dir/api/internal" || -L "$project_dir/api/internal/server" || -L "$project_dir/api/internal/server/dist" ]]; then
    printf 'ERROR: Refusing to replace frontend assets through a symlink.\n' >&2
    exit 1
fi
rm -rf -- "$project_dir/api/internal/server/dist"
mkdir -p -- "$project_dir/api/internal/server/dist"
cp -R -- "$project_dir/web/dist/." "$project_dir/api/internal/server/dist/"

printf '[3/4] Building dist/localshare...\n'
mkdir -p -- "$project_dir/dist"
go -C api build -trimpath -o ../dist/localshare ./cmd/server
printf '[4/4] Building dist/localshare-desktop...\n'
go -C api build -trimpath -tags desktop,production -o ../dist/localshare-desktop ./cmd/desktop

printf '\nBuild complete:\n  %s/dist/localshare\n  %s/dist/localshare-desktop\n' "$project_dir" "$project_dir"
