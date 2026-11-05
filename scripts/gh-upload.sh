#!/usr/bin/env bash
# ============================================================
# AuroraStream — Upload para GitHub (fonte + release + assets)
# Uso:  GH_TOKEN='github_pat_...' bash scripts/gh-upload.sh
# Requisito do token (fine-grained PAT):
#   Repository permissions → Contents: READ AND WRITE
#   (Metadata: read já vem incluso automaticamente)
# ============================================================
set -euo pipefail

: "${GH_TOKEN:?Defina a variável GH_TOKEN com o token (Contents: Read and write)}"

REPO="nerdshopshopee-byte/AuroraStream"
SRC="/home/z/my-project/.staging/aurora-src"
DIST="/home/z/my-project/desktop/dist"
API="https://api.github.com"
UP="https://uploads.github.com"
TAG="v1.6.0"

AUTH=(-H "Authorization: Bearer ${GH_TOKEN}" -H "X-GitHub-Api-Version: 2022-11-28" -H "Accept: application/vnd.github+json")

echo "── [1/4] Enviando código-fonte (main)…"
git -C "$SRC" push --force "https://x-access-token:${GH_TOKEN}@github.com/${REPO}.git" main
echo "      ok: https://github.com/${REPO}/tree/main"

echo "── [2/4] Criando release ${TAG}…"
BODY=$(cat <<'JSON'
{
  "tag_name": "v1.6.0",
  "target_commitish": "main",
  "name": "AuroraStream v1.6.0",
  "body": "## Novidades\n\n- **Arquivo único por plataforma** (sem divisão em partes):\n  - Windows: instalador NSIS one-click (`AuroraStream-Setup-1.6.0.exe`)\n  - Linux: AppImage único (`AuroraStream-1.6.0-linux-x86_64.AppImage`)\n- **ffmpeg embutido em TODAS as plataformas** — inclusive Linux (corrige falhas em MKV/AVI que dependiam do ffmpeg do sistema)\n- **Correção do HTTP 500 no Windows**: armazenamento em JSON nativo, sem dependências nativas\n- Streaming mais resiliente: reconexão automática em 429/5xx, pré-buffer otimizado e transcode fMP4 on-the-fly\n\n### Instalação\n- **Windows**: execute o `.exe` (instala e abre automaticamente)\n- **Linux**: `chmod +x` no AppImage, depois execute (requer libfuse2)",
  "draft": false,
  "prerelease": false
}
JSON
)
REL_CODE=$(curl -sS -o /tmp/gh_rel.json -w '%{http_code}' -X POST "${AUTH[@]}" "$API/repos/${REPO}/releases" -d "$BODY")
if [ "$REL_CODE" = "422" ]; then
  echo "      release já existe — obtendo a existente…"
  curl -sS "${AUTH[@]}" "$API/repos/${REPO}/releases/tags/${TAG}" > /tmp/gh_rel.json
elif [ "$REL_CODE" != "201" ]; then
  echo "ERRO ao criar release (HTTP $REL_CODE):"; cat /tmp/gh_rel.json; exit 1
fi
REL_ID=$(python3 -c "import json;print(json.load(open('/tmp/gh_rel.json'))['id'])")
echo "      release id=${REL_ID}"

echo "── [3/4] Enviando assets…"
upload_asset () {
  local f="$1" name mime
  name=$(basename "$f")
  case "$name" in
    *.exe)      mime="application/vnd.microsoft.portable-executable" ;;
    *.AppImage) mime="application/x-executable" ;;
    *.apk)      mime="application/vnd.android.package-archive" ;;
    *)          mime="application/octet-stream" ;;
  esac
  for attempt in 1 2 3; do
    code=$(curl -sS --max-time 580 -o /tmp/gh_asset.json -w '%{http_code}' \
      -X POST "${AUTH[@]}" -H "Content-Type: ${mime}" \
      --data-binary "@${f}" \
      "${UP}/repos/${REPO}/releases/${REL_ID}/assets?name=${name}")
    state=$(python3 -c "import json;d=json.load(open('/tmp/gh_asset.json'));print(d.get('state',''))" 2>/dev/null || echo "")
    if [ "$code" = "201" ] && [ "$state" = "uploaded" ]; then
      echo "      ✔ ${name}"
      return 0
    fi
    echo "      tentativa ${attempt} falhou (HTTP ${code}) — ${name}"
    sleep 3
  done
  echo "ERRO: asset ${name} não subiu"; return 1
}
upload_asset "${DIST}/AuroraStream-Setup-1.6.0.exe"
upload_asset "${DIST}/AuroraStream-1.6.0-linux-x86_64.AppImage"

echo "── [4/4] Verificação final…"
curl -sS "${AUTH[@]}" "$API/repos/${REPO}/releases/${REL_ID}/assets" \
  | python3 -c "import json,sys;[print(f\"  {a['name']}  {a['size']/1048576:.1f} MB  {a['state']}  → {a['browser_download_url']}\") for a in json.load(sys.stdin)]"

echo ""
echo "✔ Concluído!"
echo "  Código : https://github.com/${REPO}"
echo "  Release: https://github.com/${REPO}/releases/tag/${TAG}"
