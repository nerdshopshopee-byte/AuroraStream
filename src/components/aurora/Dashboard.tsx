'use client'

import { useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import {
  Clapperboard,
  History,
  Home,
  MonitorPlay,
  Search,
  Star,
  Trophy,
  Tv,
} from 'lucide-react'
import { SCREEN_ORDER, useAurora } from '@/lib/store'
import type { ScreenId } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Background } from './Background'
import { StatusBar } from './StatusBar'
import { toast } from 'sonner'
import { HomeScreen } from './screens/HomeScreen'
import { MoviesScreen, SeriesScreen, LiveScreen } from './screens/CatalogScreen'
import { SportsScreen } from './screens/SportsScreen'
import { LibraryScreen } from './screens/LibraryScreen'
import { DetailsOverlay } from './DetailsOverlay'
import { SearchOverlay } from './SearchOverlay'
import { SettingsOverlay } from './SettingsOverlay'
import { GridView } from './GridView'
import { EpgOverlay } from './EpgOverlay'
import { Player } from './Player'
import { PinDialog } from './PinDialog'

const MENU_ICONS: Record<ScreenId, React.ReactNode> = {
  home: <Home size={14} />,
  movies: <Clapperboard size={14} />,
  series: <MonitorPlay size={14} />,
  live: <Tv size={14} />,
  sports: <Trophy size={14} />,
  favorites: <Star size={14} />,
  continue: <History size={14} />,
}

const MENU_LABELS: Record<ScreenId, string> = {
  home: 'Início',
  movies: 'Filmes',
  series: 'Séries',
  live: 'Canais',
  sports: 'Futebol',
  favorites: 'Favoritos',
  continue: 'Continuar',
}

export function Dashboard() {
  const screen = useAurora((s) => s.screen)
  const focusZone = useAurora((s) => s.focusZone)
  const menuIdx = useAurora((s) => s.menuIdx)
  const overlay = useAurora((s) => s.overlay)
  const player = useAurora((s) => s.player)
  const grid = useAurora((s) => s.grid)
  const epg = useAurora((s) => s.epg)
  const pinRequest = useAurora((s) => s.pinRequest)
  const sectionLoading = useAurora((s) => s.sectionLoading)
  const catalog = useAurora((s) => s.catalog)
  const activeRow = useAurora((s) => s.activeRow)
  const rows = useAurora((s) => s.rows)
  const selectedByRow = useAurora((s) => s.selectedByRow)

  const activeItem = rows[activeRow]?.items?.[selectedByRow[activeRow] ?? 0] ?? null

  // ------- Esc fecha overlays (mesmo com foco dentro deles) -------
  useEffect(() => {
    if (!overlay) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useAurora.getState().closeOverlay()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [overlay])

  // ------- Esc fecha a grade (quando o foco não está na busca) -------
  useEffect(() => {
    if (!grid) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (e.key === 'Escape' && tag !== 'INPUT') useAurora.getState().closeGrid()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [grid])

  // ------- Esc fecha o multi-EPG (o overlay tem listener próprio p/ setas) -------
  useEffect(() => {
    if (!epg) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (e.key === 'Escape' && tag !== 'INPUT') useAurora.getState().closeEpg()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [epg])

  // ------- Esc fecha o diálogo de PIN parental -------
  useEffect(() => {
    if (!pinRequest) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useAurora.getState().closePinRequest()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pinRequest])

  // ------- navegação por teclado (D-pad de TV Box) -------
  useEffect(() => {
    if (overlay || player || grid || epg || pinRequest) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const st = useAurora.getState()
      const item = st.rows[st.activeRow]?.items?.[st.selectedByRow[st.activeRow] ?? 0] ?? null
      const inMenu = st.focusZone === 'menu'

      switch (e.key) {
        case 'ArrowLeft':
          if (inMenu) st.moveMenu(-1)
          else st.moveSelection(-1)
          break
        case 'ArrowRight':
          if (inMenu) st.moveMenu(1)
          else st.moveSelection(1)
          break
        case 'ArrowUp':
          if (inMenu) return
          if (st.activeRow === 0) st.focusMenu()
          else st.moveRow(-1)
          break
        case 'ArrowDown':
          if (inMenu) st.focusContent()
          else st.moveRow(1)
          break
        case 'Enter':
          if (inMenu) st.activateMenu()
          else if (item) {
            if (item.type === 'series') st.openDetails(item)
            else st.play(item, null, item.resumeAt ?? 0)
          }
          break
        case 'f':
        case 'F':
          if (item) {
            st.toggleFavorite(item).then((fav) =>
              toast(fav ? 'Adicionado aos favoritos' : 'Removido dos favoritos', {
                description: item.title,
              }),
            )
          }
          break
        case 's':
        case 'S':
          st.openSearch()
          break
        case 'd':
        case 'D':
          if (item) st.openDetails(item)
          break
        case 'g':
        case 'G': {
          // abre a grade "Ver tudo" da linha ativa (menu lateral de categorias incluso)
          const row = st.rows[st.activeRow]
          if (row && row.items.length > 0) st.openGrid(row)
          break
        }
        case 'e':
        case 'E':
          // guia multi-EPG; se o item ativo for um canal, foca esse canal
          st.openEpg(item?.type === 'live' ? item.id : undefined)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [overlay, player, grid, epg, pinRequest])

  return (
    <div
      className="relative flex h-dvh flex-col overflow-hidden"
      onPointerDown={() => {
        // clique fora do menu devolve o foco para o conteúdo
        if (useAurora.getState().focusZone === 'menu') useAurora.getState().focusContent()
      }}
    >
      <Background item={activeItem} />
      <StatusBar scanning={sectionLoading || !catalog} />

      {/* ------- MENU SUPERIOR (blades estilo Aurora) ------- */}
      <nav
        className="relative z-20 flex items-center gap-1.5 overflow-x-auto px-4 py-2.5 md:gap-2 md:px-10"
        aria-label="Categorias"
      >
        {SCREEN_ORDER.map((s, i) => {
          const isScreen = screen === s
          const isHot = focusZone === 'menu' && i === menuIdx
          return (
            <button
              key={s}
              onClick={(e) => {
                // evita que o botão fique com foco DOM e re-dispare clique no Enter (D-pad)
                e.currentTarget.blur()
                useAurora.getState().setScreen(s)
              }}
              onMouseEnter={() => {
                const st = useAurora.getState()
                if (st.focusZone === 'menu') st.moveMenu(SCREEN_ORDER.indexOf(s))
              }}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-all duration-300 md:px-4 md:text-[13px]',
                isScreen
                  ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/30'
                  : isHot
                    ? 'scale-105 bg-white/15 text-white ring-2 ring-emerald-300/80'
                    : 'glass text-white/50 hover:bg-white/10 hover:text-white',
              )}
            >
              {MENU_ICONS[s]}
              {MENU_LABELS[s]}
            </button>
          )
        })}
        <button
          onClick={() => useAurora.getState().openSearch()}
          className="glass ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/60 transition-all hover:bg-white/10 hover:text-white"
          aria-label="Buscar"
        >
          <Search size={14} />
        </button>
      </nav>

      {/* ------- TELA ATUAL ------- */}
      <main className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto aurora-scroll pb-1">
        {screen === 'home' && <HomeScreen />}
        {screen === 'movies' && <MoviesScreen />}
        {screen === 'series' && <SeriesScreen />}
        {screen === 'live' && <LiveScreen />}
        {screen === 'sports' && <SportsScreen />}
        {screen === 'favorites' && <LibraryScreen kind="favorites" />}
        {screen === 'continue' && <LibraryScreen kind="continue" />}
      </main>

      {/* ------- DICA DE BOTÕES (padrão console) ------- */}
      <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-0.5 px-6 pb-1.5 pt-1 text-[11px] text-white/40 md:px-14">
        <Hint keyName="◀ ▶" label="Navegar" />
        <Hint keyName="▲ ▼" label="Menu / Linhas" />
        <Hint keyName="Enter" label="Reproduzir" />
        <Hint keyName="F" label="Favorito" />
        <Hint keyName="S" label="Buscar" />
        <Hint keyName="D" label="Detalhes" />
        <Hint keyName="G" label="Grade" />
        <Hint keyName="E" label="Guia" />
        <span className="ml-auto hidden font-semibold tracking-wide text-white/25 md:block">
          AURORASTREAM · v1.4
        </span>
      </footer>

      {/* ------- OVERLAYS + GRADE + EPG + PLAYER + PIN ------- */}
      <AnimatePresence>
        {overlay?.kind === 'details' && <DetailsOverlay key="details" />}
        {overlay?.kind === 'search' && <SearchOverlay key="search" />}
        {overlay?.kind === 'settings' && <SettingsOverlay key="settings" />}
        {grid && <GridView key={`grid-${grid.title}`} />}
        {epg && <EpgOverlay key="epg" />}
        {pinRequest && <PinDialog key="pin" />}
      </AnimatePresence>
      {player && <Player />}
    </div>
  )
}

function Hint({ keyName, label }: { keyName: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <kbd className="rounded border border-white/15 bg-white/8 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white/70">
        {keyName}
      </kbd>
      {label}
    </span>
  )
}
