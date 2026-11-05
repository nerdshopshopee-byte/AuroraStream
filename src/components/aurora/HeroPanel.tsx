'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Info, Play, Plus, Star } from 'lucide-react'
import { toast } from 'sonner'
import { useAurora } from '@/lib/store'
import type { MediaItem } from '@/lib/types'
import { mediaKey } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Painel de informações projetado ao fundo da tela: reage ao item
 * sob o cursor/navitação no carrossel, sem ocupar o fluxo das linhas.
 * A arte do conteúdo (backdrop 16:9 ou pôster) aparece como background
 * do painel, com gradiente para manter a legibilidade do texto.
 */
export function HeroPanel({
  item,
  fallbackLabel,
  compact = false,
}: {
  item: MediaItem | null
  fallbackLabel: string
  compact?: boolean
}) {
  const store = useAurora()
  const { session, favorites } = store
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  const favKeys = useMemo(
    () => new Set(favorites.map((f) => mediaKey(f.mediaType, f.mediaId))),
    [favorites],
  )
  const isFav = item ? favKeys.has(mediaKey(item.type, item.id)) : false
  const resumeAt = item?.resumeAt ?? 0
  const resumePct =
    item?.resumeAt && item.durationSec && item.durationSec > 0
      ? Math.min(100, (item.resumeAt / item.durationSec) * 100)
      : 0

  const playActive = (target: MediaItem) => {
    if (target.type === 'series') {
      store.openDetails(target)
      return
    }
    store.play(target, null, target.resumeAt ?? 0)
  }

  const heroImg = item ? item.backdrop || item.poster || undefined : undefined
  const showImg = heroImg != null && failedUrl !== heroImg

  return (
    <div className="relative min-h-[9rem] md:min-h-[11rem]">
      {/* ---- imagem do conteúdo como background (backdrop 16:9 ou pôster) ---- */}
      <AnimatePresence mode="wait">
        {showImg && item && (
          <motion.div
            key={`bg-${item.type}-${item.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="pointer-events-none absolute -inset-y-4 -inset-x-2 z-0 overflow-hidden rounded-2xl md:-inset-x-6 md:-inset-y-6"
          >
            <img
              key={heroImg}
              src={heroImg}
              alt=""
              draggable={false}
              onError={() => setFailedUrl(heroImg ?? null)}
              className="h-full w-full scale-105 object-cover object-center opacity-45 md:opacity-55"
            />
            {/* gradiente para legibilidade + fusão com o fundo Aurora */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#05070b] via-[#05070b]/35 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#05070b]/80 via-[#05070b]/20 to-[#05070b]/70" />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {item && (
          <motion.div
            key={`${item.type}-${item.id}`}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="relative z-10 max-w-3xl"
          >
            <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">
              {item.category || fallbackLabel}
              {session?.mode === 'demo' && (
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                  Demo
                </span>
              )}
            </p>
            <h2
              className={cn(
                'truncate font-black tracking-tight text-white drop-shadow-lg',
                compact ? 'text-2xl md:text-4xl' : 'text-3xl md:text-5xl',
              )}
            >
              {item.title}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/55 md:text-sm">
              {item.year && <span>{item.year}</span>}
              {item.rating != null && item.rating > 0 && (
                <span className="flex items-center gap-1 text-amber-300">
                  <Star size={12} className="fill-amber-300" />
                  {item.rating.toFixed(1)}
                </span>
              )}
              {item.durationSec ? <span>{Math.floor(item.durationSec / 60)} min</span> : null}
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                {item.type === 'live' ? 'Canal' : item.type === 'series' ? 'Série' : 'Filme'}
              </span>
            </div>

            {item.plot && (
              <p className="mt-2 line-clamp-2 max-w-2xl text-xs leading-relaxed text-white/55 md:text-sm">
                {item.plot}
              </p>
            )}

            {resumePct > 0 && (
              <div className="mt-2.5 max-w-sm">
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${resumePct}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-white/45">{Math.round(resumePct)}% assistido</p>
              </div>
            )}

            {/* ações */}
            <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => playActive(item)}
                className="glass-strong flex h-10 items-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-bold text-black transition-all hover:scale-[1.03] hover:bg-emerald-400 hover:shadow-lg hover:shadow-emerald-500/30 active:scale-95"
              >
                <Play size={16} className="fill-black" />
                {item.type === 'series'
                  ? 'Episódios'
                  : resumeAt > 0
                    ? 'Continuar'
                    : 'Reproduzir'}
              </button>
              <button
                onClick={() =>
                  store.toggleFavorite(item).then((fav) =>
                    toast(fav ? 'Adicionado aos favoritos' : 'Removido dos favoritos', {
                      description: item.title,
                    }),
                  )
                }
                className="glass flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white/85 transition-all hover:bg-white/12 active:scale-95"
              >
                {isFav ? <Check size={15} className="text-emerald-400" /> : <Plus size={15} />}
                Favorito
              </button>
              <button
                onClick={() => store.openDetails(item)}
                className="glass flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white/85 transition-all hover:bg-white/12 active:scale-95"
              >
                <Info size={15} />
                Detalhes
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
