// ============================================================
// AuroraStream — Modo NATIVO (APK Android / Capacitor)
//
// No APK o app é autônomo: NÃO existe servidor Next embutido.
// Todas as consultas vão DIRETO ao painel Xtream do usuário —
// o CapacitorHttp intercepta fetch/XHR na camada nativa e elimina
// o CORS, e a reprodução usa as URLs brutas do painel.
//
// Sessão, favoritos e progresso ficam no localStorage do app.
// ============================================================

import type { EpisodeItem, MediaItem, SessionInfo } from './types'
import type { XtreamCatalogData } from './client'
import {
  DEMO_LIVE,
  DEMO_MOVIES,
  DEMO_SERIES,
  DEMO_SERIES_EPISODES,
} from './demo-data'
import { normalizeServer, xtreamAction, xtreamAuth } from './xtream'

const SESSION_KEY = 'aurora:direct:session'
const FAV_KEY = 'aurora:direct:favorites'
const PROG_KEY = 'aurora:direct:progress'

/** True quando rodando dentro do app Android (Capacitor nativo) */
export function isNativeDirect(): boolean {
  if (typeof window === 'undefined') return false
  const c = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor
  return typeof c?.isNativePlatform === 'function' && c.isNativePlatform() === true
}

// ---------- sessão ----------

export function directSession(): SessionInfo | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as SessionInfo) : null
  } catch {
    return null
  }
}

export async function directLogin(payload: {
  mode: 'demo' | 'xtream'
  server?: string
  username?: string
  password?: string
}): Promise<SessionInfo> {
  if (payload.mode === 'demo') {
    const s: SessionInfo = { mode: 'demo', label: 'Demonstração' }
    localStorage.setItem(SESSION_KEY, JSON.stringify(s))
    return s
  }
  const server = normalizeServer(payload.server ?? '')
  const auth = await xtreamAuth(server, payload.username ?? '', payload.password ?? '')
  const u = auth.user_info
  if (Number(u?.auth) !== 1) {
    throw new Error(u?.message || 'Login recusado pelo servidor — confira usuário e senha.')
  }
  const s: SessionInfo = {
    mode: 'xtream',
    label: payload.username ?? 'usuário',
    server,
    username: payload.username,
    password: payload.password,
    status: u.status,
    expiry: u.exp_date
      ? new Date(Number(u.exp_date) * 1000).toISOString()
      : undefined,
    isTrial: u.is_trial === '1',
    activeConnections: u.active_cons ? Number(u.active_cons) : undefined,
    maxConnections: u.max_connections ? Number(u.max_connections) : undefined,
    timezone: auth.server_info?.timezone,
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(s))
  return s
}

export function directLogout() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    /* noop */
  }
}

/** Consulta Xtream direta ao painel (usa a sessão salva) */
export function directXtreamQ(): (
  action: string,
  extra?: Record<string, string>,
) => Promise<unknown> {
  const s = directSession()
  if (!s?.server || !s.username || !s.password) {
    throw new Error('Sessão inexistente — entre novamente.')
  }
  const { server, username, password } = s
  return (action, extra = {}) => xtreamAction(server, username, password, { action, ...extra })
}

// ---------- catálogo demo (client-side, sem servidor) ----------

export function directDemoCatalog(): XtreamCatalogData {
  const episodes: EpisodeItem[] = []
  for (const [seriesId, eps] of Object.entries(DEMO_SERIES_EPISODES)) {
    for (const ep of eps) episodes.push({ ...ep, id: `${seriesId}:${ep.id}` })
  }
  return {
    movies: DEMO_MOVIES,
    series: DEMO_SERIES,
    live: DEMO_LIVE,
    sports: DEMO_LIVE.filter((l) => l.category === 'Esportes'),
    fixtures: [],
  }
}

// ---------- favoritos / progresso (localStorage) ----------

function readList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T[]) : []
  } catch {
    return []
  }
}

function writeList<T>(key: string, list: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list.slice(-500)))
  } catch {
    /* cota cheia — ignora */
  }
}

export function directFavorites() {
  return readList<import('./client').FavoriteRow>(FAV_KEY)
}

export function directToggleFavorite(item: MediaItem): boolean {
  const list = directFavorites()
  const idx = list.findIndex((f) => f.mediaId === item.id && f.mediaType === item.type)
  if (idx >= 0) {
    list.splice(idx, 1)
    writeList(FAV_KEY, list)
    return false
  }
  list.unshift({
    id: `${item.type}:${item.id}`,
    mediaId: item.id,
    mediaType: item.type,
    title: item.title,
    poster: item.poster ?? null,
    category: item.category ?? null,
    createdAt: new Date().toISOString(),
  })
  writeList(FAV_KEY, list)
  return true
}

export function directProgress() {
  return readList<import('./client').ProgressRow>(PROG_KEY)
}

export function directSaveProgressRow(p: {
  mediaId: string
  mediaType: MediaItem['type']
  title: string
  poster?: string | null
  positionSec: number
  durationSec: number
  season?: number | null
  episode?: number | null
  episodeTitle?: string | null
}) {
  const list = directProgress()
  const idx = list.findIndex(
    (r) =>
      r.mediaId === p.mediaId &&
      r.mediaType === p.mediaType &&
      (r.season ?? null) === (p.season ?? null) &&
      (r.episode ?? null) === (p.episode ?? null),
  )
  const row: import('./client').ProgressRow = {
    id: idx >= 0 ? list[idx].id : `p${Date.now()}`,
    mediaId: p.mediaId,
    mediaType: p.mediaType,
    title: p.title,
    poster: p.poster ?? null,
    season: p.season ?? null,
    episode: p.episode ?? null,
    episodeTitle: p.episodeTitle ?? null,
    positionSec: p.positionSec,
    durationSec: p.durationSec,
    updatedAt: new Date().toISOString(),
  }
  if (idx >= 0) list[idx] = row
  else list.unshift(row)
  list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  writeList(PROG_KEY, list.slice(0, 200))
}
