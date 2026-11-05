'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import { useAurora } from '@/lib/store'
import type { MediaItem } from '@/lib/types'
import { isAdultItem, hideAdultEnabled } from '@/lib/parental'
import { Poster } from './Poster'

/** Busca global com filtro de acento-insensível sobre todo o catálogo */
export function SearchOverlay() {
  const closeOverlay = useAurora((s) => s.closeOverlay)
  const openDetails = useAurora((s) => s.openDetails)
  const play = useAurora((s) => s.play)
  const catalog = useAurora((s) => s.catalog)
  const [q, setQ] = useState('')

  const norm = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

  const results = useMemo<MediaItem[]>(() => {
    if (!catalog || norm(q).length < 2) return []
    const nq = norm(q)
    // controle parental: oculta itens +18 quando a ocultação está ativa
    const hideAdult = hideAdultEnabled()
    const pool = [...catalog.movies, ...catalog.series, ...catalog.live, ...catalog.sports]
    const seen = new Set<string>()
    return pool
      .filter((i) => {
        const k = `${i.type}:${i.id}`
        if (seen.has(k)) return false
        if (hideAdult && isAdultItem(i)) return false
        seen.add(k)
        return norm(i.title).includes(nq) || norm(i.category ?? '').includes(nq)
      })
      .slice(0, 60)
  }, [catalog, q])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex flex-col bg-black/80 p-4 backdrop-blur-xl md:p-10"
      onClick={closeOverlay}
    >
      <motion.div
        initial={{ y: -18, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -12, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex w-full max-w-3xl flex-col"
      >
        <div className="glass-strong flex items-center gap-3 rounded-2xl px-4 py-3.5">
          <Search size={18} className="shrink-0 text-emerald-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar filmes, séries, canais…"
            className="h-9 w-full bg-transparent text-base text-white outline-none placeholder:text-white/30"
          />
          <button
            onClick={closeOverlay}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/8 text-white/60 hover:bg-white/15 hover:text-white"
            aria-label="Fechar busca"
          >
            <X size={16} />
          </button>
        </div>

        {q.length >= 2 && (
          <p className="mt-2 px-2 text-xs text-white/40">
            {results.length} resultado{results.length === 1 ? '' : 's'} para “{q}”
          </p>
        )}

        <div className="aurora-scroll mt-3 grid max-h-[65vh] grid-cols-3 gap-3 overflow-y-auto pr-1 sm:grid-cols-4 md:grid-cols-6">
          {results.map((item, idx) => (
            <button
              key={`${item.type ?? 'm'}-${item.id ?? idx}-${idx}`}
              onClick={() => {
                if (item.type === 'live') play(item)
                else openDetails(item)
              }}
              className="group overflow-hidden rounded-xl ring-1 ring-white/10 transition-all hover:scale-[1.04] hover:ring-emerald-400/50"
            >
              <Poster item={item} className="aspect-[2/3] w-full" iconSize={22} />
              <div className="glass-strong px-1.5 py-1.5 text-left">
                <p className="truncate text-[11px] font-semibold text-white/85">{item.title}</p>
                <p className="truncate text-[10px] text-white/40">
                  {item.type === 'live' ? 'Canal' : item.type === 'series' ? 'Série' : 'Filme'}
                  {item.category ? ` · ${item.category}` : ''}
                </p>
              </div>
            </button>
          ))}
          {q.length >= 2 && results.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-white/45">
              Nada encontrado. Tente outro termo.
            </p>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
