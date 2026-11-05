'use client'

import { useAurora } from '@/lib/store'
import type { MediaItem } from '@/lib/types'
import { ContentRow } from '../ContentRow'
import { cn } from '@/lib/utils'

/** Item atualmente sob o cursor/navitação (linha ativa + índice) */
export function useActiveItem(): MediaItem | null {
  const rows = useAurora((s) => s.rows)
  const activeRow = useAurora((s) => s.activeRow)
  const selectedByRow = useAurora((s) => s.selectedByRow)
  return rows[activeRow]?.items?.[selectedByRow[activeRow] ?? 0] ?? null
}

/** Renderiza as linhas da tela atual + estado vazio quando necessário */
export function RowsArea({ emptyMessage }: { emptyMessage: string }) {
  const rows = useAurora((s) => s.rows)
  const activeRow = useAurora((s) => s.activeRow)
  const selectedByRow = useAurora((s) => s.selectedByRow)
  const select = useAurora((s) => s.select)
  const play = useAurora((s) => s.play)
  const openGrid = useAurora((s) => s.openGrid)

  if (rows.length === 0) {
    return (
      <div className="flex min-h-40 items-center justify-center px-6 pb-4">
        <div className="glass rounded-2xl px-8 py-6 text-center text-sm text-white/55">
          {emptyMessage}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('space-y-3 pb-1.5 md:space-y-4')}>
      {rows.map((row, i) => (
        <ContentRow
          key={row.id}
          row={row}
          rowIndex={i}
          selectedIdx={selectedByRow[i] ?? 0}
          active={i === activeRow}
          onSelect={select}
          onPlay={play}
          onOpenGrid={openGrid}
        />
      ))}
    </div>
  )
}
