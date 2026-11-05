'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import type { ContentFilter } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Filtro por título e por tema/categoria (chips) com busca debouncada —
 * alimenta o store que reconstrói as linhas da tela.
 */
export function FilterBar({
  value,
  categories,
  onChange,
}: {
  value: ContentFilter
  categories: string[]
  onChange: (patch: Partial<ContentFilter>) => void
}) {
  const [draft, setDraft] = useState(value.q)
  const [syncedQ, setSyncedQ] = useState(value.q)

  // sincroniza quando o filtro é resetado externamente (troca de tela / limpar)
  // — padrão React de "ajustar estado durante o render"
  if (syncedQ !== value.q) {
    setSyncedQ(value.q)
    setDraft(value.q)
  }

  // debounce da busca
  useEffect(() => {
    if (draft === value.q) return
    const t = setTimeout(() => onChange({ q: draft }), 220)
    return () => clearTimeout(t)
  }, [draft])

  const chips = useMemo(() => categories.slice(0, 28), [categories])
  const active = value.cat != null || value.q.trim().length > 0

  return (
    <div className="flex items-center gap-2.5 px-6 md:px-14">
      {/* busca por título */}
      <div className="glass flex h-9 w-44 shrink-0 items-center gap-2 rounded-xl px-3 transition-all focus-within:ring-1 focus-within:ring-emerald-400/50 md:w-60">
        <Search size={14} className="shrink-0 text-emerald-400" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Filtrar por título…"
          className="h-full w-full min-w-0 bg-transparent text-xs text-white outline-none placeholder:text-white/30"
          aria-label="Filtrar por título"
        />
        {draft && (
          <button
            onClick={() => setDraft('')}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20"
            aria-label="Limpar busca"
          >
            <X size={11} />
          </button>
        )}
      </div>

      {/* chips de tema/categoria */}
      <div className="carousel-strip flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5">
        {chips.length > 0 && (
          <>
            <Chip
              label="Todos"
              active={value.cat == null}
              onClick={() => onChange({ cat: null })}
            />
            {chips.map((c) => (
              <Chip
                key={c}
                label={c}
                active={value.cat === c}
                onClick={() => onChange({ cat: value.cat === c ? null : c })}
              />
            ))}
          </>
        )}
        {active && (
          <button
            onClick={() => {
              setDraft('')
              onChange({ q: '', cat: null })
            }}
            className="ml-1 flex shrink-0 items-center gap-1 rounded-full bg-red-500/15 px-3 py-1.5 text-[11px] font-semibold text-red-300 ring-1 ring-red-400/30 transition-all hover:bg-red-500/25"
          >
            <X size={11} /> Limpar
          </button>
        )}
      </div>

      <SlidersHorizontal size={14} className="hidden shrink-0 text-white/25 md:block" />
    </div>
  )
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all active:scale-95',
        active
          ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/25'
          : 'glass text-white/55 hover:bg-white/12 hover:text-white',
      )}
    >
      {label}
    </button>
  )
}
