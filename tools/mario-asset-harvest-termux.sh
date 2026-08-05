#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail

export LANG=C.UTF-8
export LC_ALL=C.UTF-8

OUT_NAME="mario-web-engine-asset-pool-complete.zip"
SHA_NAME="$OUT_NAME.sha256"
DOWNLOADS="$HOME/storage/downloads"
ROOT="$HOME/.cache/mario-asset-harvest-complete"
REPOS_DIR="$ROOT/repos"
STAGING="$ROOT/staging"
POOL="$ROOT/mario-web-engine-asset-pool-complete"
OUTPUT="$DOWNLOADS/$OUT_NAME"
OUTPUT_SHA="$DOWNLOADS/$SHA_NAME"
MAX_FILE_MB=100

log() { printf '\n[%s] %s\n' "$(date '+%F %T')" "$*"; }
fail() { printf '\n错误：%s\n' "$*" >&2; exit 1; }

termux-wake-lock >/dev/null 2>&1 || true
cleanup() {
  rm -rf "$REPOS_DIR" "$STAGING"
  termux-wake-unlock >/dev/null 2>&1 || true
}
trap cleanup EXIT

log "申请手机存储权限"
termux-setup-storage >/dev/null 2>&1 || true
sleep 2
[ -d "$DOWNLOADS" ] || fail "没有找到手机 Download 目录。请允许 Termux 的文件访问权限后重新执行。"

log "安装本机所需工具"
pkg update -y
pkg install -y git zip unzip coreutils findutils file ca-certificates curl python

rm -rf "$ROOT"
mkdir -p "$REPOS_DIR" "$STAGING" "$POOL/assets" "$POOL/licenses" "$POOL/logs" "$POOL/manifests"
rm -f "$OUTPUT" "$OUTPUT_SHA"

cat > "$POOL/manifests/repositories.txt" <<'REPOS'
reruns/mario
tylerreichle/mario_js
marianamoiolicapelari/super-mario
MatheusCouti/SuperMario
fairyyang888/super-mario-html5-game
jytprks/super-mario
UMJS/Game-SuperMario
Chriszhang6/mario
mattysteves/super-mario-bros
aayushman108/Super-Mario_Js-Final-Project
earkyAutoMode/super-mario-clone
vimaltiwari2612/Super-Mario-Bros
YvesDeSa/dio-super-mario
RoaAssaad/super-princess-peach-game
JoaoGabriellBR/SuperMarioGame
tomoto0/super_mario
tomoto0/super_mario_game
AlineCarolina/Mario-Javascript
TheDataPioneer/Super_Bowsers_World
raphaelchiqueti13/SuperMario_Game
FullMonkeyy/Super-Mario-Web-Game
LABELLECANDIDO/jogomario.github.io
GabsAmorim/JavaScriptGame
CaioNazario/JogoMario
scottyrogers10/mario-underground
arminrosu/super-lcdgame.js
kubowania/mario
Stabyourself/mari0
Mari0-CE/Mari0-Community-Edition
FullScreenShenanigans/FullScreenMario
REPOS

cat > "$ROOT/index_assets.py" <<'PY'
from __future__ import annotations

import csv
import hashlib
import mimetypes
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

pool = Path(sys.argv[1])
source_root = Path(sys.argv[2])
source_name = sys.argv[3]
max_bytes = int(sys.argv[4])
assets_root = pool / "assets"
licenses_root = pool / "licenses" / source_name.replace("/", "__")
manifests = pool / "manifests"
assets_root.mkdir(parents=True, exist_ok=True)
licenses_root.mkdir(parents=True, exist_ok=True)
manifests.mkdir(parents=True, exist_ok=True)

asset_exts = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".ico", ".apng", ".tga", ".ase", ".aseprite", ".psd",
    ".wav", ".ogg", ".mp3", ".flac", ".m4a", ".aac", ".mid", ".midi", ".mod", ".xm", ".s3m",
    ".ttf", ".otf", ".woff", ".woff2", ".fnt",
    ".tmx", ".tsx", ".tmj", ".tsj", ".ldtk", ".ldtkl", ".map",
    ".glb", ".gltf", ".obj", ".fbx", ".dae",
    ".mp4", ".webm",
    ".zip", ".7z", ".rar", ".tar", ".gz",
}
image_exts = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".ico", ".apng", ".tga", ".ase", ".aseprite", ".psd"}
audio_exts = {".wav", ".ogg", ".mp3", ".flac", ".m4a", ".aac", ".mid", ".midi", ".mod", ".xm", ".s3m"}
font_exts = {".ttf", ".otf", ".woff", ".woff2", ".fnt"}
map_exts = {".tmx", ".tsx", ".tmj", ".tsj", ".ldtk", ".ldtkl", ".map"}
model_exts = {".glb", ".gltf", ".obj", ".fbx", ".dae"}
video_exts = {".mp4", ".webm"}
archive_exts = {".zip", ".7z", ".rar", ".tar", ".gz"}

license_re = re.compile(r"^(license|copying|notice|readme|credits|attribution)(\.|$)", re.I)
json_asset_re = re.compile(r"(atlas|sprite|tile|level|map|animation|anim|scene|world)", re.I)

patterns = [
    ("images/characters", r"(^|[/_. -])(mario|luigi|peach|toad|player|hero|character|avatar)([/_. -]|$)"),
    ("images/bosses", r"(^|[/_. -])(boss|bowser|king boo|wart|koopaling)([/_. -]|$)"),
    ("images/mounts", r"(^|[/_. -])(yoshi|mount|vehicle|kart)([/_. -]|$)"),
    ("images/enemies", r"(^|[/_. -])(enemy|enemies|goomba|koopa|boo|piranha|shy.?guy|thwomp|bullet|bob.?omb|cheep|blooper|hammer.?bro)([/_. -]|$)"),
    ("images/items", r"(^|[/_. -])(item|items|coin|mushroom|flower|star|power.?up|key|collect|pickup)([/_. -]|$)"),
    ("images/tiles", r"(^|[/_. -])(tile|tiles|tileset|terrain|ground|block|brick|pipe|platform|castle|level)([/_. -]|$)"),
    ("images/backgrounds", r"(^|[/_. -])(background|bg|sky|cloud|mountain|forest|desert|cave|underground|water|parallax|scenery)([/_. -]|$)"),
    ("images/ui", r"(^|[/_. -])(ui|hud|menu|button|icon|logo|title|font|interface|cursor|controller)([/_. -]|$)"),
    ("images/effects", r"(^|[/_. -])(effect|effects|particle|smoke|spark|dust|fire|explosion|splash|shine|trail)([/_. -]|$)"),
]

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def category(path: Path) -> str | None:
    ext = path.suffix.lower()
    rel = str(path).replace("\\", "/").lower()
    name = path.name.lower()
    if ext in image_exts:
        for cat, pat in patterns:
            if re.search(pat, rel, re.I):
                return cat
        return "images/unclassified"
    if ext in audio_exts:
        if re.search(r"(^|[/_. -])(bgm|music|song|theme|soundtrack|ost|overworld|underground)([/_. -]|$)", rel, re.I):
            return "audio/music"
        return "audio/sound-effects"
    if ext in font_exts:
        return "fonts"
    if ext in map_exts:
        return "maps-and-level-data"
    if ext in model_exts:
        return "models-3d"
    if ext in video_exts:
        return "video"
    if ext in archive_exts:
        return "embedded-archives"
    if ext == ".json" and json_asset_re.search(name):
        return "maps-and-level-data"
    return None


def mime(path: Path) -> str:
    try:
        result = subprocess.run(["file", "-b", "--mime-type", str(path)], capture_output=True, text=True, timeout=20)
        return result.stdout.strip() or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    except Exception:
        return mimetypes.guess_type(path.name)[0] or "application/octet-stream"

index_path = manifests / "source-index.tsv"
skipped_path = manifests / "skipped-files.tsv"
new_index = not index_path.exists()
new_skipped = not skipped_path.exists()

count = 0
bytes_total = 0
unique_added = 0

with index_path.open("a", newline="", encoding="utf-8") as index_f, skipped_path.open("a", newline="", encoding="utf-8") as skip_f:
    iw = csv.writer(index_f, delimiter="\t")
    sw = csv.writer(skip_f, delimiter="\t")
    if new_index:
        iw.writerow(["source", "original_path", "sha256", "bytes", "mime", "category", "stored_path"])
    if new_skipped:
        sw.writerow(["source", "original_path", "reason"])

    for p in source_root.rglob("*"):
        if not p.is_file() or ".git" in p.parts:
            continue
        rel = p.relative_to(source_root).as_posix()
        if license_re.match(p.name):
            dest = licenses_root / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            try:
                shutil.copy2(p, dest)
            except OSError:
                pass
        cat = category(p)
        if cat is None:
            continue
        try:
            size = p.stat().st_size
        except OSError:
            continue
        if size > max_bytes:
            sw.writerow([source_name, rel, f"over_{max_bytes // (1024 * 1024)}MB"])
            continue
        digest = sha256(p)
        ext = p.suffix.lower() or ".bin"
        dest = assets_root / cat / f"{digest}{ext}"
        dest.parent.mkdir(parents=True, exist_ok=True)
        if not dest.exists():
            shutil.copy2(p, dest)
            unique_added += 1
        iw.writerow([source_name, rel, digest, size, mime(p), cat, dest.relative_to(pool).as_posix()])
        count += 1
        bytes_total += size

print(f"{count}\t{bytes_total}\t{unique_added}")
PY

printf 'source,status,asset_references,asset_bytes,unique_added,commit,branch\n' > "$POOL/manifests/source-summary.csv"

process_source() {
  local source_name="$1"
  local source_dir="$2"
  local commit="${3:-}"
  local branch="${4:-}"
  local result count bytes unique
  result="$(python "$ROOT/index_assets.py" "$POOL" "$source_dir" "$source_name" "$((MAX_FILE_MB * 1024 * 1024))")"
  IFS=$'\t' read -r count bytes unique <<< "$result"
  printf '%s,ok,%s,%s,%s,%s,%s\n' "$source_name" "$count" "$bytes" "$unique" "$commit" "$branch" >> "$POOL/manifests/source-summary.csv"
}

log "并入手机 Download 中的旧 Mario 项目压缩包"
LOCAL_ZIP="$(find "$DOWNLOADS" -maxdepth 1 -type f \( -iname 'mario-remix-trilogy*.zip' -o -iname 'mario*remix*.zip' \) | LC_ALL=C sort | tail -n 1 || true)"
if [ -n "$LOCAL_ZIP" ]; then
  LOCAL_EXTRACT="$STAGING/local-old-project"
  mkdir -p "$LOCAL_EXTRACT"
  if unzip -q "$LOCAL_ZIP" -d "$LOCAL_EXTRACT"; then
    process_source "local-old-project" "$LOCAL_EXTRACT" "$(sha256sum "$LOCAL_ZIP" | awk '{print $1}')" "local-zip"
    printf '%s\n' "$LOCAL_ZIP" > "$POOL/manifests/local-project-source.txt"
  else
    printf 'local-old-project,extract_failed,0,0,0,,local-zip\n' >> "$POOL/manifests/source-summary.csv"
  fi
else
  printf 'local-old-project,not_found,0,0,0,,local-zip\n' >> "$POOL/manifests/source-summary.csv"
fi

TOTAL_REPOS="$(grep -cve '^$' "$POOL/manifests/repositories.txt")"
INDEX=0
while IFS= read -r repo; do
  repo="${repo//$'\r'/}"
  [ -n "$repo" ] || continue
  INDEX=$((INDEX + 1))
  slug="${repo//\//__}"
  target="$REPOS_DIR/$slug"
  log "[$INDEX/$TOTAL_REPOS] 下载并提取 $repo"
  rm -rf "$target"
  if timeout 600 git -c advice.detachedHead=false clone --depth 1 --single-branch "https://github.com/${repo}.git" "$target" >>"$POOL/logs/harvest.log" 2>&1; then
    commit="$(git -C "$target" rev-parse HEAD 2>/dev/null || true)"
    branch="$(git -C "$target" symbolic-ref --short -q HEAD 2>/dev/null || true)"
    process_source "$repo" "$target" "$commit" "$branch"
  else
    printf '%s,clone_failed,0,0,0,,\n' "$repo" >> "$POOL/manifests/source-summary.csv"
  fi
  rm -rf "$target"
done < "$POOL/manifests/repositories.txt"

log "生成去重统计和完整校验清单"
python - "$POOL" <<'PY'
import csv
import json
import os
import sys
from collections import Counter
from pathlib import Path

pool = Path(sys.argv[1])
index = pool / "manifests/source-index.tsv"
rows = []
if index.exists():
    with index.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f, delimiter="\t"))
by_category = Counter(r["category"] for r in rows)
by_source = Counter(r["source"] for r in rows)
unique = {r["sha256"] for r in rows}
summary = {
    "source_references": len(rows),
    "unique_assets": len(unique),
    "categories": dict(sorted(by_category.items())),
    "sources": dict(sorted(by_source.items())),
}
(pool / "manifests/summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
with (pool / "README.txt").open("w", encoding="utf-8") as f:
    f.write("Mario 网页游戏引擎素材总池\n\n")
    f.write("本包包含旧项目与公开 GitHub 仓库中提取的素材。文件内容按 SHA-256 去重，原始来源路径保存在 manifests/source-index.tsv。\n")
    f.write("分类由文件类型、路径与名称自动完成；images/unclassified 仍需后续逐图视觉复核。\n")
    f.write("许可证与 README 等来源文件位于 licenses/。仓库代码许可证不自动等于素材授权。\n\n")
    f.write(f"素材引用数：{len(rows)}\n")
    f.write(f"去重后素材数：{len(unique)}\n")
PY

(
  cd "$POOL"
  find . -type f ! -name 'SHA256SUMS.txt' -print0 | LC_ALL=C sort -z | xargs -0 sha256sum > SHA256SUMS.txt
)

log "生成手机最终总压缩包"
(
  cd "$ROOT"
  zip -q -0 -r "$OUTPUT" "$(basename "$POOL")"
)
sha256sum "$OUTPUT" > "$OUTPUT_SHA"

SUCCESS="$(awk -F, 'NR>1 && $2=="ok"{n++} END{print n+0}' "$POOL/manifests/source-summary.csv")"
FAILED="$(awk -F, 'NR>1 && $2!="ok"{n++} END{print n+0}' "$POOL/manifests/source-summary.csv")"
UNIQUE="$(find "$POOL/assets" -type f | wc -l | tr -d ' ')"
SIZE="$(du -h "$OUTPUT" | awk '{print $1}')"
HASH="$(sha256sum "$OUTPUT" | awk '{print $1}')"

echo
echo '=================================================='
echo 'Mario 素材总池生成完成'
echo "成功来源：$SUCCESS"
echo "失败或缺失来源：$FAILED"
echo "去重后素材：$UNIQUE"
echo "压缩包大小：$SIZE"
echo "SHA-256：$HASH"
echo "手机文件：$OUTPUT"
echo "校验文件：$OUTPUT_SHA"
echo '=================================================='

termux-open "$OUTPUT" >/dev/null 2>&1 || true
