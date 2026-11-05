# AuroraStream

**Player IPTV para servidores Xtream Codes** — Filmes • Séries • TV ao vivo • Futebol, com interface estilo dashboard (glassmorphism) inspirada no AuroraFlow/Xbox 360.

## ✨ Recursos

- **Login Xtream Codes** (usuário, senha e DNS do servidor) com múltiplas contas
- **Filmes e Séries**: catálogo VOD com detalhes, temporadas, episódios, favoritos e "continuar assistindo" (progresso salvo por perfil)
- **TV ao vivo**: grades de canais por categoria, EPG (guia de programação) e player HLS
- **Futebol**: tela dedicada com os jogos do dia e canais esportivos
- **Busca global**, controle parental por PIN e biblioteca de favoritos
- **APK Android nativo**: app autônomo (Capacitor) — fala direto ao painel via CapacitorHttp, sem servidor intermediário
- **PWA** completa (instalável no Android/desktop) — base do APK via TWA
- **Streaming robusto (v1.8.0)**:
  - **Correção do "dar play e não carregar"**: o login devolvia a sessão sem a senha do painel — o cliente não conseguia montar as URLs de stream e o player ficava eternamente em "Bufferizando 0%" até recarregar a página (agora a sessão completa chega no login e o play resolve a URL na hora)
  - **Correção do "Bufferizando… a cada 2 segundos"**: overlay com progresso REAL do buffer (antes: contador fake que enchia em ~2 s + intervalos zumbis a cada travada) + buffers HLS mais profundos (40 s live / 90 s VOD) + pré-busca do próximo fragmento (`startFragPrefetch`) + ABR conservador na largada
  - **Proxy sem conexões órfãs**: playlists `.m3u8` abortam corretamente quando o cliente desconecta (`AbortSignal.any`) — evita estourar o limite de conexões do painel, que pendurava os próximos plays
  - **Séries no clique do carrossel**: clicar num card de série abre a ficha com episódios (antes montava `/series/{series_id}.mp4` → 404 → "não carrega")
  - **"Continuar assistindo" retoma em MP4 direto**: arquivos via `<video>` agora aplicam a posição salva (antes só HLS/Safari retomavam)
  - **"Tentar novamente" de verdade**: re-executa toda a cadeia de boot (HLS → direto → remux → transcode) em vez de só `hls.startLoad()`
  - **Remux ffmpeg `-c copy` em tempo real** — antídoto ao "Bufferizando…" eterno (painéis que respondem ao `.m3u8` com fluxo TS bruto/infinito); serve até 4K com CPU ~zero
  - Cadeia de fallback: HLS → direto → remux → transcode x264 720p
  - Proxy com `Range` (seek real) e abort de conexões órfãs (respeita limite do painel)
  - HLS nativo (Safari) e via hls.js nos demais navegadores
  - Proxy com suporte a `Range` para arquivos MP4/MKV diretos (seek real)
  - Transcode on-the-fly com ffmpeg (fMP4 fragmentado) para MKV/AVI quando o servidor não entrega MP4/HLS
  - Reconexão automática em erros HTTP 429/5xx e pré-buffer otimizado

## 📦 Downloads (instaladores de arquivo único)

| Plataforma | Arquivo | Tamanho |
| --- | --- | --- |
| Windows x64 | `AuroraStream-Setup-1.8.0.exe` (NSIS one-click) | ~116 MB |
| Linux x86_64 | `AuroraStream-1.8.0-linux-x86_64.AppImage` | ~144 MB |
| Android | `AuroraStream-1.8.0-android.apk` (nativo, autônomo) | ~4,2 MB |


> Os instaladores de desktop incluem o **ffmpeg embutido** — não é necessário instalar nada no sistema.
> Baixe pela aba [**Releases**](https://github.com/nerdshopshopee-byte/AuroraStream/releases).

### Requisitos
- **Windows**: Windows 10/11 x64
- **Linux**: distribuição x86_64 com FUSE (`sudo apt install libfuse2`, se necessário para AppImage)
- **Android**: Android 8.0+

## 🚀 Rodar em desenvolvimento

```bash
npm install        # ou bun install
npm run dev        # http://localhost:3000
```

### Build desktop (Electron)

```bash
# 1. Empacota o Next.js em modo standalone
npm run build

# 2. Monta o bundle do servidor que vai embutido no Electron
cp -r .next/standalone desktop/app-bundle
cp -r .next/static desktop/app-bundle/.next/static
cp -r public desktop/app-bundle/public

# 3. Gera os instaladores
cd desktop
npm ci
npx electron-builder --win    # AuroraStream-Setup-1.6.0.exe
npx electron-builder --linux  # AuroraStream-1.6.0-linux-x86_64.AppImage
```

> Os binários do ffmpeg ficam em `desktop/ffmpeg/{win64,linux64}` e são embutidos como `extraResources`.

## 🗂️ Estrutura

```
src/app/api/          → Rotas API: auth, xtream, stream (proxy HLS), transcode (ffmpeg), favorites, progress
src/components/aurora → UI: Dashboard, Player, grids, EPG, busca, controle parental
src/lib/              → db (armazenamento JSON), xtream (cliente Xtream Codes), store (zustand)
desktop/              → Electron: main.js + electron-builder.yml + ffmpeg/
```

## 🛠️ Stack

Next.js 16 (App Router, Turbopack) • React 19 • TypeScript • Tailwind CSS 4 • zustand • hls.js • framer-motion • lucide-react • Electron 33 • ffmpeg

## 📄 Licença

MIT
