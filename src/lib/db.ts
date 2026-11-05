// ============================================================
// AuroraStream — Camada de dados (armazenamento JSON puro)
// ============================================================
// Por que JSON e não SQLite/Prisma?
// O app desktop roda o servidor Next standalone dentro do Electron e os
// binários nativos (engine do Prisma) variam por SO/arquitetura. Quando o
// pacote não carrega a engine certa, TODA rota API morre com:
//   "Error code 14: Unable to open the database file"
// Armazenamento JSON puro (Node fs) elimina dependências nativas: funciona
// igual em Windows/Linux/macOS, dentro ou fora do Electron.
//
// API compatível com o subconjunto Prisma usado pelo app:
//   db.account.create({data}) / findUnique({where:{token}}) / update({where:{id},data})
//   db.favorite.findMany / findUnique / create / delete
//   db.watchProgress.findMany / upsert
//
// Persistência: gravação atômica (tmp + rename), debounce de 120 ms e fila
// serializada. Diretório: AURORA_DATA_DIR (Electron userData) ou ./data;
// se não gravável, cai para os.tmpdir() — o app nunca morre por permissão.
// ============================================================

import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

// ---------- tipos públicos (compatíveis com o uso atual) ----------

export type MediaTypeDb = 'live' | 'movie' | 'series'

export interface Account {
  id: string
  token: string
  mode: 'demo' | 'xtream'
  server: string | null
  username: string | null
  password: string | null
  label: string | null
  createdAt: Date
  lastSeen: Date
}

export interface Favorite {
  id: string
  accountId: string
  mediaId: string
  mediaType: MediaTypeDb
  title: string
  poster: string | null
  category: string | null
  createdAt: Date
}

export interface WatchProgress {
  id: string
  accountId: string
  mediaId: string
  mediaType: MediaTypeDb
  title: string
  poster: string | null
  positionSec: number
  durationSec: number
  season: number | null
  episode: number | null
  episodeTitle: string | null
  updatedAt: Date
}

// ---------- formato em disco (em memória: datas como Date; JSON.stringify
// serializa Date → ISO automaticamente, e a carga reidrata com asDate()) ----------

interface DbFile {
  version: 1
  accounts: Account[]
  favorites: Favorite[]
  progress: WatchProgress[]
}

const EMPTY: DbFile = { version: 1, accounts: [], favorites: [], progress: [] }

const MAX_ACCOUNTS = 200 // poda em cascata p/ evitar crescimento sem limite
const SAVE_DEBOUNCE_MS = 120

// ---------- diretório de dados (com fallback à prova de falhas) ----------

function resolveDataDir(): string {
  const candidates: string[] = []
  const envDir = process.env.AURORA_DATA_DIR?.trim()
  if (envDir) candidates.push(envDir)
  candidates.push(path.join(process.cwd(), 'data'))
  candidates.push(path.join(os.tmpdir(), 'aurorastream-data'))
  for (const dir of candidates) {
    try {
      mkdirSync(dir, { recursive: true })
      // teste real de escrita
      const probe = path.join(dir, '.write-test')
      writeFileSync(probe, 'ok')
      unlinkSync(probe)
      return dir
    } catch {
      // tenta o próximo candidato
    }
  }
  return path.join(os.tmpdir(), 'aurorastream-data')
}

const DATA_DIR = resolveDataDir()
const DATA_FILE = path.join(DATA_DIR, 'aurorastream.json')

/** Diagnóstico: onde os dados estão e se o diretório é gravável */
export function dbStorageInfo() {
  return { dir: DATA_DIR, file: DATA_FILE, writable: existsSync(DATA_DIR) }
}

// ---------- estado global (sobrevive ao HMR do Next) ----------

interface DbState {
  data: DbFile
  loaded: boolean
  loadPromise: Promise<void> | null
  saveTimer: ReturnType<typeof setTimeout> | null
  queue: Promise<void>
}

const globalForDb = globalThis as unknown as { __auroraDbState?: DbState }
const state: DbState =
  globalForDb.__auroraDbState ?? {
    data: EMPTY,
    loaded: false,
    loadPromise: null,
    saveTimer: null,
    queue: Promise.resolve(),
  }
globalForDb.__auroraDbState = state

// ---------- carga / gravação ----------

async function load(): Promise<void> {
  if (state.loaded) return
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8')
    const parsed = JSON.parse(raw) as DbFile
    if (parsed && parsed.version === 1 && Array.isArray(parsed.accounts)) {
      state.data = {
        version: 1,
        accounts: (parsed.accounts ?? []).map(hydrateAccount),
        favorites: (parsed.favorites ?? []).map(hydrateFavorite),
        progress: (parsed.progress ?? []).map(hydrateProgress),
      }
    } else {
      state.data = { ...EMPTY }
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code
    if (code !== 'ENOENT') {
      // arquivo corrompido: guarda um backup e recomeça do zero
      try {
        await fs.copyFile(DATA_FILE, `${DATA_FILE}.corrupt-${Date.now()}`)
      } catch {
        /* noop */
      }
    }
    state.data = { ...EMPTY }
  }
  state.loaded = true
}

function ensureLoaded(): Promise<void> {
  if (!state.loadPromise) {
    state.loadPromise = load().catch((err) => {
      console.error('[AuroraStream/db] falha ao carregar dados:', err)
      state.loaded = true
    })
  }
  return state.loadPromise
}

function writeOnce(): Promise<void> {
  const tmp = `${DATA_FILE}.tmp-${process.pid}`
  const body = JSON.stringify(state.data)
  return fs
    .writeFile(tmp, body, 'utf8')
    .then(() => fs.rename(tmp, DATA_FILE))
    .catch((err) => {
      // Windows pode recusar rename sobre arquivo existente: tenta remover antes
      if ((err as NodeJS.ErrnoException).code === 'EPERM') {
        return fs.rm(DATA_FILE, { force: true })
          .then(() => fs.rename(tmp, DATA_FILE))
          .catch(() => {
            try { fs.rm(tmp, { force: true }).then(() => {}).catch(() => {}) } catch { /* noop */ }
            throw err
          })
      }
      try { fs.rm(tmp, { force: true }).then(() => {}).catch(() => {}) } catch { /* noop */ }
      throw err
    })
}

/** Agenda gravação com debounce; fila serializada evita gravações concorrentes */
function scheduleSave() {
  if (state.saveTimer) clearTimeout(state.saveTimer)
  state.saveTimer = setTimeout(() => {
    state.saveTimer = null
    state.queue = state.queue
      .then(() => writeOnce())
      .catch((err) => console.error('[AuroraStream/db] falha ao gravar dados:', err))
  }, SAVE_DEBOUNCE_MS)
}

// ---------- utilidades ----------

const nowIso = () => new Date().toISOString()
const asDate = (v: string | Date | undefined | null): Date =>
  v instanceof Date ? v : v ? new Date(v) : new Date()

function hydrateAccount(a: DbFile['accounts'][number]): Account {
  return { ...a, createdAt: asDate(a.createdAt), lastSeen: asDate(a.lastSeen) }
}
function hydrateFavorite(f: DbFile['favorites'][number]): Favorite {
  return { ...f, createdAt: asDate(f.createdAt) }
}
function hydrateProgress(p: DbFile['progress'][number]): WatchProgress {
  return { ...p, updatedAt: asDate(p.updatedAt) }
}

/** Remove contas excedentes (mais antigas por lastSeen) com poda em cascata */
function pruneAccounts() {
  if (state.data.accounts.length <= MAX_ACCOUNTS) return
  const ordered = [...state.data.accounts].sort(
    (a, b) => a.lastSeen.getTime() - b.lastSeen.getTime(),
  )
  const excess = state.data.accounts.length - MAX_ACCOUNTS
  const doomed = new Set(ordered.slice(0, excess).map((a) => a.id))
  if (doomed.size === 0) return
  state.data.accounts = state.data.accounts.filter((a) => !doomed.has(a.id))
  state.data.favorites = state.data.favorites.filter((f) => !doomed.has(f.accountId))
  state.data.progress = state.data.progress.filter((p) => !doomed.has(p.accountId))
}

class NotFoundError extends Error {
  constructor(entity: string) {
    super(`${entity} não encontrado(a)`)
  }
}

// ---------- API pública (subconjunto Prisma) ----------

const account = {
  async create({ data }: { data: Partial<Account> }): Promise<Account> {
    await ensureLoaded()
    const row: Account = {
      id: data.id ?? randomUUID(),
      token: data.token ?? randomUUID(),
      mode: data.mode ?? 'demo',
      server: data.server ?? null,
      username: data.username ?? null,
      password: data.password ?? null,
      label: data.label ?? null,
      createdAt: new Date(),
      lastSeen: new Date(),
    }
    state.data.accounts.push(row)
    pruneAccounts()
    scheduleSave()
    return row
  },

  async findUnique({ where }: { where: { token: string } }): Promise<Account | null> {
    await ensureLoaded()
    const hit = state.data.accounts.find((a) => a.token === where.token)
    return hit ? hydrateAccount(hit) : null
  },

  async update({
    where,
    data,
  }: {
    where: { id: string }
    data: Partial<Account>
  }): Promise<Account> {
    await ensureLoaded()
    const idx = state.data.accounts.findIndex((a) => a.id === where.id)
    if (idx === -1) throw new NotFoundError('Conta')
    const cur = state.data.accounts[idx]
    const next: Account = {
      ...cur,
      ...data,
      id: cur.id, // id e token são imutáveis
      token: cur.token,
      createdAt: asDate(cur.createdAt),
      lastSeen: data.lastSeen ? asDate(data.lastSeen) : new Date(),
    }
    state.data.accounts[idx] = next
    scheduleSave()
    return next
  },
}

const favorite = {
  async findMany({
    where,
    orderBy,
  }: {
    where?: { accountId?: string }
    orderBy?: { createdAt?: 'asc' | 'desc' }
  } = {}): Promise<Favorite[]> {
    await ensureLoaded()
    let rows = state.data.favorites.map(hydrateFavorite)
    if (where?.accountId) rows = rows.filter((f) => f.accountId === where.accountId)
    if (orderBy?.createdAt === 'desc') {
      rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    } else if (orderBy?.createdAt === 'asc') {
      rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    }
    return rows
  },

  async findUnique({
    where,
  }: {
    where: { accountId_mediaId_mediaType: { accountId: string; mediaId: string; mediaType: MediaTypeDb } }
  }): Promise<Favorite | null> {
    await ensureLoaded()
    const { accountId, mediaId, mediaType } = where.accountId_mediaId_mediaType
    const hit = state.data.favorites.find(
      (f) => f.accountId === accountId && f.mediaId === mediaId && f.mediaType === mediaType,
    )
    return hit ? hydrateFavorite(hit) : null
  },

  async create({ data }: { data: Omit<Favorite, 'id' | 'createdAt'> & Partial<Favorite> }): Promise<Favorite> {
    await ensureLoaded()
    const row: Favorite = {
      id: data.id ?? randomUUID(),
      accountId: data.accountId,
      mediaId: data.mediaId,
      mediaType: data.mediaType,
      title: data.title,
      poster: data.poster ?? null,
      category: data.category ?? null,
      createdAt: new Date(),
    }
    state.data.favorites.push(row)
    scheduleSave()
    return row
  },

  async delete({ where }: { where: { id: string } }): Promise<Favorite> {
    await ensureLoaded()
    const idx = state.data.favorites.findIndex((f) => f.id === where.id)
    if (idx === -1) throw new NotFoundError('Favorito')
    const [row] = state.data.favorites.splice(idx, 1)
    scheduleSave()
    return hydrateFavorite(row)
  },
}

const watchProgress = {
  async findMany({
    where,
    orderBy,
    take,
  }: {
    where?: { accountId?: string }
    orderBy?: { updatedAt?: 'asc' | 'desc' }
    take?: number
  } = {}): Promise<WatchProgress[]> {
    await ensureLoaded()
    let rows = state.data.progress.map(hydrateProgress)
    if (where?.accountId) rows = rows.filter((p) => p.accountId === where.accountId)
    if (orderBy?.updatedAt === 'desc') {
      rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    } else if (orderBy?.updatedAt === 'asc') {
      rows.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
    }
    if (take && take > 0) rows = rows.slice(0, take)
    return rows
  },

  async upsert({
    where,
    create,
    update,
  }: {
    where: { accountId_mediaId: { accountId: string; mediaId: string } }
    create: Omit<WatchProgress, 'id' | 'updatedAt'> & Partial<WatchProgress>
    update: Partial<WatchProgress>
  }): Promise<WatchProgress> {
    await ensureLoaded()
    const { accountId, mediaId } = where.accountId_mediaId
    const idx = state.data.progress.findIndex(
      (p) => p.accountId === accountId && p.mediaId === mediaId,
    )
    if (idx === -1) {
      const row: WatchProgress = {
        id: randomUUID(),
        accountId,
        mediaId,
        mediaType: create.mediaType,
        title: create.title,
        poster: create.poster ?? null,
        positionSec: create.positionSec ?? 0,
        durationSec: create.durationSec ?? 0,
        season: create.season ?? null,
        episode: create.episode ?? null,
        episodeTitle: create.episodeTitle ?? null,
        updatedAt: new Date(),
      }
      state.data.progress.push(row)
      scheduleSave()
      return row
    }
    const cur = state.data.progress[idx]
    const next: WatchProgress = { ...cur, ...update, id: cur.id, updatedAt: new Date() }
    state.data.progress[idx] = next
    scheduleSave()
    return next
  },
}

export const db = { account, favorite, watchProgress }
export default db
