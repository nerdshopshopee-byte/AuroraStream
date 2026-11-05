'use client'

import { useAurora } from '@/lib/store'
import { HeroPanel } from '../HeroPanel'
import { RowsArea, useActiveItem } from './RowsArea'

/**
 * Telas de biblioteca pessoal: Favoritos (dividido em filmes/séries/canais)
 * e Continuar (filmes em andamento + episódios com rótulo T#:E#).
 */
export function LibraryScreen({ kind }: { kind: 'favorites' | 'continue' }) {
  const favorites = useAurora((s) => s.favorites)
  const progress = useAurora((s) => s.progress)
  const activeItem = useActiveItem()

  const empty =
    kind === 'favorites'
      ? 'Nenhum favorito ainda — selecione um título e pressione F.'
      : 'Nada para continuar — comece a assistir algo e ele aparecerá aqui.'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-6 pt-4 md:px-14">
        <HeroPanel
          item={activeItem}
          fallbackLabel={kind === 'favorites' ? 'Favoritos' : 'Continuar'}
          compact
        />
      </div>
      <div className="mt-auto flex min-h-0 flex-col gap-2.5">
        {kind === 'continue' && progress.length > 0 && (
          <p className="px-6 text-[11px] text-white/35 md:px-14">
            {progress.length} registro{progress.length === 1 ? '' : 's'} de progresso salvos no
            perfil · {favorites.length} favorito{favorites.length === 1 ? '' : 's'}
          </p>
        )}
        <RowsArea emptyMessage={empty} />
      </div>
    </div>
  )
}
