// ============================================================
// AuroraStream — Store global (zustand)
// Modelo de navegação: telas dedicadas → linhas (sliders) → itens
// ============================================================

'use client'

import { create } from 'zustand'
import { toast } from 'sonner'
import type {
  ContentFilter,
  ContentRowData,
  EpisodeItem,
  MediaItem,
  ScreenId,
  SessionInfo,
} from './types'
import { EMPTY_FILTER } from './types'
import {
  apiLogin,
  apiLogout,
  apiSession,
  loadDemoCatalog,
  loadFavorites,
  loadProgress,
  loadSeriesInfo,
  loadXtreamCatalog,
  saveProgressRow,
  sectionLabel,
  toggleFavoriteRow,
  type FixtureRow,
  type FavoriteRow,
  type ProgressRow,
  type XtreamCatalogData,
} from './client'
import { movieStreamUrl, seriesStreamUrl, liveStreamUrl } from './xtream'
import {
  hideAdultEnabled,
  isAdultItem,
  isUnlocked,
  parentalEnabled,
} from './parental'

export type OverlayState =
  | { kind: 'details'; item: MediaItem }
  | { kind: 'search' }
  | { kind: 'settings' }
  | null

/** Diálogo de PIN parental aberto sobre o dashboard */
export interface PinRequest {
  intent: 'play' | 'unlock'
  /** destino da reprodução após o desbloqueio (intent "play") */
  item?: MediaItem
  episode?: EpisodeItem | null
  startAt?: number
}

export type FocusZone = 'menu' | 'content'

export interface PlayerRequest {
  item: MediaItem
  episode?: EpisodeItem | null
  startAt?: number
}

/** Página em grade (aberta pelo botão "Ver tudo" de uma linha) */
export interface GridState {
  title: string
  items: MediaItem[]
  wide: boolean
}

/** Guia de programação (multi-EPG) de canais ao vivo */
export interface EpgState {
  focusChannelId?: string
}

/** Máximo de itens exibidos no slider de cada linha (o resto fica na grade) */
export const ROW_LIMIT = 24

/** Ordem das telas no menu superior (blades) */
export const SCREEN_ORDER: ScreenId[] = [
  'home',
  'movies',
  'series',
  'live',
  'sports',
  'favorites',
  'continue',
]

interface AuroraStore {
  view: 'loading' | 'login' | 'dashboard'
  session: SessionInfo | null
  catalog: XtreamCatalogData | null
  screen: ScreenId
  rows: ContentRowData[]
  activeRow: number
  /** índice selecionado dentro de cada linha (paralelo a rows) */
  selectedByRow: number[]
  focusZone: FocusZone
  menuIdx: number
  filter: ContentFilter
  sectionLoading: boolean
  overlay: OverlayState
  player: PlayerRequest | null
  grid: GridState | null
  epg: EpgState | null
  pinRequest: PinRequest | null
  favorites: FavoriteRow[]
  progress: ProgressRow[]
  fixtures: FixtureRow[]
  ping: number
  bufferSec: number
  bootError: string | null

  init: () => Promise<void>
  login: (payload: {
    mode: 'demo' | 'xtream'
    server?: string
    username?: string
    password?: string
  }) => Promise<void>
  logout: () => Promise<void>
  setScreen: (s: ScreenId) => void
  setFilter: (patch: Partial<ContentFilter>) => void
  clearFilter: () => void
  select: (row: number, idx: number) => void
  moveSelection: (dx: number) => void
  moveRow: (dy: number) => void
  focusMenu: () => void
  focusContent: () => void
  moveMenu: (dx: number) => void
  activateMenu: () => void
  openDetails: (item: MediaItem) => void
  openSearch: () => void
  openSettings: () => void
  closeOverlay: () => void
  openGrid: (row: ContentRowData) => void
  closeGrid: () => void
  openEpg: (channelId?: string) => void
  closeEpg: () => void
  play: (item: MediaItem, episode?: EpisodeItem | null, startAt?: number) => void
  closePlayer: () => void
  requestPin: (req: PinRequest) => void
  closePinRequest: () => void
  refreshUserData: () => Promise<void>
  toggleFavorite: (item: MediaItem) => Promise<boolean>
  persistProgress: (p: {
    item: MediaItem
    positionSec: number
    durationSec: number
    episode?: EpisodeItem | null
  }) => Promise<void>
  setPing: (n: number) => void
  setBuffer: (n: number) => void
}

/** Avisa (uma vez por carregamento) quando parte do catálogo não subiu */
function notifyDegraded(catalog: XtreamCatalogData | null) {
  if (catalog?.degraded?.length) {
    toast.warning('Catálogo carregado parcialmente', {
      description: `O provedor não respondeu: ${catalog.degraded.join(', ')}. As demais seções estão disponíveis.`,
    })
  }
}

export const useAurora = create<AuroraStore>((set, get) => ({
  view: 'loading',
  session: null,
  catalog: null,
  screen: 'home',
  rows: [],
  activeRow: 0,
  selectedByRow: [],
  focusZone: 'content',
  menuIdx: 0,
  filter: EMPTY_FILTER,
  sectionLoading: false,
  overlay: null,
  player: null,
  grid: null,
  epg: null,
  pinRequest: null,
  favorites: [],
  progress: [],
  fixtures: [],
  ping: 0,
  bufferSec: 0,
  bootError: null,

  init: async () => {
    try {
      const session = await apiSession()
      if (!session) {
        set({ view: 'login' })
        return
      }
      set({ session, view: 'dashboard' })
      const catalog = await (session.mode === 'xtream' ? loadXtreamCatalog() : loadDemoCatalog())
      const [favorites, progress] = await Promise.all([
        loadFavorites().catch(() => [] as FavoriteRow[]),
        loadProgress().catch(() => [] as ProgressRow[]),
      ])
      set({
        catalog,
        favorites,
        progress,
        fixtures: catalog.fixtures ?? [],
      })
      notifyDegraded(catalog)
      get().setScreen('home')
    } catch (err) {
      set({
        view: 'login',
        bootError: err instanceof Error ? err.message : 'Falha ao carregar dados.',
      })
    }
  },

  login: async (payload) => {
    const session = await apiLogin(payload)
    clearProgressAndFav(set)
    set({ session, view: 'dashboard' })
    const catalog = await (session.mode === 'xtream' ? loadXtreamCatalog() : loadDemoCatalog())
    const [favorites, progress] = await Promise.all([
      loadFavorites().catch(() => [] as FavoriteRow[]),
      loadProgress().catch(() => [] as ProgressRow[]),
    ])
    set({
      catalog,
      favorites,
      progress,
      fixtures: catalog.fixtures ?? [],
    })
    notifyDegraded(catalog)
    get().setScreen('home')
  },

  logout: async () => {
    await apiLogout()
    clearProgressAndFav(set)
    set({ view: 'login', session: null, catalog: null, overlay: null, player: null, grid: null, epg: null, pinRequest: null })
  },

  setScreen: (s) => {
    const { catalog, favorites, progress, session } = get()
    const rows = buildRows(s, catalog, favorites, progress, session, EMPTY_FILTER)
    set({
      screen: s,
      filter: EMPTY_FILTER,
      rows,
      activeRow: 0,
      selectedByRow: rows.map(() => 0),
      focusZone: 'content',
      menuIdx: Math.max(0, SCREEN_ORDER.indexOf(s)),
      sectionLoading: false,
    })
  },

  setFilter: (patch) => {
    const filter = { ...get().filter, ...patch }
    const { screen, catalog, favorites, progress, session } = get()
    const rows = buildRows(screen, catalog, favorites, progress, session, filter)
    set({
      filter,
      rows,
      activeRow: 0,
      selectedByRow: rows.map(() => 0),
      focusZone: 'content',
    })
  },

  clearFilter: () => get().setFilter({ q: '', cat: null }),

  select: (row, idx) => {
    const { rows, selectedByRow } = get()
    if (row < 0 || row >= rows.length) return
    const len = rows[row].items.length
    if (len === 0) return
    const clamped = Math.max(0, Math.min(idx, len - 1))
    const next = [...selectedByRow]
    next[row] = clamped
    set({ activeRow: row, selectedByRow: next })
  },

  moveSelection: (dx) => {
    const { rows, activeRow, selectedByRow } = get()
    const r = rows[activeRow]
    if (!r || r.items.length === 0) return
    const idx = (selectedByRow[activeRow] ?? 0) + dx
    if (idx < 0 || idx >= r.items.length) return
    const next = [...selectedByRow]
    next[activeRow] = idx
    set({ selectedByRow: next })
  },

  moveRow: (dy) => {
    const { rows, activeRow } = get()
    const target = activeRow + dy
    if (target < 0 || target >= rows.length) return
    set({ activeRow: target, focusZone: 'content' })
  },

  focusMenu: () => {
    const { screen, menuIdx } = get()
    const idx = SCREEN_ORDER.indexOf(screen)
    set({ focusZone: 'menu', menuIdx: idx >= 0 ? idx : menuIdx })
  },
  focusContent: () => set({ focusZone: 'content' }),
  moveMenu: (dx) => {
    const idx = get().menuIdx + dx
    if (idx < 0 || idx >= SCREEN_ORDER.length) return
    set({ menuIdx: idx })
  },
  activateMenu: () => {
    const { menuIdx } = get()
    const s = SCREEN_ORDER[menuIdx]
    if (s) get().setScreen(s)
  },

  openDetails: (item) =>
    set({
      overlay: {
        kind: 'details',
        // itens de "Continuar" carregam id composto (mediaId::sTeE) —
        // a ficha da série precisa do id puro para buscar os episódios
        item: item.id.includes('::') ? { ...item, id: item.id.split('::')[0] } : item,
      },
    }),
  openSearch: () => set({ overlay: { kind: 'search' } }),
  openSettings: () => set({ overlay: { kind: 'settings' } }),
  closeOverlay: () => set({ overlay: null }),

  openGrid: (row) =>
    set({
      grid: {
        title: row.title,
        items: row.full ?? row.items,
        wide: row.wide === true,
      },
    }),
  closeGrid: () => set({ grid: null }),

  openEpg: (channelId) => set({ epg: { focusChannelId: channelId } }),
  closeEpg: () => set({ epg: null }),

  play: (item, episode = null, startAt = 0) => {
    // Séries não têm streamUrl própria: sem episódio, a URL montada apontaria
    // para /series/{series_id}.mp4 (404). Abre a ficha com os episódios.
    if (item.type === 'series' && !episode) {
      set({ overlay: { kind: 'details', item }, grid: null, epg: null })
      return
    }
    // controle parental: conteúdo +18 exige PIN (uma vez por sessão)
    if (parentalEnabled() && !isUnlocked() && isAdultItem(item)) {
      set({ pinRequest: { intent: 'play', item, episode, startAt } })
      return
    }
    const session = get().session
    // resolve URL no momento do play
    let url = item.streamUrl
    const resolve = (type: MediaItem['type'], id: string, ext?: string) => {
      if (session?.mode === 'xtream' && session.server && session.username && session.password) {
        const { server, username, password } = session
        if (type === 'movie') return movieStreamUrl(server, username, password, id, ext)
        if (type === 'live') return liveStreamUrl(server, username, password, id, 'm3u8')
        if (type === 'series') return seriesStreamUrl(server, username, password, id, ext)
      }
      return url
    }
    if (!url && item.source === 'xtream') {
      url = resolve(item.type, item.id, item.ext)
    }
    // Guarda de integridade: sem URL de stream o player ficaria eternamente
    // em "Bufferizando 0%". Aviso claro em vez de spinner sem fim.
    // (acontecia quando a sessão do cliente vinha sem credenciais do painel)
    if (!url) {
      toast.error('Não foi possível abrir o vídeo', {
        description:
          'A sessão não tem as credenciais do painel. Saia e entre novamente para recarregar.',
      })
      return
    }
    const finalItem = { ...item, streamUrl: url }
    if (episode) {
      let epUrl = episode.streamUrl
      if (!epUrl && episode.ext && item.type === 'series') {
        epUrl = resolve('series', episode.id, episode.ext)
      }
      if (!epUrl) {
        toast.error('Não foi possível abrir o episódio', {
          description:
            'A sessão não tem as credenciais do painel. Saia e entre novamente para recarregar.',
        })
        return
      }
      set({
        player: {
          item: finalItem,
          episode: { ...episode, streamUrl: epUrl },
          startAt,
        },
        overlay: null,
        grid: null,
        epg: null,
      })
    } else {
      set({ player: { item: finalItem, startAt }, overlay: null, grid: null, epg: null })
    }
  },

  closePlayer: () => set({ player: null }),

  requestPin: (req) => set({ pinRequest: req }),
  closePinRequest: () => set({ pinRequest: null }),

  refreshUserData: async () => {
    const [favorites, progress] = await Promise.all([
      loadFavorites().catch(() => [] as FavoriteRow[]),
      loadProgress().catch(() => [] as ProgressRow[]),
    ])
    set({ favorites, progress })
    // reconstrói linhas derivadas (Início / Favoritos / Continuar)
    const { screen, filter, catalog, session, activeRow, selectedByRow } = get()
    if (screen === 'home' || screen === 'favorites' || screen === 'continue') {
      const rows = buildRows(screen, catalog, favorites, progress, session, filter)
      const fit = fitSelections(rows, selectedByRow, activeRow)
      set({ rows, ...fit })
    }
  },

  toggleFavorite: (item) =>
    toggleFavoriteRow(item).then(async (fav) => {
      await get().refreshUserData()
      return fav
    }),

  persistProgress: async ({ item, positionSec, durationSec, episode }) => {
    if (durationSec <= 0) return
    if (positionSec / Math.max(durationSec, 1) > 0.97) return // terminado
    await saveProgressRow({
      mediaId: item.id,
      mediaType: item.type,
      title: item.title,
      poster: item.poster ?? null,
      positionSec,
      durationSec,
      season: episode?.season ?? null,
      episode: episode?.num ?? null,
      episodeTitle: episode?.title ?? null,
    })
    await get().refreshUserData()
  },

  setPing: (n) => set({ ping: n }),
  setBuffer: (n) => set({ bufferSec: n }),
}))

// ============================================================
// Construção das linhas por tela
// ============================================================

const norm = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/**
 * Remove itens inválidos (sem id/type) e duplicados — corrige o erro
 * "Encountered two children with the same key" do carrossel.
 */
function sanitizeItems(items: MediaItem[]): MediaItem[] {
  const seen = new Set<string>()
  const out: MediaItem[] = []
  for (const it of items) {
    if (!it || typeof it !== 'object') continue
    if (it.id == null || it.type == null) continue
    const k = `${it.type}:${it.id}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(it)
  }
  return out
}

/** Filtro por termo (título/categoria, acento-insensível) e por categoria */
function applyFilter(items: MediaItem[], f: ContentFilter): MediaItem[] {
  const q = norm(f.q.trim())
  return items.filter((i) => {
    if (f.cat && (i.category ?? '') !== f.cat) return false
    if (q.length >= 2 && !norm(i.title).includes(q) && !norm(i.category ?? '').includes(q))
      return false
    return true
  })
}

function topRated(items: MediaItem[], n: number): MediaItem[] {
  return [...items]
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, n)
}

/** Ordena por data de adição (mais recentes primeiro) */
function byRecent(items: MediaItem[]): MediaItem[] {
  return [...items].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
}

function hasRecents(items: MediaItem[]): boolean {
  return items.some((i) => i.addedAt != null)
}

function hasActiveFilter(f: ContentFilter): boolean {
  return f.q.trim().length >= 2 || f.cat != null
}

/**
 * Normaliza a linha: exibe no máximo ROW_LIMIT itens no slider;
 * a lista completa fica em `full` para a página em grade ("Ver tudo").
 */
function limitRow(row: ContentRowData): ContentRowData {
  const full = row.full ?? row.items
  const total = full.length
  if (total <= ROW_LIMIT) return { ...row, items: full, full, total }
  return { ...row, items: full.slice(0, ROW_LIMIT), full, total }
}

/** Itens de favoritos resolvidos contra o catálogo (deduplicados) */
function favoriteClones(
  favorites: FavoriteRow[],
  catalog: XtreamCatalogData,
  session: SessionInfo | null,
): MediaItem[] {
  return sanitizeItems(favorites.map((f) => rowToItem(f, catalog, session)))
}

/**
 * Itens de "Continuar": episódios da mesma série recebem ids únicos
 * (mediaId::sTeE) — sem isso, duas linhas de progresso da mesma série
 * geravam chaves duplicadas no carrossel.
 */
function continueClones(
  progress: ProgressRow[],
  catalog: XtreamCatalogData,
  session: SessionInfo | null,
): MediaItem[] {
  return sanitizeItems(
    progress
      .filter((p) => p.mediaType !== 'series' || p.episode != null)
      .map((p) => {
        const it = rowToItem(p, catalog, session)
        if (p.mediaType === 'series') {
          it.id = `${p.mediaId}::s${p.season ?? 0}e${p.episode ?? 0}`
          it.epLabel = `T${p.season ?? 1}:E${p.episode ?? 0}`
        }
        return it
      }),
  )
}

function buildRows(
  screen: ScreenId,
  catalog: XtreamCatalogData | null,
  favorites: FavoriteRow[],
  progress: ProgressRow[],
  session: SessionInfo | null,
  filter: ContentFilter,
): ContentRowData[] {
  if (!catalog) return []
  const f = filter ?? EMPTY_FILTER

  // controle parental: oculta itens +18 das linhas quando ativado
  const hideAdult = hideAdultEnabled()
  const vis = (arr: MediaItem[]) =>
    hideAdult ? arr.filter((i) => !isAdultItem(i)) : arr

  switch (screen) {
    case 'home': {
      const rows: ContentRowData[] = []
      const allPool = vis(sanitizeItems([...catalog.movies, ...catalog.series]))
      const highlights = topRated(allPool, 16)
      if (highlights.length)
        rows.push({
          id: 'home-hero',
          title: 'Destaques agora',
          items: highlights,
          variant: 'hero',
          full: allPool,
        })
      const cont = vis(continueClones(progress, catalog, session))
      if (cont.length)
        rows.push({ id: 'home-continue', title: 'Continuar assistindo', items: cont.slice(0, 12), full: cont })
      const favs = vis(favoriteClones(favorites, catalog, session))
      if (favs.length)
        rows.push({ id: 'home-favs', title: 'Favoritos', items: favs.slice(0, 16), full: favs })
      const movies = vis(sanitizeItems(catalog.movies))
      if (movies.length)
        rows.push({ id: 'home-movies', title: 'Filmes', items: topRated(movies, 16), full: movies })
      const series = vis(sanitizeItems(catalog.series))
      if (series.length)
        rows.push({ id: 'home-series', title: 'Séries', items: topRated(series, 16), full: series })
      const live = vis(sanitizeItems(catalog.live))
      if (live.length)
        rows.push({ id: 'home-live', title: 'Canais ao vivo', items: live.slice(0, 20), full: live, wide: true })
      const recent = byRecent(allPool.filter((i) => i.addedAt != null))
      if (recent.length)
        rows.push({
          id: 'home-recent',
          title: 'Adicionados recentemente',
          items: recent.slice(0, 20),
          full: recent,
        })
      return rows.map(limitRow)
    }

    case 'movies': {
      const base = applyFilter(vis(sanitizeItems(catalog.movies)), f)
      if (base.length === 0) return []
      if (hasActiveFilter(f)) {
        const res: ContentRowData[] = [{ id: 'movies-result', title: 'Resultados', items: base }]
        return res.map(limitRow)
      }
      const rows: ContentRowData[] = [
        { id: 'movies-top', title: 'Em destaque', items: topRated(base, 16), variant: 'hero', full: base },
      ]
      if (hasRecents(base))
        rows.push({
          id: 'movies-recent',
          title: 'Adicionados recentemente',
          items: byRecent(base),
          full: byRecent(base),
        })
      rows.push({ id: 'movies-all', title: 'Acervo completo', items: base })
      return rows.map(limitRow)
    }

    case 'series': {
      const base = applyFilter(vis(sanitizeItems(catalog.series)), f)
      if (base.length === 0) return []
      if (hasActiveFilter(f)) {
        const res: ContentRowData[] = [{ id: 'series-result', title: 'Resultados', items: base }]
        return res.map(limitRow)
      }
      const rows: ContentRowData[] = [
        { id: 'series-top', title: 'Em destaque', items: topRated(base, 16), variant: 'hero', full: base },
      ]
      if (hasRecents(base))
        rows.push({
          id: 'series-recent',
          title: 'Adicionados recentemente',
          items: byRecent(base),
          full: byRecent(base),
        })
      rows.push({ id: 'series-all', title: 'Todas as séries', items: base })
      return rows.map(limitRow)
    }

    case 'live': {
      const base = applyFilter(vis(sanitizeItems(catalog.live)), f)
      const sportsIds = new Set(vis(sanitizeItems(catalog.sports)).map((s) => `${s.type}:${s.id}`))
      const sports = base.filter((l) => sportsIds.has(`${l.type}:${l.id}`))
      const rows: ContentRowData[] = []
      if (sports.length)
        rows.push({ id: 'live-sports', title: 'Esportes ao vivo', items: sports, wide: true, full: sports })
      if (base.length)
        rows.push({
          id: 'live-all',
          title: sports.length ? 'Todos os canais' : hasActiveFilter(f) ? 'Resultados' : 'Todos os canais',
          items: base,
          wide: true,
          full: base,
        })
      return rows.map(limitRow)
    }

    case 'sports': {
      const base = applyFilter(vis(sanitizeItems(catalog.sports)), f)
      if (base.length === 0) return []
      return [
        { id: 'sports-channels', title: 'Canais de esportes', items: base, wide: true, full: base },
      ].map(limitRow)
    }

    case 'favorites': {
      const all = vis(favoriteClones(favorites, catalog, session))
      const rows: ContentRowData[] = []
      const movies = applyFilter(all.filter((i) => i.type === 'movie'), f)
      const series = applyFilter(all.filter((i) => i.type === 'series'), f)
      const live = applyFilter(all.filter((i) => i.type === 'live'), f)
      if (movies.length) rows.push({ id: 'fav-movies', title: 'Filmes favoritos', items: movies, full: movies })
      if (series.length) rows.push({ id: 'fav-series', title: 'Séries favoritas', items: series, full: series })
      if (live.length)
        rows.push({ id: 'fav-live', title: 'Canais favoritos', items: live, wide: true, full: live })
      return rows.map(limitRow)
    }

    case 'continue': {
      const all = vis(continueClones(progress, catalog, session))
      const qActive = norm(f.q.trim()).length >= 2
      const match = (i: MediaItem) =>
        !qActive || norm(i.title).includes(norm(f.q.trim())) || norm(i.category ?? '').includes(norm(f.q.trim()))
      const movies = all.filter((i) => i.type === 'movie' && match(i))
      const eps = all.filter((i) => i.type === 'series' && match(i))
      const rows: ContentRowData[] = []
      if (movies.length) rows.push({ id: 'cont-movies', title: 'Filmes em andamento', items: movies, full: movies })
      if (eps.length) rows.push({ id: 'cont-eps', title: 'Episódios', items: eps, full: eps })
      return rows.map(limitRow)
    }
  }
}

/** Reajusta seleções quando as linhas mudam de tamanho */
function fitSelections(
  rows: ContentRowData[],
  prev: number[],
  prevRow: number,
): { selectedByRow: number[]; activeRow: number } {
  const selectedByRow = rows.map((r, i) => {
    const p = prev[i] ?? 0
    return Math.max(0, Math.min(p, Math.max(0, r.items.length - 1)))
  })
  return {
    selectedByRow,
    activeRow: Math.max(0, Math.min(prevRow, Math.max(0, rows.length - 1))),
  }
}

function clearProgressAndFav(set: (p: Partial<AuroraStore>) => void) {
  set({
    catalog: null,
    favorites: [],
    progress: [],
    fixtures: [],
    rows: [],
    activeRow: 0,
    selectedByRow: [],
    screen: 'home',
    filter: EMPTY_FILTER,
    overlay: null,
    player: null,
    grid: null,
    epg: null,
  })
}

function rowToItem(
  row: FavoriteRow | ProgressRow,
  catalog: XtreamCatalogData,
  session: SessionInfo | null,
): MediaItem {
  const base: MediaItem = {
    id: row.mediaId,
    type: row.mediaType,
    title: row.title,
    poster: row.poster ?? undefined,
    category: ('category' in row ? row.category : null) ?? undefined,
    source: session?.mode === 'xtream' ? 'xtream' : 'demo',
  }
  if (row.mediaType === 'series') return base
  // resolve URL na hora
  if (session?.mode === 'xtream' && session.server && session.username && session.password) {
    const { server, username, password } = session
    base.streamUrl =
      row.mediaType === 'movie'
        ? movieStreamUrl(server, username, password, row.mediaId)
        : liveStreamUrl(server, username, password, row.mediaId, 'm3u8')
  } else {
    const pool = [...catalog.movies, ...catalog.live]
    const found = pool.find((m) => m.id === row.mediaId)
    if (found) {
      base.streamUrl = found.streamUrl
      base.ext = found.ext
      base.rating = found.rating
      base.plot = found.plot
      base.year = found.year
      base.durationSec = found.durationSec
    }
  }
  if ('positionSec' in row) {
    base.durationSec = row.durationSec || base.durationSec
    base.resumeAt = row.positionSec
  }
  return base
}

export { sectionLabel }
