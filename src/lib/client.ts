// ============================================================
// AuroraStream — Helpers do cliente (fetch + cache localStorage)
// ============================================================

import type {
  EpisodeItem,
  EpgProgram,
  MediaItem,
  ScreenId,
  SessionInfo,
  SeriesDetail,
  VodInfo,
} from './types'
import type {
  XtreamCategory,
  XtreamLiveStream,
  XtreamSeries,
  XtreamSeriesInfo,
  XtreamVodInfo,
  XtreamVodStream,
} from './xtream'
import { buildApiUrl } from './xtream'
import {
  directDemoCatalog,
  directFavorites,
  directLogin,
  directLogout,
  directProgress,
  directSaveProgressRow,
  directSession,
  directToggleFavorite,
  directXtreamQ,
  isNativeDirect,
} from './direct'

// ---------- cache local ----------

interface CacheEntry<T> {
  ts: number
  data: T
}

const MEM = new Map<string, CacheEntry<unknown>>()

export const CLIENT_TTL = {
  catalog: 6 * 60 * 60 * 1000, // 6h
  seriesInfo: 10 * 60 * 1000, // 10min
  vodInfo: 60 * 60 * 1000, // 1h
  epg: 10 * 60 * 1000, // 10min
  fixtures: 15 * 60 * 1000,
}

/** Xtream manda datas unix em segundos ("added", "last_modified") */
function toMs(v: string | number | undefined): number | undefined {
  const n = Number(v)
  if (!v || !Number.isFinite(n) || n <= 0) return undefined
  return n < 10_000_000_000 ? n * 1000 : n // segundos → ms
}

export async function cached<T>(
  key: string,
  ttl: number,
  loader: () => Promise<T>,
): Promise<T> {
  const mem = MEM.get(key)
  if (mem && Date.now() - mem.ts < ttl) return mem.data as T
  try {
    const raw = localStorage.getItem(`aurora:${key}`)
    if (raw) {
      const entry = JSON.parse(raw) as CacheEntry<T>
      if (Date.now() - entry.ts < ttl) {
        MEM.set(key, entry)
        return entry.data
      }
    }
  } catch {
    /* localStorage indisponível */
  }
  const data = await loader()
  const entry = { ts: Date.now(), data }
  MEM.set(key, entry)
  try {
    localStorage.setItem(`aurora:${key}`, JSON.stringify(entry))
  } catch {
    // cota cheia: limpa entradas antigas
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith('aurora:'))
      for (const k of keys.slice(0, Math.ceil(keys.length / 2))) localStorage.removeItem(k)
      localStorage.setItem(`aurora:${key}`, JSON.stringify(entry))
    } catch {
      /* desiste */
    }
  }
  return data
}

export function clearClientCache() {
  MEM.clear()
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('aurora:'))
      .forEach((k) => localStorage.removeItem(k))
  } catch {
    /* noop */
  }
}

export function clientCacheCount(): number {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith('aurora:')).length
  } catch {
    return MEM.size
  }
}

// ---------- fetch básico ----------

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  // teto de 60 s: catálogos Xtream grandes em conexões lentas podem passar
  // de 30 s; sem teto, o fetch pendurava a tela em "carregando" para sempre
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error || `HTTP ${res.status}`)
  return body as T
}

// ---------- sessão ----------

export async function apiSession(): Promise<SessionInfo | null> {
  // APK nativo: sessão vive no localStorage (não há servidor)
  if (isNativeDirect()) return directSession()
  const r = await json<{ session: SessionInfo | null }>('/api/auth/session')
  return r.session
}

export async function apiLogin(payload: {
  mode: 'demo' | 'xtream'
  server?: string
  username?: string
  password?: string
}): Promise<SessionInfo> {
  if (isNativeDirect()) return directLogin(payload)
  const r = await json<{ session: SessionInfo }>('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return r.session
}

export async function apiLogout() {
  if (isNativeDirect()) {
    directLogout()
    return
  }
  await fetch('/api/auth/logout', { method: 'POST' })
}

// ---------- catálogo ----------

export interface FixtureRow {
  id: string
  time: string
  competition: string
  home: string
  away: string
  channel: string
  channelId: string
}

interface DemoCatalog {
  movies: MediaItem[]
  series: MediaItem[]
  live: MediaItem[]
  fixtures: FixtureRow[]
}

const SPORT_RE =
  /sport|esporte|fut|futebol|futbol|soccer|uefa|premier|liga|league|nba|ufc|boxing|luta|gol|arena|academi|golfe|tenis|tennis|basa|vôlei|volei|formula|f1|nfl/i

export interface XtreamCatalogData {
  movies: MediaItem[]
  series: MediaItem[]
  live: MediaItem[]
  sports: MediaItem[]
  fixtures: FixtureRow[]
  /** seções que falharam no provedor (catálogo carregado parcialmente) */
  degraded?: string[]
}

function catMap(categories: XtreamCategory[]): Record<string, string> {
  const m: Record<string, string> = {}
  for (const c of categories) m[c.category_id] = c.category_name
  return m
}

/** Busca uma ação Xtream com 2 tentativas (provedores derrubam conexões) */
async function qRetry(q: (action: string) => Promise<unknown>, action: string): Promise<unknown> {
  try {
    return await q(action)
  } catch {
    await new Promise((r) => setTimeout(r, 800))
    return await q(action)
  }
}

export async function loadXtreamCatalog(): Promise<XtreamCatalogData> {
  const nativeQ = isNativeDirect()
  const q = (action: string) =>
    nativeQ
      ? directXtreamQ()(action) // APK: vai direto ao painel Xtream
      : json<{ data: unknown }>(`/api/xtream?action=${action}`).then((r) => r.data)

  // allSettled: UMA seção lenta/offline não pode derrubar o catálogo inteiro
  // (antes, qualquer falha deixava o app girando em carregamento eterno)
  const [liveCatsR, vodCatsR, serCatsR, liveR, vodR, seriesR] = await Promise.allSettled([
    qRetry(q, 'get_live_categories'),
    qRetry(q, 'get_vod_categories'),
    qRetry(q, 'get_series_categories'),
    qRetry(q, 'get_live_streams'),
    qRetry(q, 'get_vod_streams'),
    qRetry(q, 'get_series'),
  ])

  const val = (r: PromiseSettledResult<unknown>): unknown =>
    r.status === 'fulfilled' ? r.value : null
  const names = [
    'canais',
    'filmes',
    'séries',
    'canais',
    'filmes',
    'séries',
  ]
  const results = [liveCatsR, vodCatsR, serCatsR, liveR, vodR, seriesR]
  const degradedSet = new Set<string>()
  results.forEach((r, i) => {
    if (r.status === 'rejected') degradedSet.add(names[i])
  })
  if (degradedSet.size === 3) {
    // nada carregou: o painel está fora — erro claro em vez de tela vazia
    const first = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    throw new Error(
      first.reason instanceof Error
        ? first.reason.message
        : 'O painel Xtream não respondeu a nenhuma consulta.',
    )
  }

  const liveCats = (val(liveCatsR) ?? []) as XtreamCategory[]
  const vodCats = (val(vodCatsR) ?? []) as XtreamCategory[]
  const serCats = (val(serCatsR) ?? []) as XtreamCategory[]
  const live = (val(liveR) ?? []) as XtreamLiveStream[]
  const vod = (val(vodR) ?? []) as XtreamVodStream[]
  const series = (val(seriesR) ?? []) as XtreamSeries[]

  const liveNames = catMap(liveCats)
  const vodNames = catMap(vodCats)
  const serNames = catMap(serCats)

  const movies: MediaItem[] = (Array.isArray(vod) ? vod : []).map((v, i) => ({
    id: String(v.stream_id),
    type: 'movie',
    source: 'xtream',
    title: v.name,
    poster: v.stream_icon || undefined,
    category: vodNames[v.category_id],
    categoryId: v.category_id,
    rating: v.rating ? Number(v.rating) : undefined,
    ext: v.container_extension || 'mp4',
    num: v.num ?? i,
    addedAt: toMs(v.added),
  }))

  const seriesItems: MediaItem[] = (Array.isArray(series) ? series : []).map((s, i) => ({
    id: String(s.series_id),
    type: 'series',
    source: 'xtream',
    title: s.name,
    poster: s.cover || undefined,
    backdrop: Array.isArray(s.backdrop) ? s.backdrop[0] : undefined,
    category: serNames[s.category_id],
    categoryId: s.category_id,
    year: s.releaseDate ? String(s.releaseDate).slice(0, 4) : undefined,
    rating: s.rating ? Number(s.rating) : undefined,
    plot: s.plot,
    num: s.num ?? i,
    addedAt: toMs(s.last_modified),
  }))

  const liveItems: MediaItem[] = (Array.isArray(live) ? live : []).map((l, i) => ({
    id: String(l.stream_id),
    type: 'live',
    source: 'xtream',
    title: l.name,
    poster: l.stream_icon || undefined,
    category: liveNames[l.category_id],
    categoryId: l.category_id,
    num: l.num ?? i,
    addedAt: toMs(l.added),
  }))

  const sports = liveItems.filter(
    (l) => SPORT_RE.test(l.category ?? '') || SPORT_RE.test(l.title),
  )

  return {
    movies,
    series: seriesItems,
    live: liveItems,
    sports,
    fixtures: [],
    ...(degradedSet.size > 0 ? { degraded: [...degradedSet] } : {}),
  }
}

export async function loadDemoCatalog(): Promise<XtreamCatalogData> {
  // APK nativo: catálogo demo montado no cliente (não há /api/catalog)
  if (isNativeDirect()) return directDemoCatalog()
  const data = await cached<DemoCatalog>('demo:catalog', CLIENT_TTL.catalog, async () =>
    json<{ data: DemoCatalog }>('/api/catalog').then((r) => r.data),
  )
  return {
    movies: data.movies,
    series: data.series,
    live: data.live,
    sports: data.live.filter((l) => l.category === 'Esportes'),
    fixtures: data.fixtures,
  }
}

// ---------- detalhes de série ----------

export async function loadSeriesInfo(
  item: MediaItem,
  mode: 'demo' | 'xtream' | undefined,
): Promise<SeriesDetail> {
  if (item.source === 'demo') {
    const r = await json<{
      data: { seasons: number[]; episodes: EpisodeItem[] }
    }>(`/api/catalog?what=series-info&id=${encodeURIComponent(item.id)}`)
    // agrupa o array plano por temporada (mesma forma do modo xtream)
    const grouped: Record<number, EpisodeItem[]> = {}
    for (const ep of r.data.episodes ?? []) {
      const s = ep.season || 1
      ;(grouped[s] ??= []).push(ep)
    }
    const seasons =
      r.data.seasons?.length > 0
        ? r.data.seasons
        : [...new Set(Object.keys(grouped).map(Number))].sort((a, b) => a - b)
    return { ...item, seasons, episodes: grouped }
  }
  // xtream
  const payload = await cached(
    `xt:series:${item.id}`,
    CLIENT_TTL.seriesInfo,
    async (): Promise<XtreamSeriesInfo> => {
      if (isNativeDirect()) {
        return (await directXtreamQ()('get_series_info', {
          series_id: item.id,
        })) as XtreamSeriesInfo
      }
      return json<{ data: XtreamSeriesInfo }>(
        `/api/xtream?action=get_series_info&series_id=${encodeURIComponent(item.id)}`,
      ).then((r) => r.data)
    },
  )
  const seasonsSet = new Set<number>()
  const episodes: Record<number, EpisodeItem[]> = {}
  for (const [seasonStr, eps] of Object.entries(payload.episodes ?? {})) {
    const season = Number(seasonStr) || 1
    seasonsSet.add(season)
    episodes[season] = (eps ?? []).map((e) => ({
      id: String(e.id),
      season,
      num: e.episode_num,
      title: e.title || `Episódio ${e.episode_num}`,
      plot: e.info?.plot,
      durationSec: e.info?.duration_secs,
      image: e.info?.movie_image,
      ext: e.container_extension || 'mp4',
    }))
  }
  if (seasonsSet.size === 0 && Array.isArray(payload.seasons)) {
    for (const s of payload.seasons) if (s.season > 0) seasonsSet.add(s.season)
  }
  return {
    ...item,
    seasons: [...seasonsSet].sort((a, b) => a - b),
    episodes,
  }
}

// ---------- detalhes de VOD (ficha completa do filme) ----------

const DEMO_CAST = [
  'Ana Praia, Marcos Luna, Vera Duarte',
  'Rafael Pontes, Clara Íris, Tomás Vento',
  'Helena Serra, Bruno Marés, Íris Campo',
]
const DEMO_DIRECTORS = ['Lia Orvalho', 'Pedro Eclipse', 'Marta Zênite']

export async function loadVodInfo(item: MediaItem): Promise<VodInfo> {
  if (item.source === 'demo') {
    // ficha sintética determinística para o modo demo
    const h = [...item.id].reduce((a, c) => a + c.charCodeAt(0), 0)
    return {
      cast: DEMO_CAST[h % DEMO_CAST.length],
      director: DEMO_DIRECTORS[h % DEMO_DIRECTORS.length],
      genre: item.category,
      plot: item.plot,
      durationSec: item.durationSec,
      year: item.year,
      rating: item.rating,
      backdrop: item.backdrop,
      country: 'Brasil',
    }
  }
  const payload = await cached(
    `xt:vod:${item.id}`,
    CLIENT_TTL.vodInfo,
    async (): Promise<XtreamVodInfo> => {
      if (isNativeDirect()) {
        return (await directXtreamQ()('get_vod_info', {
          vod_id: item.id,
        })) as XtreamVodInfo
      }
      return json<{ data: XtreamVodInfo }>(
        `/api/xtream?action=get_vod_info&vod_id=${encodeURIComponent(item.id)}`,
      ).then((r) => r.data)
    },
  )
  const info = payload.info ?? {}
  return {
    cast: info.cast,
    director: info.director,
    genre: info.genre || item.category,
    plot: info.plot || item.plot,
    durationSec: info.duration_secs || item.durationSec,
    year: info.releaseDate ? String(info.releaseDate).slice(0, 4) : item.year,
    rating: info.rating ? Number(info.rating) : item.rating,
    backdrop: Array.isArray(info.backdrop) ? info.backdrop[0] : item.backdrop,
    youtubeTrailer: info.youtube_trailer || undefined,
    country: info.country,
  }
}

// ---------- EPG (guia de programação) ----------

interface XtreamEpgListing {
  id?: string
  title?: string
  lang?: string
  start?: string
  end?: string
  start_timestamp?: string
  stop_timestamp?: string
  description?: string
  channel_id?: string
}

/** Xtream manda títulos base64 (às vezes "base64:"); decodifica com UTF-8 */
function decodeEpg(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  try {
    const b64 = raw.replace(/^base64:/i, '').replace(/\s/g, '')
    const bin = atob(b64)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return new TextDecoder('utf-8').decode(bytes).trim() || undefined
  } catch {
    return raw || undefined
  }
}

/** Gera programação sintética determinística p/ canais demo (janela -1h..+7h) */
function demoEpg(channel: MediaItem): EpgProgram[] {
  const h = [...channel.id].reduce((a, c) => a + c.charCodeAt(0), 0)
  const isSport = channel.category === 'Esportes'
  const isNews = channel.category === 'Notícias'
  const isKids = channel.category === 'Infantil'
  const pool = isSport
    ? ['Futebol: Brasileirão', 'Mesa-Redonda Aurora', 'Libertadores ao Vivo', 'Melhores Momentos', 'Arena Boxing', 'Seleção de Estreias']
    : isNews
      ? ['Jornal da Manhã', 'Cobertura Internacional', 'Economia em Foco', 'Entrevista Aurora', 'Boletim: Agora', 'Debate da Noite']
      : isKids
        ? ['Desenhos Aurora', 'Clube da Turma', 'Aventura Kids', 'Hora da História', 'Música e Brincadeira', 'Maratona Dupla']
        : ['Sessão da Tarde', 'Cult Classic', 'Maratona Sci-Fi', 'Festival de Comédia', 'Noite de Suspense', 'Cine Documentário']
  const out: EpgProgram[] = []
  const hour0 = new Date()
  hour0.setMinutes(0, 0, 0)
  const start0 = hour0.getTime() - 1 * 3600_000
  let cursor = start0
  let i = 0
  while (cursor < start0 + 8 * 3600_000) {
    const durs = [30, 60, 60, 90, 120]
    const dur = durs[(h + i * 7) % durs.length] * 60_000
    const idx = (h + i) % pool.length
    out.push({
      id: `${channel.id}-p${i}`,
      title: pool[idx],
      desc: `Programação ${channel.title} · ${Math.round(dur / 60000)} min`,
      start: cursor,
      end: cursor + dur,
    })
    cursor += dur
    i++
  }
  return out
}

export async function loadEpgPrograms(channel: MediaItem): Promise<EpgProgram[]> {
  if (channel.source === 'demo') return demoEpg(channel)
  const payload = await cached<{ epg_listings?: XtreamEpgListing[] }>(
    `xt:epg:${channel.id}`,
    CLIENT_TTL.epg,
    async () => {
      if (isNativeDirect()) {
        return (await directXtreamQ()('get_simple_data_table', {
          stream_id: channel.id,
        })) as { epg_listings?: XtreamEpgListing[] }
      }
      return json<{ data: { epg_listings?: XtreamEpgListing[] } }>(
        `/api/xtream?action=get_simple_data_table&stream_id=${encodeURIComponent(channel.id)}`,
      ).then((r) => r.data)
    },
  )
  const listings = payload.epg_listings ?? []
  const out: EpgProgram[] = []
  for (const [i, l] of listings.entries()) {
    const start = Number(l.start_timestamp) * 1000
    const end = Number(l.stop_timestamp ?? l.end) * 1000
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    out.push({
      id: l.id ?? `${channel.id}-e${i}`,
      title: decodeEpg(l.title) ?? 'Programa',
      desc: decodeEpg(l.description),
      start,
      end,
    })
  }
  return out
}

// ---------- favoritos / progresso ----------

export interface FavoriteRow {
  id: string
  mediaId: string
  mediaType: 'live' | 'movie' | 'series'
  title: string
  poster: string | null
  category: string | null
  createdAt: string
}

export interface ProgressRow {
  id: string
  mediaId: string
  mediaType: 'live' | 'movie' | 'series'
  title: string
  poster: string | null
  season: number | null
  episode: number | null
  episodeTitle: string | null
  positionSec: number
  durationSec: number
  updatedAt: string
}

export async function loadFavorites(): Promise<FavoriteRow[]> {
  if (isNativeDirect()) return directFavorites()
  const r = await json<{ data: FavoriteRow[] }>('/api/favorites')
  return r.data
}

export async function toggleFavoriteRow(item: MediaItem): Promise<boolean> {
  if (isNativeDirect()) return directToggleFavorite(item)
  const r = await json<{ favorited: boolean }>('/api/favorites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mediaId: item.id,
      mediaType: item.type,
      title: item.title,
      poster: item.poster ?? null,
      category: item.category ?? null,
    }),
  })
  return r.favorited
}

export async function loadProgress(): Promise<ProgressRow[]> {
  if (isNativeDirect()) return directProgress()
  const r = await json<{ data: ProgressRow[] }>('/api/progress')
  return r.data
}

export async function saveProgressRow(p: {
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
  if (isNativeDirect()) {
    directSaveProgressRow(p)
    return
  }
  await json('/api/progress', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(p),
  }).catch(() => {})
}

// ---------- utilidades ----------

export async function measurePing(): Promise<number> {
  const t0 = performance.now()
  try {
    if (isNativeDirect()) {
      // APK: mede a latência direta ao painel Xtream
      const s = directSession()
      if (!s?.server) return -1
      await fetch(buildApiUrl(s.server, s.username ?? '', s.password ?? ''), {
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      })
      return Math.round(performance.now() - t0)
    }
    await fetch(`/api/ping?_=${Date.now()}`, { cache: 'no-store' })
    return Math.round(performance.now() - t0)
  } catch {
    return -1
  }
}

export function sectionLabel(s: ScreenId): string {
  switch (s) {
    case 'home':
      return 'Início'
    case 'movies':
      return 'Filmes'
    case 'series':
      return 'Séries'
    case 'live':
      return 'Canais'
    case 'sports':
      return 'Futebol'
    case 'favorites':
      return 'Favoritos'
    case 'continue':
      return 'Continuar'
  }
}
