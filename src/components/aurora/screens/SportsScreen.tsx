'use client'

import { useMemo } from 'react'
import { CalendarClock } from 'lucide-react'
import { useAurora } from '@/lib/store'
import { HeroPanel } from '../HeroPanel'
import { FilterBar } from '../FilterBar'
import { FixturesStrip } from '../FixturesStrip'
import { RowsArea, useActiveItem } from './RowsArea'

/**
 * [v1.3] Mesma decisão das telas de catálogo: barra de filtro inativa
 * (busca global + categorias na grade cobrem a função). Mude para `true`
 * para reexibir a barra com chips de categoria na tela Futebol.
 */
const SHOW_FILTER_BAR = false

/** Tela Futebol: jogos do dia + canais esportivos + guia EPG */
export function SportsScreen() {
  const fixtures = useAurora((s) => s.fixtures)
  const catalog = useAurora((s) => s.catalog)
  const filter = useAurora((s) => s.filter)
  const setFilter = useAurora((s) => s.setFilter)
  const openEpg = useAurora((s) => s.openEpg)
  const activeItem = useActiveItem()

  const categories = useMemo(() => {
    if (!catalog) return []
    const set = new Set<string>()
    for (const i of catalog.sports) {
      const c = (i.category ?? '').trim()
      if (c) set.add(c)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [catalog])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-6 pt-4 md:px-14">
        <HeroPanel item={activeItem} fallbackLabel="Futebol" compact />
        {catalog && catalog.sports.length > 0 && (
          <div className="mb-1">
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
        {fixtures.length > 0 && catalog && <FixturesStrip fixtures={fixtures} />}
        {/* FilterBar inativo (v1.3) — ver comentário em SHOW_FILTER_BAR */}
        {SHOW_FILTER_BAR && <FilterBar value={filter} categories={categories} onChange={setFilter} />}
        <RowsArea emptyMessage="Nenhum canal de esportes encontrado." />
      </div>
    </div>
  )
}
