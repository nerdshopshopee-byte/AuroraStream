# AuroraStream

**Player IPTV para servidores Xtream Codes** — Filmes • Séries • TV ao vivo • Futebol, com interface estilo dashboard (glassmorphism) inspirada no AuroraFlow/Xbox 360.

## ✨ Recursos

- **Login Xtream Codes** (usuário, senha e DNS) com múltiplas contas
- **Filmes e Séries**: catálogo VOD, temporadas, episódios, favoritos e "continuar assistindo"
- **TV ao vivo**: grades por categoria, EPG e player HLS
- **Futebol**: tela dedicada com os jogos do dia
- **Busca global**, controle parental por PIN
- **Streaming robusto (v1.7.0)**:
  - hls.js com buffer agressivo e ABR
  - **Remux ffmpeg `-c copy` em tempo real** — antídoto ao "Bufferizando…" eterno (painéis que respondem ao `.m3u8` com fluxo TS bruto/infinito); serve até canais 4K com CPU ~zero
  - Transcode x264 720p para MKV/AVI/WMV/FLV/MPG
  - Proxy com `Range` (seek real em MP4) e abort de conexões órfãs (respeita limite de conexões do painel)
  - Cadeia de fallback: HLS → direto → remux → transcode
- **APK Android nativo**: app autônomo — fala direto com o painel (CapacitorHttp, sem CORS), sessão/favoritos/progresso no dispositivo

## 📦 Downloads (arquivo único por plataforma)

| Plataforma | Arquivo | Tamanho |
| --- | --- | --- |
| Windows x64 | `AuroraStream-Setup-1.7.0.exe` (NSIS one-click) | ~122 MB |
| Linux x86_64 | `AuroraStream-1.7.0-linux-x86_64.AppImage` | ~151 MB |
| Android | `AuroraStream-1.7.0-android.apk` (nativo) | ~2 MB |

> Desktop inclui **ffmpeg embutido** — nada para instalar no sistema.
> Baixe pela aba [**Releases**](https://github.com/nerdshopshopee-byte/AuroraStream/releases).

### Requisitos
- **Windows**: Windows 10/11 x64
- **Linux**: x86_64 com FUSE (`sudo apt install libfuse2` se necessário)
- **Android**: Android 6.0+ (Capacitor)

## 🚀 Desenvolvimento

```bash
npm install
npm run dev        # http://localhost:3000
```

### Build desktop (Electron)

```bash
npm run build
cp -r .next/standalone desktop/app-bundle
cp -r .next/static desktop/app-bundle/.next/static
cp -r public desktop/app-bundle/public
cd desktop && npm ci
npx electron-builder --win     # AuroraStream-Setup-<v>.exe
npx electron-builder --linux   # AuroraStream-<v>-linux-x86_64.AppImage
```

### Build APK Android (nativo, autônomo)

```bash
# 1. Export estático (sem API routes — o APK não tem servidor)
mv src/app/api /tmp/api-bak && AURORA_STATIC=1 ./node_modules/.bin/next build && mv /tmp/api-bak src/app/api

# 2. Web assets + sync
rm -rf apk-www && cp -r out-build apk-www && npx cap sync android

# 3. APK assinado
cd android && ANDROID_HOME=/caminho/sdk ./gradlew assembleRelease
# → app/build/outputs/apk/release/app-release.apk
```

No APK o app opera em **modo nativo** (`src/lib/direct.ts`): login/catálogo/EPG vão direto ao `player_api.php` do painel via CapacitorHttp (sem CORS), e a reprodução usa as URLs brutas do Xtream.

## 🗂️ Estrutura

```
src/app/api/          → Rotas API (desktop/PWA): auth, xtream, stream, transcode, favorites, progress
src/components/aurora → UI: Dashboard, Player, grids, EPG, busca, parental
src/lib/direct.ts     → Modo nativo do APK (sem servidor)
src/lib/xtream.ts     → Cliente Xtream Codes (compartilhado client/server)
desktop/              → Electron: main.js + electron-builder.yml + ffmpeg/
android/              → Projeto nativo Capacitor (Gradle)
```

## 🛠️ Stack

Next.js 16 (App Router) • React 19 • TypeScript • Tailwind CSS 4 • zustand • hls.js • framer-motion • Electron 33 • Capacitor 7 • ffmpeg

## 📄 Licença

MIT
