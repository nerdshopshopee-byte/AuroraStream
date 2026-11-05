'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Clock, Radio, Search, Tv, X } from 'lucide-react'
import { useAurora } from '@/lib/store'
import type { EpgProgram, MediaItem } from '@/lib/types'
import { loadEpgPrograms } from '@/lib/client'
import { Poster } from './Poster'
import { cn } from '@/lib/utils'

const HOUR_W = 200 // px por hora na timeline
const WINDOW_BEFORE_H = 1 // janela: 1h no passado
const WINDOW_AFTER_H = 7 // 7h no futuro
const MAX_FETCH = 40 // canais consultados por vez (proteção p/ Xtream grande)

const norm = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const hhmm = (ms: number) =>
  new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/**
 * Multi-EPG — guia de programação de canais ao vivo:
 * - coluna de canais à esquerda (sticky) + timeline horizontal com blocos;
 * - linha "agora" destacada, programa atual com anel esmeralda;
 * - clique no programa sintoniza o canal; busca de canais integrada.
 */
export function EpgOverlay() {
  const epg = useAurora((s) => s.epg)
  const closeEpg = useAurora((s) => s.closeEpg)
  const catalog = useAurora((s) => s.catalog)
  const play = useAurora((s) => s.play)

  const [q, setQ] = useState('')
  const [programs, setPrograms] = useState<Record<string, EpgProgram[]>>({})
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())

  const scrollRef = useRef<HTMLDivElement>(null)
  const channels = useMemo(() => catalog?.live ?? [], [catalog])

  const filtered = useMemo(() => {
    const n = norm(q.trim())
    if (n.length < 2) return channels
    return channels.filter((c) => norm(c.title).includes(n) || norm(c.category ?? '').includes(n))
  }, [channels, q])

  // janela de tempo da timeline
  const windowStart = useMemo(() => {
    const h = new Date()
    h.setMinutes(0, 0, 0)
    return h.getTime() - WINDOW_BEFORE_H * 3600_000
  }, [])
  const windowEnd = windowStart + (WINDOW_BEFORE_H + WINDOW_AFTER_H) * 3600_000

  // relojo: atualiza a linha "agora" a cada 30s
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  // carrega EPG dos canais (demo: sintético instantâneo; Xtream: até MAX_FETCH)
  useEffect(() => {
    if (!epg) return
    let alive = true
    const targets = filtered.slice(0, MAX_FETCH)
    ;(async () => {
      setLoading(true)
      const entries = await Promise.all(
        targets.map(async (c) => {
          try {
            return [c.id, await loadEpgPrograms(c)] as const
          } catch {
            return [c.id, [] as EpgProgram[]] as const
          }
        }),
      )
      if (!alive) return
      setPrograms((prev) => ({ ...prev, ...Object.fromEntries(entries) }))
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [epg, q, channels])

  // scroll inicial: "agora" a ~12% da esquerda + canal em foco visível
  useEffect(() => {
    if (!epg || !scrollRef.current) return
    const el = scrollRef.current
    const nowX = ((Date.now() - windowStart) / 3600_000) * HOUR_W
    requestAnimationFrame(() => {
      el.scrollLeft = Math.max(0, nowX - el.clientWidth * 0.12)
      const focusIdx = filtered.findIndex((c) => c.id === epg.focusChannelId)
      const row = el.querySelector<HTMLElement>(`[data-ch="${epg.focusChannelId}"]`)
      if (row) {
        el.scrollTop = Math.max(0, row.offsetTop - el.clientHeight * 0.35)
      } else if (focusIdx > 0) {
        el.scrollTop = focusIdx * 72
      }
    })
  }, [epg, loading, filtered, windowStart])

  // Esc fecha; ← → rolam a timeline
  useEffect(() => {
    if (!epg) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT') {
        if (e.key === 'Escape') closeEpg()
        return
      }
      if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault()
        closeEpg()
      } else if (e.key === 'ArrowRight') {
        scrollRef.current?.scrollBy({ left: HOUR_W, behavior: 'smooth' })
      } else if (e.key === 'ArrowLeft') {
        scrollRef.current?.scrollBy({ left: -HOUR_W, behavior: 'smooth' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [epg, closeEpg])

  const playProgram = (channel: MediaItem) => play(channel, null, 0)

  const nowX = ((now - windowStart) / 3600_000) * HOUR_W

  // rótulos de hora no topo
  const hourMarks: number[] = []
  for (let t = windowStart; t <= windowEnd; t += 3600_000) hourMarks.push(t)

  const sidebar = (
    <div className="flex h-full flex-col">
      <p className="px-4 pb-2 pt-3 text-[10px] font-black uppercase tracking-[0.25em] text-white/35">
        Canais ({filtered.length})
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto aurora-scroll px-2 pb-3">
        {filtered.slice(0, 80).map((c) => {
          const isFocus = epg?.focusChannelId === c.id
          return (
            <button
              key={c.id}
              onClick={() => playProgram(c)}
              data-ch={c.id}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all',
                isFocus
                  ? 'bg-emerald-500/15 ring-1 ring-emerald-400/40'
                  : 'hover:bg-white/8',
              )}
              title={`Assistir ${c.title}`}
            >
              <span className="h-9 w-9 shrink-0 overflow-hidden rounded-md ring-1 ring-white/10">
                <Poster item={c} className="h-full w-full" iconSize={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-white/85">{c.title}</span>
                <span className="block truncate text-[10px] font-semibold text-white/35">
                  {c.category ?? 'Ao vivo'}
                </span>
              </span>
            </button>
          )
        })}
        {filtered.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-white/40">Nenhum canal.</p>
        )}
      </div>
    </div>
  )

  if (!epg) return null

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.985 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="fixed inset-0 z-[45] flex flex-col bg-[#05070b]/90 backdrop-blur-2xl"
      role="dialog"
      aria-label="Guia de programação"
    >
      <div className="pointer-events-none absolute -top-40 left-1/3 h-96 w-[60vw] rounded-full bg-emerald-500/10 blur-[120px]" />

      {/* ---------- cabeçalho ---------- */}
      <header className="relative z-10 flex shrink-0 items-center gap-3 px-4 pb-3 pt-4 md:px-6">
        <button
          onClick={closeEpg}
          className="glass flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/75 transition-all duration-300 hover:scale-110 hover:bg-white/15 hover:text-white active:scale-95"
          aria-label="Voltar"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-black uppercase tracking-[0.25em] text-white">
            Guia de Programação
          </h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-white/40">
            <Clock size={11} /> Agora {hhmm(now)} · ← → rolam a linha do tempo · Esc volta
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="glass flex h-9 items-center gap-2 rounded-full px-3.5">
            <Search size={14} className="shrink-0 text-white/45" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar canal…"
              autoComplete="off"
              className="w-28 bg-transparent text-xs font-semibold text-white placeholder:text-white/30 focus:outline-none md:w-48"
            />
            {q && (
              <button
                onClick={() => setQ('')}
                className="text-white/40 transition-colors hover:text-white"
                aria-label="Limpar busca"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <button
            onClick={closeEpg}
            className="glass hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/60 transition-all duration-300 hover:scale-110 hover:bg-white/15 hover:text-white md:flex"
            aria-label="Fechar guia"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {/* ---------- corpo: canais + timeline ---------- */}
      <div className="relative z-10 flex min-h-0 flex-1">
        <aside
          className="hidden w-56 shrink-0 border-r border-white/8 bg-white/[0.025] backdrop-blur-sm md:block"
          aria-label="Canais"
        >
          {sidebar}
        </aside>

        <div
          ref={scrollRef}
          className="aurora-scroll relative min-h-0 flex-1 overflow-auto"
        >
          <div
            className="relative"
            style={{
              width: `calc(${(WINDOW_BEFORE_H + WINDOW_AFTER_H) * HOUR_W}px + 11rem)`,
              minHeight: '100%',
            }}
          >
            {/* linha de horas (sticky no topo) */}
            <div className="sticky top-0 z-20 flex bg-[#0a0e14]">
              <div className="sticky left-0 z-30 flex h-10 w-44 shrink-0 items-center gap-1.5 border-r border-white/8 bg-[#0a0e14] px-3 text-[10px] font-black uppercase tracking-widest text-white/40">
                <Tv size={12} /> Canal
              </div>
              <div className="relative h-10 flex-1">
                {hourMarks.map((t) => (
                  <span
                    key={t}
                    className="absolute top-0 flex h-10 items-center text-[11px] font-bold text-white/45"
                    style={{ left: ((t - windowStart) / 3600_000) * HOUR_W + 8 }}
                  >
                    {new Date(t).getHours().toString().padStart(2, '0')}:00
                  </span>
                ))}
              </div>
            </div>

            {/* linhas de canais */}
            {filtered.slice(0, 80).map((c) => {
              const list = programs[c.id]
              const isFocus = epg.focusChannelId === c.id
              return (
                <div
                  key={c.id}
                  data-ch={c.id}
                  className={cn(
                    'flex border-b border-white/5',
                    isFocus && 'bg-emerald-500/[0.06]',
                  )}
                  style={{ height: 72 }}
                >
                  {/* nome do canal (sticky à esquerda) */}
                  <button
                    onClick={() => playProgram(c)}
                    className="sticky left-0 z-20 flex h-full w-44 shrink-0 items-center gap-2 border-r border-white/8 bg-[#0a0e14] px-3 text-left transition-colors hover:bg-white/10"
                    title={`Assistir ${c.title}`}
                  >
                    <span className="h-10 w-10 shrink-0 overflow-hidden rounded-md ring-1 ring-white/10">
                      <Poster item={c} className="h-full w-full" iconSize={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-bold text-white/85">
                        {c.title}
                      </span>
                      <span className="block truncate text-[9px] font-semibold text-white/35">
                        {c.category ?? 'Ao vivo'}
                      </span>
                    </span>
                  </button>

                  {/* blocos de programas */}
                  <div className="relative h-full flex-1">
                    {list ? (
                      list
                        .filter((p) => p.end > windowStart && p.start < windowEnd)
                        .map((p) => {
                          const left = ((Math.max(p.start, windowStart) - windowStart) / 3600_000) * HOUR_W
                          const width =
                            ((Math.min(p.end, windowEnd) - Math.max(p.start, windowStart)) / 3600_000) *
                            HOUR_W
                          const live = now >= p.start && now < p.end
                          const past = p.end <= now
                          return (
                            <button
                              key={p.id}
                              onClick={() => playProgram(c)}
                              title={`${p.title} · ${hhmm(p.start)}–${hhmm(p.end)}`}
                              className={cn(
                                'absolute inset-y-1.5 overflow-hidden rounded-lg px-2.5 py-1 text-left transition-all',
                                'ring-1',
                                live
                                  ? 'z-10 bg-emerald-500/20 ring-emerald-400 hover:bg-emerald-500/30'
                                  : past
                                    ? 'bg-white/[0.03] ring-white/5 opacity-45 hover:opacity-70'
                                    : 'bg-white/[0.06] ring-white/10 hover:bg-white/12 hover:ring-white/25',
                              )}
                              style={{ left, width: Math.max(40, width - 4) }}
                            >
                              {live && (
                                <span className="mb-0.5 flex items-center gap-1 text-[8px] font-black tracking-widest text-emerald-300">
                                  <Radio size={8} /> AGORA
                                </span>
                              )}
                              <span
                                className={cn(
                                  'block truncate text-[11px] font-bold',
                                  live ? 'text-emerald-200' : 'text-white/80',
                                )}
                              >
                                {p.title}
                              </span>
                              <span className="block truncate text-[9px] font-semibold text-white/40">
                                {hhmm(p.start)} – {hhmm(p.end)}
                              </span>
                            </button>
                          )
                        })
                    ) : (
                      <div className="flex h-full items-center px-3">
                        <span className="flex items-center gap-2 text-[11px] font-semibold text-white/25">
                          {loading ? (
                            <>
                              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-emerald-400" />
                              carregando guia…
                            </>
                          ) : (
                            'sem informação de programação'
                          )}
                        </span>
                      </div>
                    )}

                    {/* linha "agora" */}
                    {now >= windowStart && now <= windowEnd && (
                      <span
                        className="pointer-events-none absolute inset-y-0 z-20 w-px bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                        style={{ left: nowX }}
                      />
                    )}
                  </div>
                </div>
              )
            })}

            {filtered.length === 0 && (
              <div className="flex h-40 items-center justify-center text-sm text-white/40">
                Nenhum canal encontrado{q ? ` para “${q}”` : ''}.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* barra inferior: dicas */}
      <footer className="relative z-10 flex shrink-0 items-center gap-3 px-6 pb-2 pt-1 text-[10px] font-semibold text-white/30 md:px-8">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> linha do agora
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-4 rounded bg-emerald-500/40" /> programa atual
        </span>
        <span className="ml-auto hidden md:inline">
          Clique num programa ou canal para sintonizar · janela de {WINDOW_BEFORE_H + WINDOW_AFTER_H}h
        </span>
      </footer>
    </motion.div>
  )
}
