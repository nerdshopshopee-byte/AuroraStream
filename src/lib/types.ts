// ============================================================
// AuroraStream — Tipos compartilhados (cliente e servidor)
// ============================================================

export type MediaType = 'live' | 'movie' | 'series'

/** Telas dedicadas do dashboard */
export type ScreenId =
  | 'home'
  | 'movies'
  | 'series'
  | 'live'
  | 'sports'
  | 'favorites'
  | 'continue'

/** Filtro por título/tema aplicado às linhas de conteúdo */
export interface ContentFilter {
  /** termo de busca por título (acentos ignorados) */
  q: string
  /** categoria/tema selecionada (chips) */
  cat: string | null
}

export const EMPTY_FILTER: ContentFilter = { q: '', cat: null }

/** Linha horizontal de conteúdo (um "slider" por categoria) */
export interface ContentRowData {
  id: string
  title: string
  /** itens exibidos no slider (limitados a ROW_LIMIT) */
  items: MediaItem[]
  /** lista completa sem limite — usada pela visualização em grade */
  full?: MediaItem[]
  /** total real de itens da linha (conta exibida no botão "Ver tudo") */
  total?: number
  /** hero = carrossel central grande (padrão Aurora) */
  variant?: 'hero' | 'default'
  /** cards 16:9 (canais ao vivo) */
  wide?: boolean
}

export interface MediaItem {
  id: string
  type: MediaType
  title: string
  poster?: string
  backdrop?: string
  category?: string
  categoryId?: string
  year?: string
  rating?: number
  plot?: string
  durationSec?: number
  /** URL bruta do stream (sempre tocar via /api/stream?u=...) */
  streamUrl?: string
  ext?: string
  num?: number
  /** rótulo do episódio (ex.: "T1:E3") para itens de "Continuar" */
  epLabel?: string
  /** posição para retomada (segundos) — anexado nas linhas de continuar */
  resumeAt?: number
  /** data de adição no servidor (ms) — linha "Adicionados recentemente" */
  addedAt?: number
  /** metadados extras por origem */
  source?: 'demo' | 'xtream'
}

export interface EpisodeItem {
  id: string
  season: number
  num: number
  title: string
  plot?: string
  durationSec?: number
  image?: string
  streamUrl?: string
  ext?: string
}

export interface SeriesDetail extends MediaItem {
  seasons: number[]
  episodes: Record<number, EpisodeItem[]>
}

/** Metadados completos de VOD (get_vod_info) para a ficha do filme */
export interface VodInfo {
  cast?: string
  director?: string
  genre?: string
  plot?: string
  durationSec?: number
  year?: string
  rating?: number
  backdrop?: string
  youtubeTrailer?: string
  country?: string
}

/** Programa da grade de programação (EPG) de um canal ao vivo */
export interface EpgProgram {
  id: string
  title: string
  desc?: string
  /** início/fim em ms desde epoch */
  start: number
  end: number
}

export interface SessionInfo {
  mode: 'demo' | 'xtream'
  label: string
  server?: string
  username?: string
  /** necessário no cliente para montar as URLs de stream Xtream */
  password?: string
  status?: string
  expiry?: string // ISO
  isTrial?: boolean
  activeConnections?: number
  maxConnections?: number
  timezone?: string
}

export interface PlayerStats {
  bitrateKbps: number
  bufferSec: number
  level: string
  droppedFrames: number
  resolution: string
  latencySec: number
}

/** Envelopa uma URL para tocar através do proxy anti-CORS do servidor */
export function proxyStreamUrl(url: string): string {
  return `/api/stream?u=${encodeURIComponent(url)}`
}

/** Extensões de arquivo direto (VOD) — tocáveis via <video> ou transcodificação */
const DIRECT_FILE_RE = /\.(mp4|m4v|webm|mov|mkv|avi|wmv|flv|mpg|mpeg|m2ts|3gp|ogv|vob|asf)(\?|#|$)/i

/**
 * Containers que o navegador NÃO reproduz nativamente (MKV/AVI/WMV/FLV/MPG…).
 * Precisam passar pela rota de transcodificação (/api/transcode, ffmpeg).
 */
const NEEDS_TRANSCODE_RE = /\.(mkv|avi|wmv|flv|mpg|mpeg|m2ts|vob|asf|3gp)(\?|#|$)/i

/** True quando a URL aponta para um arquivo direto (VOD) em vez de playlist HLS */
export function isDirectFile(url: string): boolean {
  return DIRECT_FILE_RE.test(url)
}

/** True quando o container exige transcodificação server-side (ffmpeg) */
export function needsTranscode(url: string): boolean {
  return NEEDS_TRANSCODE_RE.test(url)
}

/**
 * Envelopa uma URL para a rota de transcodificação ffmpeg (fMP4 progressivo).
 * `ss` (opcional) reinicia o ffmpeg a partir do offset em segundos —
 * é assim que o seek funciona em mídia transcodificada.
 */
export function transcodeStreamUrl(url: string, ss?: number): string {
  const q = ss && ss > 0 ? `&ss=${Math.floor(ss)}` : ''
  return `/api/transcode?u=${encodeURIComponent(url)}${q}`
}

/** Chave única de mídia para favoritos/progresso */
export function mediaKey(type: MediaType, id: string): string {
  return `${type}:${id}`
}
