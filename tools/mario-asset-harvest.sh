#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="/tmp/mario-asset-harvest"
WORK="$ROOT/repos"
POOL="$ROOT/pool"
WEB_ROOT="/opt/mario-remix/dist"
WEB_NAME="mario-github-assets-raw.zip"
FINAL_ZIP="$ROOT/$WEB_NAME"
MAX_FILE_MB=80

log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }

cleanup() {
  rm -rf "$WORK"
}
trap cleanup EXIT

log "安装抓取工具"
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y git zip unzip rsync coreutils file ca-certificates curl

rm -rf "$ROOT"
mkdir -p "$WORK" "$POOL/raw" "$POOL/licenses" "$POOL/logs"

cat > "$POOL/repositories.txt" <<'REPOS'
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

printf 'repository,status,asset_files,asset_bytes,commit,branch\n' > "$POOL/repository-summary.csv"
printf 'repository\tpath\treason\n' > "$POOL/skipped-files.tsv"

asset_find() {
  local base="$1"
  find "$base" -type f -not -path '*/.git/*' \( \
    -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.gif' -o -iname '*.webp' -o -iname '*.bmp' -o -iname '*.svg' -o -iname '*.ico' -o -iname '*.apng' -o -iname '*.tga' -o -iname '*.ase' -o -iname '*.aseprite' -o -iname '*.psd' \
    -o -iname '*.wav' -o -iname '*.ogg' -o -iname '*.mp3' -o -iname '*.flac' -o -iname '*.m4a' -o -iname '*.aac' -o -iname '*.mid' -o -iname '*.midi' -o -iname '*.mod' -o -iname '*.xm' -o -iname '*.s3m' \
    -o -iname '*.ttf' -o -iname '*.otf' -o -iname '*.woff' -o -iname '*.woff2' -o -iname '*.fnt' \
    -o -iname '*.tmx' -o -iname '*.tsx' -o -iname '*.tmj' -o -iname '*.tsj' -o -iname '*.ldtk' -o -iname '*.ldtkl' -o -iname '*.map' \
    -o -iname '*.glb' -o -iname '*.gltf' -o -iname '*.obj' -o -iname '*.fbx' -o -iname '*.dae' \
    -o -iname '*.mp4' -o -iname '*.webm' \
    -o -iname '*.zip' -o -iname '*.7z' -o -iname '*.rar' -o -iname '*.tar' -o -iname '*.gz' \
    -o -iname '*atlas*.json' -o -iname '*sprites*.json' -o -iname '*tiles*.json' -o -iname '*level*.json' -o -iname '*map*.json' \
  \) -print0
}

TOTAL_REPOS="$(grep -cve '^$' "$POOL/repositories.txt")"
INDEX=0

while IFS= read -r repo; do
  repo="${repo//$'\r'/}"
  [ -n "$repo" ] || continue
  INDEX=$((INDEX + 1))
  slug="${repo//\//__}"
  target="$WORK/$slug"
  out="$POOL/raw/$slug"
  licout="$POOL/licenses/$slug"
  mkdir -p "$out" "$licout"

  log "[$INDEX/$TOTAL_REPOS] 下载 $repo"
  rm -rf "$target"

  if ! timeout 300 git -c advice.detachedHead=false clone --depth 1 --single-branch "https://github.com/${repo}.git" "$target" >>"$POOL/logs/harvest.log" 2>&1; then
    printf '%s,clone_failed,0,0,,\n' "$repo" >> "$POOL/repository-summary.csv"
    rm -rf "$target"
    continue
  fi

  commit="$(git -C "$target" rev-parse HEAD 2>/dev/null || true)"
  branch="$(git -C "$target" symbolic-ref --short -q HEAD 2>/dev/null || true)"
  count=0
  bytes=0
  max_bytes=$((MAX_FILE_MB * 1024 * 1024))

  while IFS= read -r -d '' src; do
    rel="${src#"$target"/}"
    size="$(stat -c '%s' "$src" 2>/dev/null || echo 0)"
    if [ "$size" -gt "$max_bytes" ]; then
      printf '%s\t%s\tover_%sMB\n' "$repo" "$rel" "$MAX_FILE_MB" >> "$POOL/skipped-files.tsv"
      continue
    fi
    mkdir -p "$out/$(dirname "$rel")"
    cp -p "$src" "$out/$rel"
    count=$((count + 1))
    bytes=$((bytes + size))
  done < <(asset_find "$target")

  while IFS= read -r -d '' doc; do
    rel="${doc#"$target"/}"
    mkdir -p "$licout/$(dirname "$rel")"
    cp -p "$doc" "$licout/$rel"
  done < <(
    find "$target" -type f -not -path '*/.git/*' \( \
      -iname 'LICENSE*' -o -iname 'COPYING*' -o -iname 'NOTICE*' \
      -o -iname 'README*' -o -iname 'CREDITS*' -o -iname 'ATTRIBUTION*' \
    \) -print0
  )

  printf '%s,ok,%s,%s,%s,%s\n' "$repo" "$count" "$bytes" "$commit" "$branch" >> "$POOL/repository-summary.csv"
  rm -rf "$target"
done < "$POOL/repositories.txt"

log "生成完整校验清单"
(
  cd "$POOL"
  find raw licenses -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum > all-files-sha256.txt
)

log "压缩抓取结果"
(
  cd "$ROOT"
  zip -q -0 -r "$FINAL_ZIP" pool
)
sha256sum "$FINAL_ZIP" > "$FINAL_ZIP.sha256"

if [ ! -d "$WEB_ROOT" ]; then
  echo "错误：没有找到 $WEB_ROOT，Mario Remix 可能未部署。" >&2
  echo "抓取包仍保存在：$FINAL_ZIP" >&2
  exit 1
fi

log "发布临时下载文件"
sudo install -m 0644 "$FINAL_ZIP" "$WEB_ROOT/$WEB_NAME"
sudo install -m 0644 "$FINAL_ZIP.sha256" "$WEB_ROOT/$WEB_NAME.sha256"

if curl -fsSI "http://127.0.0.1:8080/$WEB_NAME" >/dev/null 2>&1; then
  log "服务器本地下载检查通过"
else
  log "警告：文件已写入 dist，但本地 HTTP 检查未通过，请检查 Mario Remix 服务"
fi

SUCCESS="$(awk -F, 'NR>1 && $2=="ok"{n++} END{print n+0}' "$POOL/repository-summary.csv")"
FAILED="$(awk -F, 'NR>1 && $2!="ok"{n++} END{print n+0}' "$POOL/repository-summary.csv")"
FILES="$(find "$POOL/raw" -type f | wc -l)"
SIZE="$(du -h "$FINAL_ZIP" | awk '{print $1}')"
HASH="$(sha256sum "$FINAL_ZIP" | awk '{print $1}')"

echo
echo '=================================================='
echo 'GitHub 素材仓库抓取完成'
echo "成功仓库：$SUCCESS"
echo "失败仓库：$FAILED"
echo "素材文件：$FILES"
echo "压缩包大小：$SIZE"
echo "SHA-256：$HASH"
echo '下载地址：'
echo 'http://115.159.198.69/mario-github-assets-raw.zip'
echo '=================================================='
