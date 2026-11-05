'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, LayoutGrid, Play, Search, Star, X } from 'lucide-react'
import { useAurora } from '@/lib/store'
import type { MediaItem } from '@/lib/types'
import { Poster } from './Poster'
import { cn } from '@/lib/utils'

const PAGE = 120 // renderização incremental (catálogos grandes de Xtream)

const norm = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/**
 * Página em grade ("Ver tudo") — abre por cima do dashboard mantendo o tema:
 * - menu lateral com as categorias disponíveis (com contagem) p/ filtrar;
 * - a imagem sob o cursor SALTA (scale + lift + anel esmeralda + sombra);
 * - barra de informações ao fundo com sinopse/metadados do item ativo;
 * - busca por título, teclado (D-pad), renderização incremental.
 */
export function GridView() {
  const grid = useAurora((s) => s.grid)
  const closeGrid = useAurora((s) => s.closeGrid)
  const play = useAurora((s) => s.play)
  const openDetails = useAurora((s) => s.openDetails)

  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  const [kbdIdx, setKbdIdx] = useState(0)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE)
  const [cols, setCols] = useState(4)
  const [prevQ, setPrevQ] = useState(q)
  const [prevCat, setPrevCat] = useState(cat)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const gridElRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])
  const sentinelRef = useRef<HTMLDivElement>(null)

  const items = grid?.items ?? []
  const wide = grid?.wide === true

  // ao trocar busca/categoria, reinicia seleção/scroll durante o próprio render
  if (prevQ !== q || prevCat !== cat) {
    setPrevQ(q)
    setPrevCat(cat)
    setKbdIdx(0)
    setHoverIdx(null)
    setVisibleCount(PAGE)
  }

  const filtered = useMemo(() => {
    const n = norm(q.trim())
    return items.filter((i) => {
      if (cat && (i.category ?? '') !== cat) return false
      if (n.length >= 2 && !norm(i.title).includes(n) && !norm(i.category ?? '').includes(n))
        return false
      return true
    })
  }, [items, q, cat])

  // categorias derivadas dos itens (com contagem)
  const categories = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of items) {
      const c = (i.category ?? '').trim()
      if (c) m.set(c, (m.get(c) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
  }, [items])

  const selIdx = Math.min(hoverIdx ?? kbdIdx, Math.max(0, filtered.length - 1))
  const activeItem: MediaItem | null = filtered[selIdx] ?? null

  // ---- colunas da grade (para ↑ ↓ do D-pad) ----
  useEffect(() => {
    const el = gridElRef.current
    if (!el) return
    const measure = () => {
      const n = getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length
      if (n > 0) setCols(n)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [grid, wide, cat, q])

  // ---- renderização incremental: sentinel carrega mais ao rolar ----
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((v) => (v < filtered.length ? v + PAGE : v))
        }
      },
      { root: scrollRef.current, rootMargin: '600px' },
    )
    io.observe(sentinel)
    return () => io.disconnect()
  }, [filtered.length, visibleCount])

  // ---- teclado (D-pad de TV Box) ----
  const activate = useCallback(
    (item: MediaItem) => {
      if (item.type === 'series') {
        // fecha a grade antes: o overlay de detalhes fica na camada z-40
        closeGrid()
        openDetails(item)
      } else play(item, null, item.resumeAt ?? 0)
    },
    [closeGrid, openDetails, play],
  )

  useEffect(() => {
    if (!grid) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT') {
        if (e.key === 'Escape') closeGrid()
        return
      }
      const len = filtered.length
      const clamp = (v: number) => Math.max(0, Math.min(v, len - 1))
      switch (e.key) {
        case 'Escape':
        case 'Backspace':
          e.preventDefault()
          closeGrid()
          break
        case 'ArrowLeft':
          e.preventDefault()
          setHoverIdx(null)
          setKbdIdx((v) => clamp(v - 1))
          break
        case 'ArrowRight':
          e.preventDefault()
          setHoverIdx(null)
          setKbdIdx((v) => clamp(v + 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setHoverIdx(null)
          setKbdIdx((v) => clamp(v - cols))
          break
        case 'ArrowDown':
          e.preventDefault()
          setHoverIdx(null)
          setKbdIdx((v) => clamp(v + cols))
          break
        case 'Home':
          e.preventDefault()
          setKbdIdx(0)
          break
        case 'End':
          e.preventDefault()
          setKbdIdx(len - 1)
          break
        case 'Enter': {
          const item = filtered[hoverIdx ?? kbdIdx]
          if (item) activate(item)
          break
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [grid, filtered, cols, kbdIdx, hoverIdx, activate, closeGrid])

  // ---- mantém o card navegado visível ----
  useEffect(() => {
    if (hoverIdx != null) return
    cardRefs.current[kbdIdx]?.scrollIntoView({ block: 'nearest' })
  }, [kbdIdx, cols, hoverIdx])

  const pickCat = (c: string | null) => {
    setCat(c)
    setSidebarOpen(false)
  }

  const cardCls = (selected: boolean) =>
    cn(
      'group/card relative cursor-pointer rounded-xl outline-none',
      'transition-all duration-300 ease-out will-change-transform',
      'hover:z-10 hover:scale-110 hover:-translate-y-2 hover:opacity-100',
      selected && 'z-10 scale-110 -translate-y-2 opacity-100',
    )

  const ringCls = (selected: boolean) =>
    cn(
      'block h-full w-full overflow-hidden rounded-xl transition-all duration-300',
      selected
        ? 'shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] ring-2 ring-emerald-400'
        : 'ring-1 ring-white/10 group-hover/card:ring-emerald-300/70',
    )

  if (!grid) return null

  const shown = filtered.slice(0, visibleCount)

  const sidebar = (
    <div className="flex h-full flex-col">
      <p className="px-4 pb-2 pt-3 text-[10px] font-black uppercase tracking-[0.25em] text-white/35">
        Categorias
      </p>
      <div className="aurora-scroll min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        <button
          onClick={() => pickCat(null)}
          className={cn(
            'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold transition-all',
            cat == null
              ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/40'
              : 'text-white/55 hover:bg-white/8 hover:text-white',
          )}
        >
          <span className="flex items-center gap-2">
            <LayoutGrid size={13} /> Todas
          </span>
          <span className="text-[10px] font-semibold text-white/35">{items.length}</span>
        </button>
        {categories.map(([c, n]) => (
          <button
            key={c}
            onClick={() => pickCat(c)}
            className={cn(
              'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold transition-all',
              cat === c
                ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/40'
                : 'text-white/55 hover:bg-white/8 hover:text-white',
            )}
          >
            <span className="min-w-0 truncate">{c}</span>
            <span className="shrink-0 text-[10px] font-semibold text-white/35">{n}</span>
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.985 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="fixed inset-0 z-[45] flex flex-col bg-[#05070b]/88 backdrop-blur-2xl"
      role="dialog"
      aria-label={grid.title}
    >
      {/* brilho aurora de fundo */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[70vw] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[120px]" />

      {/* ---------- cabeçalho ---------- */}
      <header className="relative z-10 flex shrink-0 items-center gap-3 px-4 pb-3 pt-4 md:px-6">
        <button
          onClick={closeGrid}
          className="glass flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/75 transition-all duration-300 hover:scale-110 hover:bg-white/15 hover:text-white active:scale-95"
          aria-label="Voltar"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-black uppercase tracking-[0.25em] text-white">
            {grid.title}
          </h2>
          <p className="mt-0.5 text-[11px] font-semibold text-white/40">
            {filtered.length === items.length
              ? `${items.length} títulos`
              : `${filtered.length} de ${items.length} títulos`}
            <span className="ml-2 hidden text-white/30 lg:inline">
              · passe o mouse para ampliar · Enter reproduz · Esc volta
            </span>
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* toggle da sidebar (mobile) */}
          {categories.length > 0 && (
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className={cn(
                'glass flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[11px] font-bold uppercase tracking-wider text-white/65 transition-all hover:bg-white/15 hover:text-white lg:hidden',
                sidebarOpen && 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40',
              )}
              aria-label="Categorias"
            >
              <LayoutGrid size={13} />
              Categorias
            </button>
          )}
          <div className="glass flex h-9 items-center gap-2 rounded-full px-3.5">
            <Search size={14} className="shrink-0 text-white/45" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filtrar nesta lista…"
              autoComplete="off"
              className="w-28 bg-transparent text-xs font-semibold text-white placeholder:text-white/30 focus:outline-none md:w-52"
            />
            {q && (
              <button
                onClick={() => setQ('')}
                className="text-white/40 transition-colors hover:text-white"
                aria-label="Limpar filtro"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <button
            onClick={closeGrid}
            className="glass hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/60 transition-all duration-300 hover:scale-110 hover:bg-white/15 hover:text-white md:flex"
            aria-label="Fechar grade"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {/* ---------- corpo: sidebar + grade ---------- */}
      <div className="relative z-10 flex min-h-0 flex-1">
        {/* sidebar desktop */}
        {categories.length > 0 && (
          <aside
            className="hidden w-56 shrink-0 border-r border-white/8 bg-white/[0.025] backdrop-blur-sm lg:block"
            aria-label="Categorias"
          >
            {sidebar}
          </aside>
        )}

        {/* drawer mobile */}
        <AnimatePresence>
          {categories.length > 0 && sidebarOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSidebarOpen(false)}
                className="absolute inset-0 z-10 bg-black/50 backdrop-blur-sm lg:hidden"
              />
              <motion.aside
                initial={{ x: -280 }}
                animate={{ x: 0 }}
                exit={{ x: -280 }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                className="glass-strong absolute inset-y-0 left-0 z-20 w-64 rounded-r-2xl lg:hidden"
                aria-label="Categorias"
              >
                {sidebar}
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* grade */}
        <div
          ref={scrollRef}
          className="aurora-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-44 pt-2 md:px-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeGrid()
          }}
        >
          {filtered.length === 0 ? (
            <div className="mt-16 flex justify-center">
              <div className="glass rounded-2xl px-8 py-6 text-center text-sm text-white/55">
                Nada encontrado{q ? ` para “${q}”` : ''}
                {cat ? ` em “${cat}”` : ''}.
              </div>
            </div>
          ) : (
            <div
              ref={gridElRef}
              role="listbox"
              aria-label={grid.title}
              className={cn(
                'grid gap-3 md:gap-4',
                wide
                  ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4'
                  : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8',
              )}
            >
              {shown.map((item, idx) => {
                const selected = idx === selIdx
                const resumePct =
                  item.resumeAt && item.durationSec && item.durationSec > 0
                    ? Math.min(100, (item.resumeAt / item.durationSec) * 100)
                    : 0
                return (
                  <motion.button
                    key={`${item.type ?? 'm'}-${item.id ?? 'x'}-${idx}`}
                    ref={(el) => {
                      cardRefs.current[idx] = el
                    }}
                    role="option"
                    aria-selected={selected}
                    whileTap={{ scale: 0.95 }}
                    onMouseEnter={() => {
                      setHoverIdx(idx)
                      setKbdIdx(idx)
                    }}
                    onMouseLeave={() => setHoverIdx(null)}
                    onFocus={() => setKbdIdx(idx)}
                    onClick={() => activate(item)}
                    className={cardCls(selected)}
                    style={{ aspectRatio: wide ? '16 / 9' : '2 / 3' }}
                  >
                    <span className={ringCls(selected)}>
                      <Poster item={item} className="h-full w-full rounded-xl" iconSize={30} />
                    </span>

                    {item.type === 'live' && (
                      <span className="absolute left-2 top-2 rounded bg-red-600/90 px-1.5 py-0.5 text-[9px] font-black tracking-widest text-white">
                        AO VIVO
                      </span>
                    )}
                    {item.epLabel && (
                      <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-emerald-300 backdrop-blur">
                        {item.epLabel}
                      </span>
                    )}
                    {/* "NOVO" para itens adicionados há menos de 7 dias */}
                    {item.addedAt != null && Date.now() - item.addedAt < 7 * 86_400_000 && (
                      <span className="absolute right-2 top-2 rounded bg-emerald-500/90 px-1.5 py-0.5 text-[9px] font-black tracking-widest text-black">
                        NOVO
                      </span>
                    )}
                    {resumePct > 0 && (
                      <span className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-white/20">
                        <span
                          className="block h-full rounded-full bg-emerald-400"
                          style={{ width: `${resumePct}%` }}
                        />
                      </span>
                    )}

                    {/* legenda que surge no hover (a imagem salta) */}
                    <span
                      className={cn(
                        'pointer-events-none absolute inset-x-0 -bottom-1 mx-auto w-[92%] truncate rounded-lg bg-black/75 px-2 py-1 text-center text-[10px] font-bold text-white/90 backdrop-blur transition-all duration-300',
                        selected ? 'translate-y-5 opacity-100' : 'translate-y-3 opacity-0',
                      )}
                    >
                      {item.title}
                    </span>
                  </motion.button>
                )
              })}
            </div>
          )}

          {/* sentinela de scroll infinito */}
          {visibleCount < filtered.length && (
            <div ref={sentinelRef} className="flex justify-center py-8">
              <span className="text-[11px] font-bold uppercase tracking-widest text-white/30">
                Carregando mais…
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ---------- barra de informações ao fundo ---------- */}
      <AnimatePresence mode="wait">
        {activeItem && (
          <motion.div
            key={`${activeItem.type}-${activeItem.id}-${selIdx}`}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="glass-strong absolute inset-x-6 bottom-4 z-20 flex items-center gap-4 rounded-2xl p-3.5 md:inset-x-14 md:p-4"
          >
            <div className="hidden h-20 w-14 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/15 sm:block md:h-24 md:w-16">
              <Poster item={activeItem} className="h-full w-full" iconSize={22} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-black tracking-wide text-white md:text-base">
                {activeItem.title}
              </h3>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] font-semibold text-white/45">
                {activeItem.year && <span>{activeItem.year}</span>}
                {activeItem.category && (
                  <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    {activeItem.category}
                  </span>
                )}
                {activeItem.rating != null && activeItem.rating > 0 && (
                  <span className="flex items-center gap-1 text-amber-300">
                    <Star size={11} fill="currentColor" /> {activeItem.rating.toFixed(1)}
                  </span>
                )}
                {activeItem.durationSec != null && activeItem.durationSec > 0 && (
                  <span>{Math.floor(activeItem.durationSec / 60)} min</span>
                )}
                {activeItem.addedAt != null && (
                  <span className="text-white/30">
                    · adicionado{' '}
                    {new Date(activeItem.addedAt).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </span>
                )}
              </p>
              {activeItem.plot && (
                <p className="mt-1 line-clamp-2 max-w-3xl text-[11px] leading-relaxed text-white/50">
                  {activeItem.plot}
                </p>
              )}
            </div>
            <button
              onClick={() => activate(activeItem)}
              className="hidden shrink-0 items-center gap-2 rounded-full bg-emerald-500 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-black shadow-lg shadow-emerald-500/30 transition-all duration-300 hover:scale-105 hover:bg-emerald-400 active:scale-95 md:flex"
            >
              <Play size={14} fill="currentColor" />
              {activeItem.type === 'series' ? 'Episódios' : activeItem.resumeAt ? 'Continuar' : 'Assistir'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
