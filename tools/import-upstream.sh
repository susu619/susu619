#!/usr/bin/env bash
set -euo pipefail

UPSTREAM_REPOSITORY="ByteTuxiaobei/Mario"
UPSTREAM_COMMIT="20eff8077f05690ebca00af42a906b82b37dde22"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

ARCHIVE_URL="https://github.com/${UPSTREAM_REPOSITORY}/archive/${UPSTREAM_COMMIT}.tar.gz"
echo "Importing ${UPSTREAM_REPOSITORY}@${UPSTREAM_COMMIT}"
curl --fail --location --retry 3 --output "$TEMP_DIR/upstream.tar.gz" "$ARCHIVE_URL"
tar -xzf "$TEMP_DIR/upstream.tar.gz" -C "$TEMP_DIR"
SOURCE_DIR="$(find "$TEMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)"

DESTINATION="$ROOT_DIR/upstream/ByteTuxiaobei-Mario"
PUBLIC_DESTINATION="$ROOT_DIR/web/public/upstream"
rm -rf "$DESTINATION" "$PUBLIC_DESTINATION"
mkdir -p "$DESTINATION" "$PUBLIC_DESTINATION"
cp -a "$SOURCE_DIR"/. "$DESTINATION"/

for entry in resources level_data graphics.txt; do
  if [[ -e "$DESTINATION/$entry" ]]; then
    cp -a "$DESTINATION/$entry" "$PUBLIC_DESTINATION/"
  fi
done

printf '%s\n' "$UPSTREAM_COMMIT" > "$DESTINATION/UPSTREAM_COMMIT"
printf '%s\n' "$UPSTREAM_REPOSITORY" > "$DESTINATION/UPSTREAM_REPOSITORY"

python3 - "$PUBLIC_DESTINATION" "$UPSTREAM_REPOSITORY" "$UPSTREAM_COMMIT" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
repository = sys.argv[2]
commit = sys.argv[3]
files = []
for path in sorted(root.rglob('*')):
    if path.is_file() and path.name != 'asset-manifest.json':
        files.append({
            'path': path.relative_to(root).as_posix(),
            'size': path.stat().st_size,
        })
manifest = {
    'repository': repository,
    'commit': commit,
    'files': files,
}
(root / 'asset-manifest.json').write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + '\n',
    encoding='utf-8',
)
PY

echo "Imported $(find "$DESTINATION" -type f | wc -l | tr -d ' ') upstream files"
echo "Published $(find "$PUBLIC_DESTINATION" -type f | wc -l | tr -d ' ') browser asset files"
