'use client'

import { useMemo } from 'react'
import { CalendarClock, LayoutGrid } from 'lucide-react'
import { useAurora } from '@/lib/store'
import { HeroPanel } from '../HeroPanel'
import { FilterBar } from '../FilterBar'
import { RowsArea, useActiveItem } from './RowsArea'

/**
 * [v1.3] Barras de filtro (busca + chips de categoria) DESATIVADAS nas telas
 * de catálogo — poluíam a navegação principal e suas funções já existem em
 * menus dedicados:
 *   • Busca por título → Busca global (menu superior, tecla S)
 *   • Chips de categoria → menu lateral de CATEGORIAS na grade "Ver tudo"
 * Para reativar as barras, basta mudar a flag abaixo para `true`.
 * (FilterBar.tsx permanece intacto no projeto.)
 */
const SHOW_FILTER_BAR = false

const CONFIG: Record<'movies' | 'series' | 'live', { title: string; empty: string }> = {
  movies: { title: 'Filmes', empty: 'Nenhum filme encontrado com esse filtro.' },
  series: { title: 'Séries', empty: 'Nenhuma série encontrada com esse filtro.' },
  live: { title: 'Canais ao Vivo', empty: 'Nenhum canal encontrado com esse filtro.' },
}

/**
 * Telas dedicadas de catálogo (Filmes / Séries / Canais):
 * painel de informações ao fundo + filtro por título/tema + sliders.
 * Em Canais: atalhos para a grade completa (channels-view) e o multi-EPG.
 */
export function CatalogScreen({ kind }: { kind: 'movies' | 'series' | 'live' }) {
  const filter = useAurora((s) => s.filter)
  const setFilter = useAurora((s) => s.setFilter)
  const catalog = useAurora((s) => s.catalog)
  const rows = useAurora((s) => s.rows)
  const openGrid = useAurora((s) => s.openGrid)
  const openEpg = useAurora((s) => s.openEpg)
  const activeItem = useActiveItem()
  const cfg = CONFIG[kind]

  const categories = useMemo(() => {
    if (!catalog) return []
    const pool = kind === 'live' ? catalog.live : catalog[kind]
    const set = new Set<string>()
    for (const i of pool) {
      const c = (i.category ?? '').trim()
      if (c) set.add(c)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [catalog, kind])

  const allChannelsRow = useMemo(() => rows.find((r) => r.id === 'live-all'), [rows])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-6 pt-4 md:px-14">
        <HeroPanel item={activeItem} fallbackLabel={cfg.title} compact />
        {kind === 'live' && (allChannelsRow ?? catalog?.live?.length) && (
          <div className="mb-1 flex flex-wrap gap-2">
            <button
              onClick={() => allChannelsRow && openGrid(allChannelsRow)}
              disabled={!allChannelsRow}
              className="glass flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[11px] font-bold uppercase tracking-wider text-white/65 transition-all hover:scale-105 hover:bg-white/15 hover:text-white active:scale-95 disabled:opacity-40"
            >
              <LayoutGrid size={12} className="text-emerald-300/80" />
              Grade de canais
              {catalog?.live?.length ? (
                <span className="rounded-full bg-emerald-400/15 px-1.5 text-[9px] font-black text-emerald-300">
                  {catalog.live.length}
                </span>
              ) : null}
            </button>
            <button
              onClick={() => openEpg()}
              className="glass flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[11px] font-bold uppercase tracking-wider text-white/65 transition-all hover:scale-105 hover:bg-white/15 hover:text-white active:scale-95"
            >
              <CalendarClock size={12} className="text-emerald-300/80" />
              Guia EPG
            </button>
          </div>
        )}
      </div>
      <div className="mt-auto flex min-h-0 flex-col gap-2.5">
        {/* FilterBar inativo (v1.3) — ver comentário em SHOW_FILTER_BAR */}
        {SHOW_FILTER_BAR && <FilterBar value={filter} categories={categories} onChange={setFilter} />}
        <RowsArea emptyMessage={cfg.empty} />
      </div>
    </div>
  )
}

export function MoviesScreen() {
  return <CatalogScreen kind="movies" />
}
export function SeriesScreen() {
  return <CatalogScreen kind="series" />
}
export function LiveScreen() {
  return <CatalogScreen kind="live" />
}
