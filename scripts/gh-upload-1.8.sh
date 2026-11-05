#!/usr/bin/env bash
# ============================================================
# AuroraStream v1.8.0 — cria a release no GitHub e sobe os assets
# Uso: GH_TOKEN='github_pat_...' bash scripts/gh-upload-1.8.sh
# ============================================================
set -euo pipefail

: "${GH_TOKEN:?Defina GH_TOKEN}"

REPO="nerdshopshopee-byte/AuroraStream"
DIST="/home/z/aurorastream/desktop/dist"
API="https://api.github.com"
UP="https://uploads.github.com"
TAG="v1.8.0"

AUTH=(-H "Authorization: Bearer ${GH_TOKEN}" -H "X-GitHub-Api-Version: 2022-11-28" -H "Accept: application/vnd.github+json")

echo "── [1/3] Criando release ${TAG}…"

cat > /tmp/rel-body-18.md <<'MD'
## AuroraStream v1.8.0 — play e buffering corrigidos

Esta versão corrige os erros de reprodução reportados: **filmes, séries e canais que não carregavam ao dar play** e o **"Bufferizando…" que reiniciava a cada 2 segundos**.

### 🎬 Correções principais
- **Play não carregava**: a sessão retornada pelo login vinha **sem a senha do painel** — o app não conseguia montar as URLs de stream e o player ficava eternamente em "Bufferizando 0%" até recarregar a página (F5). Agora a sessão completa chega no login e o play resolve a URL na hora.
- **Buffering a cada 2 s**: overlay com **progresso real do buffer** (antes usava contador fake que enchia em ~2 s e criava intervalos zumbis), buffers HLS mais profundos (40 s ao vivo / 90 s VOD), **pré-busca do próximo fragmento** (`startFragPrefetch`) e ABR conservador na largada.
- **Conexões órfãs no proxy**: playlists `.m3u8` agora abortam corretamente quando você fecha o player — evita estourar o limite de conexões do painel, que pendurava os próximos plays.
- **Séries pelo clique no pôster**: abre a ficha com os episódios (antes tentava tocar a série direto → 404 → não carregava).
- **"Continuar assistindo"**: retoma a posição também em MP4 direto (antes só em HLS).
- **"Tentar novamente"**: refaz toda a cadeia de reprodução (HLS → direto → remux → transcode).

### 📥 Downloads (instaladores de arquivo único)
| Plataforma | Arquivo |
| --- | --- |
| Windows x64 | `AuroraStream-Setup-1.8.0.exe` |
| Linux x86_64 | `AuroraStream-1.8.0-linux-x86_64.AppImage` |
| Android 8.0+ | `AuroraStream-1.8.0-android.apk` |

### 💡 Instalação
- **Windows**: execute o `.exe` (one-click — instala e abre automaticamente)
- **Linux**: `chmod +x AuroraStream-1.8.0-linux-x86_64.AppImage` e execute (requer `libfuse2`)
- **Android**: instale o `.apk` (app autônomo — fala direto ao painel, sem servidor intermediário)

> Os instaladores de desktop incluem o **ffmpeg embutido** — nada precisa ser instalado no sistema.

**Código-fonte**: https://github.com/nerdshopshopee-byte/AuroraStream/tree/v1.8.0
MD
python3 - <<'PYEOF'
import json
body = open('/tmp/rel-body-18.md').read()
json.dump({
  "tag_name": "v1.8.0",
  "target_commitish": "main",
  "name": "AuroraStream v1.8.0 — play corrigido",
  "body": body,
  "draft": False,
  "prerelease": False
}, open('/tmp/rel-payload-18.json','w'))
PYEOF

REL_CODE=$(curl -sS -o /tmp/gh_rel18.json -w '%{http_code}' -X POST "${AUTH[@]}" "$API/repos/${REPO}/releases" -d @/tmp/rel-payload-18.json)
if [ "$REL_CODE" = "422" ]; then
  echo "   release já existe — obtendo a existente…"
  curl -sS "${AUTH[@]}" "$API/repos/${REPO}/releases/tags/${TAG}" > /tmp/gh_rel18.json
elif [ "$REL_CODE" != "201" ]; then
  echo "ERRO ao criar release (HTTP $REL_CODE):"; cat /tmp/gh_rel18.json | head -c 400; exit 1
fi
REL_ID=$(python3 -c "import json;print(json.load(open('/tmp/gh_rel18.json'))['id'])")
echo "   release id=${REL_ID}"

echo "── [2/3] Enviando assets (~279 MB no total)…"
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
    code=$(curl -sS --max-time 580 -o /tmp/gh_asset18.json -w '%{http_code}' \
      -X POST "${AUTH[@]}" -H "Content-Type: ${mime}" \
      --data-binary "@${f}" \
      "${UP}/repos/${REPO}/releases/${REL_ID}/assets?name=${name}")
    state=$(python3 -c "import json;d=json.load(open('/tmp/gh_asset18.json'));print(d.get('state',''))" 2>/dev/null || echo "")
    if [ "$code" = "201" ] && [ "$state" = "uploaded" ]; then
      echo "   ✔ ${name}"
      return 0
    fi
    echo "   tentativa ${attempt} falhou (HTTP ${code}) — ${name}"
    sleep 5
  done
  echo "ERRO: asset ${name} não subiu" >&2
  return 1
}

upload_asset "${DIST}/AuroraStream-Setup-1.8.0.exe"
upload_asset "${DIST}/AuroraStream-1.8.0-linux-x86_64.AppImage"
upload_asset "${DIST}/AuroraStream-1.8.0-android.apk"

echo "── [3/3] Verificação final…"
curl -sS "${AUTH[@]}" "$API/repos/${REPO}/releases/${REL_ID}/assets" \
  | python3 -c "import json,sys;[print(f\"  {a['name']}  {a['size']/1048576:.1f} MB  {a['state']}  → {a['browser_download_url']}\") for a in json.load(sys.stdin)]"

echo ""
echo "✔ Concluído!"
echo "  Release: https://github.com/${REPO}/releases/tag/${TAG}"
