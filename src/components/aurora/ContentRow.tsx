'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react'
import type { ContentRowData, MediaItem } from '@/lib/types'
import { Poster } from './Poster'
import { cn } from '@/lib/utils'

/**
 * Linha horizontal de conteúdo (um "slider" por categoria):
 * - barra de posição transparente/invisível (aparece sutilmente no hover);
 * - setas circulares de vidro (‹ ›) nas laterais para navegação precisa;
 * - botão "Ver tudo" abre a página em grade com o acervo completo;
 * - o card sob o cursor/navegação ressalta, avança para frente e as
 *   informações são projetadas ao fundo da tela (via HeroPanel);
 * - navegável por teclado (D-pad), toque, mouse e roda.
 */
export function ContentRow({
  row,
  rowIndex,
  selectedIdx,
  active,
  onSelect,
  onPlay,
  onOpenGrid,
}: {
  row: ContentRowData
  rowIndex: number
  selectedIdx: number
  active: boolean
  onSelect: (row: number, idx: number) => void
  onPlay: (item: MediaItem) => void
  onOpenGrid: (row: ContentRowData) => void
}) {
  const stripRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragging = useRef(false)
  const [prog, setProg] = useState({ frac: 1, pos: 0 })

  const items = row.items
  const hero = row.variant === 'hero'
  const wide = row.wide === true

  // ---- medição da barra de posição ----
  const measure = useCallback(() => {
    const strip = stripRef.current
    if (!strip) return
    const scrollable = strip.scrollWidth - strip.clientWidth
    const frac =
      strip.scrollWidth > 0
        ? Math.min(1, strip.clientWidth / strip.scrollWidth)
        : 1
    const pos = scrollable > 4 ? Math.min(1, Math.max(0, strip.scrollLeft / scrollable)) : 0
    setProg({ frac, pos })
  }, [])

  useEffect(() => {
    const strip = stripRef.current
    if (!strip) return
    const raf = requestAnimationFrame(measure)
    const ro = new ResizeObserver(measure)
    ro.observe(strip)
    for (const child of Array.from(strip.children)) ro.observe(child)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [measure, items.length])

  // ---- roda do mouse → rolagem horizontal ----
  useEffect(() => {
    const strip = stripRef.current
    if (!strip) return
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault()
        strip.scrollLeft += e.deltaY
      }
    }
    strip.addEventListener('wheel', onWheel, { passive: false })
    return () => strip.removeEventListener('wheel', onWheel)
  }, [])

  // ---- centraliza o card selecionado (teclado/D-pad) ----
  // usa scrollTo na própria faixa: nunca rola ancestrais verticalmente
  useEffect(() => {
    if (dragging.current) return
    const el = cardRefs.current[selectedIdx]
    const strip = stripRef.current
    if (!el || !strip) return
    const target = el.offsetLeft - strip.clientWidth / 2 + el.clientWidth / 2
    strip.scrollTo({ left: Math.max(0, target), behavior: 'smooth' })
  }, [selectedIdx, items.length, active])

  // ---- mantém a linha ativa visível verticalmente (container principal) ----
  useEffect(() => {
    if (!active) return
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [active])

  useEffect(
    () => () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current)
    },
    [],
  )

  const scheduleHover = useCallback(
    (idx: number) => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current)
      hoverTimer.current = setTimeout(() => onSelect(rowIndex, idx), 70)
    },
    [onSelect, rowIndex],
  )

  const handleClick = useCallback(
    (idx: number, item: MediaItem) => {
      if (idx === selectedIdx) onPlay(item)
      else onSelect(rowIndex, idx)
    },
    [selectedIdx, rowIndex, onSelect, onPlay],
  )

  // ---- arrastar a barra transparente ----
  const seekFromPointer = useCallback(
    (clientX: number) => {
      const track = trackRef.current
      const strip = stripRef.current
      if (!track || !strip) return
      const rect = track.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      const scrollable = strip.scrollWidth - strip.clientWidth
      strip.scrollLeft = ratio * scrollable
      measure()
    },
    [measure],
  )

  const onTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    seekFromPointer(e.clientX)
  }
  const onTrackPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    seekFromPointer(e.clientX)
  }
  const onTrackPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const thumbHidden = prog.frac >= 0.999
  const canScroll = prog.frac < 0.999
  const atStart = prog.pos <= 0.01
  const atEnd = prog.pos >= 0.99

  // ---- setas circulares: rolagem precisa por "páginas" ----
  const scrollByDir = useCallback((dir: 1 | -1) => {
    const strip = stripRef.current
    if (!strip) return
    strip.scrollBy({ left: dir * strip.clientWidth * 0.82, behavior: 'smooth' })
  }, [])

  const arrowCls = (side: 'l' | 'r', hidden: boolean) =>
    cn(
      // -mt centraliza verticalmente sem conflitar com scale/transform do hover
      'absolute top-1/2 z-30 -mt-[22px] flex h-11 w-11 items-center justify-center rounded-full md:-mt-6 md:h-12 md:w-12',
      'glass text-white/85 transition-[opacity,transform,background-color] duration-300 ease-out',
      'hover:!scale-110 hover:bg-white/15 hover:text-white active:!scale-95',
      'shadow-[0_8px_24px_rgba(0,0,0,0.45)]',
      side === 'l' ? 'left-2 md:left-4' : 'right-2 md:right-4',
      hidden || (!canScroll && side === 'r')
        ? 'pointer-events-none scale-75 opacity-0'
        : cn('opacity-0 group-hover/row:opacity-100', active && 'opacity-60'),
    )

  return (
    <section ref={sectionRef} className="group/row select-none" aria-label={row.title}>
      {/* título da categoria + botão "Ver tudo" */}
      <div className="mb-1.5 flex items-baseline gap-2 px-6 md:px-14">
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full transition-all duration-300',
            active ? 'scale-125 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-white/25',
          )}
        />
        <h3
          className={cn(
            'text-xs font-bold uppercase tracking-[0.2em] transition-colors duration-300',
            active ? 'text-white' : 'text-white/45',
          )}
        >
          {row.title}
        </h3>
        <span className="text-[10px] font-semibold text-white/25">{items.length}</span>
        <button
          onClick={() => onOpenGrid(row)}
          className={cn(
            'ml-auto flex shrink-0 items-center gap-1.5 self-center rounded-full glass px-3 py-1',
            'text-[10px] font-bold uppercase tracking-wider text-white/55 transition-all duration-300',
            'hover:scale-105 hover:bg-white/15 hover:text-white active:scale-95',
          )}
          aria-label={`Ver tudo em ${row.title}`}
        >
          <LayoutGrid size={11} className="text-emerald-300/80" />
          Ver tudo
          {row.total != null && row.total > items.length && (
            <span className="rounded-full bg-emerald-400/15 px-1.5 text-[9px] font-black text-emerald-300">
              {row.total}
            </span>
          )}
        </button>
      </div>

      <div className="relative">
        <div
          ref={stripRef}
          role="listbox"
          aria-label={row.title}
          onScroll={measure}
          className={cn(
            'carousel-strip flex items-end overflow-x-auto',
            hero
              ? 'gap-3 px-[8vw] pb-2 pt-12 md:gap-4'
              : 'gap-2.5 px-6 pt-6 pb-2 md:gap-3 md:px-14',
          )}
        >
          {items.map((item, idx) => {
            const selected = idx === selectedIdx
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
                whileTap={{ scale: 0.96 }}
                onMouseEnter={() => scheduleHover(idx)}
                onFocus={() => onSelect(rowIndex, idx)}
                onClick={() => handleClick(idx, item)}
                onDoubleClick={() => onPlay(item)}
                className={cn(
                  'group/card relative shrink-0 overflow-visible rounded-xl outline-none transition-all duration-300 ease-out will-change-transform',
                  wide ? 'aspect-video h-[11vh] max-h-36 md:h-[13vh]' : 'aspect-[2/3] h-[15vh] max-h-52 md:h-[17vh]',
                  hero && 'h-[22vh] max-h-64 md:h-[27vh]',
                  selected
                    ? 'z-20 -translate-y-2 scale-[1.16] opacity-100 md:-translate-y-2.5 md:scale-[1.2]'
                    : 'z-0 scale-100 translate-y-0 opacity-60 hover:opacity-90',
                )}
                style={{ aspectRatio: wide ? '16 / 9' : '2 / 3' }}
              >
                {/* plinto de profundidade quando avança */}
                {selected && (
                  <span className="pointer-events-none absolute -inset-x-3 -bottom-3 h-6 rounded-[50%] bg-black/50 blur-md" />
                )}
                <span
                  className={cn(
                    'block h-full w-full overflow-hidden rounded-xl transition-shadow duration-300',
                    selected
                      ? 'shadow-[0_20px_50px_-12px_rgba(0,0,0,0.85)] ring-2 ring-emerald-400'
                      : 'ring-1 ring-white/10 group-hover/card:ring-white/25',
                  )}
                >
                  <Poster item={item} className="h-full w-full rounded-xl" iconSize={24} />
                </span>

                {item.type === 'live' && (
                  <span className="absolute left-1.5 top-1.5 rounded bg-red-600/90 px-1 py-0.5 text-[8px] font-black tracking-widest text-white">
                    AO VIVO
                  </span>
                )}
                {item.epLabel && (
                  <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-emerald-300 backdrop-blur">
                    {item.epLabel}
                  </span>
                )}
                {resumePct > 0 && (
                  <span className="absolute inset-x-1.5 bottom-1.5 h-1 overflow-hidden rounded-full bg-white/20">
                    <span
                      className="block h-full rounded-full bg-emerald-400"
                      style={{ width: `${resumePct}%` }}
                    />
                  </span>
                )}
                {selected && (
                  <motion.span
                    layoutId={`row-glow-${row.id}`}
                    className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-t from-emerald-400/25 via-transparent to-transparent"
                  />
                )}
              </motion.button>
            )
          })}
        </div>

        {/* setas circulares de vidro (◀ ▶) */}
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Retroceder em ${row.title}`}
          onClick={() => scrollByDir(-1)}
          className={arrowCls('l', atStart)}
        >
          <ChevronLeft size={20} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Avançar em ${row.title}`}
          onClick={() => scrollByDir(1)}
          className={arrowCls('r', atEnd)}
        >
          <ChevronRight size={20} strokeWidth={2.5} />
        </button>

        {/* fades laterais */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-[5vw] bg-gradient-to-r from-[#05070b]/90 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-[5vw] bg-gradient-to-l from-[#05070b]/90 to-transparent" />
      </div>

      {/* ---- barra de slider transparente/invisível (área de toque ampliada) ---- */}
      <div
        ref={trackRef}
        role="slider"
        aria-label={`Posição de ${row.title}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(prog.pos * 100)}
        tabIndex={-1}
        onPointerDown={onTrackPointerDown}
        onPointerMove={onTrackPointerMove}
        onPointerUp={onTrackPointerUp}
        className={cn(
          'mx-6 mt-0.5 flex cursor-pointer items-center py-2.5 md:mx-14',
          thumbHidden && 'pointer-events-none',
        )}
      >
        <div
          className={cn(
            'relative h-[3px] w-full rounded-full transition-all duration-300',
            thumbHidden
              ? 'bg-transparent'
              : 'bg-white/[0.06] opacity-40 group-hover/row:opacity-90',
          )}
        >
          {!thumbHidden && (
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400/50 to-emerald-300/90 shadow-[0_0_10px_rgba(52,211,153,0.35)]"
              style={{
                width: `${prog.frac * 100}%`,
                marginLeft: `${prog.pos * (100 - prog.frac * 100)}%`,
              }}
            />
          )}
        </div>
      </div>
    </section>
  )
}
