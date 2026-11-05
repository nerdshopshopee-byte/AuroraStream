// ============================================================
// AuroraStream — Cliente Xtream Codes (server-side)
// Documentação do protocolo: player_api.php
// ============================================================

const CACHE_TTL: Record<string, number> = {
  auth: 60_000,
  categories: 30 * 60_000,
  streams: 10 * 60_000,
  series_info: 10 * 60_000,
  vod_info: 60 * 60_000,
  default: 5 * 60_000,
}

const globalCache = globalThis as unknown as {
  __auroraXtreamCache?: Map<string, { ts: number; ttl: number; data: unknown }>
}
const cache = globalCache.__auroraXtreamCache ?? new Map()
globalCache.__auroraXtreamCache = cache

export function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.ts > hit.ttl) {
    cache.delete(key)
    return null
  }
  return hit.data as T
}

export function cacheSet(key: string, data: unknown, ttlMs: number) {
  // limite de segurança: ~200 entradas LRU-ish
  if (cache.size > 200) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, 40)
    for (const [k] of oldest) cache.delete(k)
  }
  cache.set(key, { ts: Date.now(), ttl: ttlMs, data })
}

export function cacheStats() {
  return { entries: cache.size }
}

/** Normaliza o DNS informado pelo usuário para http(s)://host[:porta] */
export function normalizeServer(input: string): string {
  let s = input.trim()
  if (!s) throw new Error('Informe o DNS/servidor do painel.')
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`
  s = s.replace(/\/+$/, '')
  // remove sufixos comuns de painel
  s = s.replace(/\/(player_api|panel_api|get)\.php.*$/i, '')
  s = s.replace(/\/(c|en)$/, '')
  return s
}

export interface XtreamAuthResult {
  user_info: {
    username: string
    auth: number
    status: string
    exp_date?: string | null
    is_trial?: string
    active_cons?: string
    max_connections?: string
    message?: string
    created_at?: string
  }
  server_info: {
    url?: string
    port?: string
    https_port?: string
    server_protocol?: string
    timezone?: string
    timestamp?: string
  }
}

const UA = 'AuroraStream/1.0 (IPTV Player; like VLC/3.0.20)'

async function fetchJson(url: string, timeoutMs = 15_000): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*' },
      signal: ctrl.signal,
      cache: 'no-store',
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Servidor não respondeu a tempo — DNS offline ou muito lento.')
    }
    throw new Error(
      'Não foi possível conectar ao servidor — verifique o DNS (ex.: http://host:porta) e se o painel está online.',
    )
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) throw new Error(`Servidor respondeu HTTP ${res.status}`)
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('Resposta não é JSON — verifique se o DNS é um painel Xtream Codes.')
  }
}

export function buildApiUrl(
  server: string,
  username: string,
  password: string,
  params: Record<string, string> = {},
): string {
  const qs = new URLSearchParams({ username, password, ...params })
  return `${server}/player_api.php?${qs.toString()}`
}

export async function xtreamAuth(
  serverRaw: string,
  username: string,
  password: string,
): Promise<XtreamAuthResult> {
  const server = normalizeServer(serverRaw)
  const key = `auth|${server}|${username}|${password}`
  const hit = cacheGet<XtreamAuthResult>(key)
  if (hit) return hit

  const data = (await fetchJson(buildApiUrl(server, username, password))) as XtreamAuthResult
  if (!data || typeof data !== 'object' || !('user_info' in data)) {
    throw new Error('Resposta inválida do servidor Xtream.')
  }
  if (Number(data.user_info?.auth) !== 1) {
    throw new Error(
      data.user_info?.message || 'Login recusado pelo servidor — confira usuário e senha.',
    )
  }
  cacheSet(key, data, CACHE_TTL.auth)
  return data
}

function cacheTtlFor(action: string): number {
  if (action.endsWith('_categories')) return CACHE_TTL.categories
  if (action.startsWith('get_') && action.includes('streams')) return CACHE_TTL.streams
  if (action === 'get_series' || action === 'get_vod_streams') return CACHE_TTL.streams
  return CACHE_TTL.default
}

/** Busca genérica com cache server-side (catálogos podem ser grandes) */
export async function xtreamAction<T = unknown>(
  server: string,
  username: string,
  password: string,
  params: Record<string, string>,
): Promise<T> {
  const action = params.action ?? 'unknown'
  const key = `${server}|${username}|${JSON.stringify(params)}`
  const hit = cacheGet<T>(key)
  if (hit) return hit
  const url = buildApiUrl(server, username, password, params)
  const data = await fetchJson(url, 30_000)
  cacheSet(key, data, cacheTtlFor(action))
  return data as T
}

// ---------- URLs de stream ----------

export function liveStreamUrl(
  server: string,
  username: string,
  password: string,
  streamId: string | number,
  format: 'm3u8' | 'ts' = 'm3u8',
): string {
  return `${server}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamId}.${format}`
}

export function movieStreamUrl(
  server: string,
  username: string,
  password: string,
  streamId: string | number,
  ext = 'mp4',
): string {
  return `${server}/movie/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamId}.${ext}`
}

export function seriesStreamUrl(
  server: string,
  username: string,
  password: string,
  episodeId: string | number,
  ext = 'mp4',
): string {
  return `${server}/series/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${episodeId}.${ext}`
}

// ---------- Tipos das respostas ----------

export interface XtreamCategory {
  category_id: string
  category_name: string
  parent_id: number
}

export interface XtreamLiveStream {
  num: number
  name: string
  stream_type: string
  stream_id: number
  stream_icon?: string
  epg_channel_id?: string
  added?: string
  category_id: string
  tv_archive?: number
  direct_source?: string
  tv_archive_duration?: number
}

export interface XtreamVodStream {
  num: number
  name: string
  stream_type: string
  stream_id: number
  stream_icon?: string
  rating?: string | number
  added?: string
  category_id: string
  container_extension?: string
  custom_sid?: string
  direct_source?: string
}

export interface XtreamSeries {
  num: number
  name: string
  series_id: number
  cover?: string
  plot?: string
  cast?: string
  director?: string
  genre?: string
  releaseDate?: string
  last_modified?: string
  rating?: string | number
  rating_5based?: number
  backdrop?: string[]
  youtube_trailer?: string
  episode_run_time?: number
  category_id: string
}

export interface XtreamSeriesInfo {
  info?: {
    name?: string
    cover?: string
    plot?: string
    cast?: string
    director?: string
    genre?: string
    releaseDate?: string
    rating?: string | number
    backdrop?: string[]
    youtube_trailer?: string
    episode_run_time?: number
    category_id?: string
  }
  seasons?: {
    season: number
    name?: string
    episode_count?: number
    cover?: string
    air_date?: string
  }[]
  episodes?: Record<
    string,
    {
      id: string
      episode_num: number
      title: string
      container_extension?: string
      info?: {
        movie_image?: string
        plot?: string
        duration?: string
        duration_secs?: number
        rating?: string | number
      }
      custom_sid?: string
      added?: string
      season?: number
    }[]
  >
}

export interface XtreamVodInfo {
  info?: {
    movie_image?: string
    duration_secs?: number
    duration?: string
    plot?: string
    cast?: string
    director?: string
    genre?: string
    releaseDate?: string
    rating?: string | number
    backdrop?: string[]
    youtube_trailer?: string
    country?: string
  }
  movie_data?: {
    stream_id?: number
    name?: string
    container_extension?: string
    category_id?: string
  }
}
