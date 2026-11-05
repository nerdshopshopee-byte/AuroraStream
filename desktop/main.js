// ============================================================
// AuroraStream — Processo principal do Electron
// ============================================================
// Arquitetura: o Next standalone (Node puro) roda como processo filho
// (ELECTRON_RUN_AS_NODE=1) na porta 34567, apenas em 127.0.0.1; a janela
// carrega http://127.0.0.1:34567. Nada é exposto à rede local.
//
// O armazenamento de dados (contas/favoritos/progresso) é JSON puro em
// userData/data — não há dependências nativas (Prisma/SQLite), então o
// mesmo pacote roda em Windows e Linux sem erro de engine.
// ============================================================

const { app, BrowserWindow, dialog, Menu, shell } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')

const PORT = 34567
const HOST = '127.0.0.1'
const URL_BASE = `http://${HOST}:${PORT}`
const SERVER_START_TIMEOUT_MS = 120_000 // provedores lentos ainda não afetam o boot; servidor local inicia em ~2 s

let serverProc = null
let mainWindow = null
let quitting = false

// ---------- servidor Next standalone ----------

function serverDir() {
  if (!app.isPackaged) return path.join(__dirname, 'app-bundle')
  return path.join(process.resourcesPath, 'server')
}

function ffmpegSetup() {
  const dir = app.isPackaged
    ? path.join(process.resourcesPath, 'ffmpeg')
    : path.join(__dirname, 'ffmpeg', process.platform === 'win32' ? 'win64' : 'linux64')
  const bin = path.join(dir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
  const ok = fs.existsSync(bin)
  if (ok) {
    // AURORA_FFMPEG → usado pela rota /api/transcode; PATH → qualquer outro uso
    const sep = process.platform === 'win32' ? ';' : ':'
    process.env.PATH = dir + sep + (process.env.PATH || '')
  }
  process.env.AURORA_FFMPEG = ok ? bin : ''
  return { dir, ok }
}

function startServer() {
  const entry = path.join(serverDir(), 'server.js')
  if (!fs.existsSync(entry)) {
    throw new Error(`Servidor embutido não encontrado: ${entry}`)
  }

  const dataDir = path.join(app.getPath('userData'), 'data')
  fs.mkdirSync(dataDir, { recursive: true })

  const { ok: hasFfmpeg } = ffmpegSetup()

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    ELECTRON_RUN_AS_NODE: '1',
    NODE_OPTIONS: '',
    PORT: String(PORT),
    HOSTNAME: HOST,
    AURORA_DATA_DIR: dataDir,
  }
  if (!hasFfmpeg) delete env.AURORA_FFMPEG

  serverProc = spawn(process.execPath, [entry], {
    env,
    cwd: serverDir(),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  serverProc.stdout.on('data', (d) => process.stdout.write(`[srv] ${d}`))
  serverProc.stderr.on('data', (d) => process.stderr.write(`[srv] ${d}`))
  serverProc.on('exit', (code) => {
    serverProc = null
    if (!quitting) {
      // o servidor não deveria morrer sozinho; avisa e encerra de forma limpa
      dialog.showErrorBox(
        'AuroraStream',
        `O servidor interno encerrou inesperadamente (código ${code}). O aplicativo será fechado.`,
      )
      app.quit()
    }
  })
  return serverProc
}

function stopServer() {
  if (!serverProc) return
  try {
    if (process.platform === 'win32') {
      // mata a árvore (o Node filho não tem filhos, mas garantimos)
      spawn('taskkill', ['/pid', String(serverProc.pid), '/T', '/F'], {
        windowsHide: true,
      })
    } else {
      serverProc.kill('SIGTERM')
    }
  } catch {
    /* noop */
  }
}

/** Aguarda /api/ping responder 200 */
function waitForServer(timeoutMs = SERVER_START_TIMEOUT_MS) {
  const t0 = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(`${URL_BASE}/api/ping`, { timeout: 2500 }, (res) => {
        res.resume()
        if (res.statusCode === 200) return resolve()
        retry()
      })
      req.on('timeout', () => {
        req.destroy()
        retry()
      })
      req.on('error', retry)
    }
    const retry = () => {
      if (Date.now() - t0 > timeoutMs) {
        return reject(new Error('Tempo esgotado ao iniciar o servidor interno.'))
      }
      setTimeout(attempt, 300)
    }
    attempt()
  })
}

// ---------- janela ----------

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 768,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#05070b',
    show: false,
    autoHideMenuBar: true,
    title: 'AuroraStream',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // bloqueia navegação externa — abre no navegador do sistema
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(URL_BASE)) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(URL_BASE)) {
      e.preventDefault()
      shell.openExternal(url)
    }
  })

  mainWindow.loadURL(URL_BASE)
}

// ---------- ciclo de vida ----------

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null)
    try {
      startServer()
      await waitForServer()
      createWindow()
    } catch (err) {
      dialog.showErrorBox(
        'AuroraStream — falha ao iniciar',
        `Não foi possível iniciar o servidor interno:\n\n${err && err.message ? err.message : err}`,
      )
      app.quit()
    }
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  app.on('before-quit', () => {
    quitting = true
    stopServer()
  })
}
