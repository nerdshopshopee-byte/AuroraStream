'use client'

import { useAurora } from '@/lib/store'
import { HeroPanel } from '../HeroPanel'
import { FixturesStrip } from '../FixturesStrip'
import { RowsArea, useActiveItem } from './RowsArea'

/** Tela Início: destaques + continuar + favoritos + canais, jogos do dia */
export function HomeScreen() {
  const fixtures = useAurora((s) => s.fixtures)
  const catalog = useAurora((s) => s.catalog)
  const activeItem = useActiveItem()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-6 pt-4 md:px-14">
        <HeroPanel item={activeItem} fallbackLabel="Início" />
      </div>
      <div className="mt-auto flex min-h-0 flex-col gap-3">
        {fixtures.length > 0 && catalog && <FixturesStrip fixtures={fixtures} />}
        <RowsArea emptyMessage="Nenhum conteúdo disponível." />
      </div>
    </div>
  )
}
