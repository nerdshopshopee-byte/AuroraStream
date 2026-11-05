'use client'

import { useMemo, useState } from 'react'
import type { MediaItem } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Clapperboard, MonitorPlay, Tv } from 'lucide-react'

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

function initials(title: string): string {
  const words = title
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return 'TV'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/**
 * Poster com fallback de gradiente estilo Aurora — funciona sem rede
 * e para canais ao vivo sem arte.
 */
export function Poster({
  item,
  className,
  iconSize = 36,
}: {
  item: MediaItem
  className?: string
  iconSize?: number
}) {
  const [failed, setFailed] = useState(false)

  const grad = useMemo(() => {
    const h = hashCode(item.id + item.title)
    const hue1 = h % 360
    const hue2 = (hue1 + 40 + (h % 60)) % 360
    return {
      from: `hsl(${hue1} 65% 26%)`,
      via: `hsl(${hue2} 55% 14%)`,
      to: `hsl(${hue1} 30% 8%)`,
    }
  }, [item.id, item.title])

  const showImage = item.poster && !failed

  return (
    <div
      className={cn('relative overflow-hidden bg-black/40', className)}
      style={
        showImage
          ? undefined
          : {
              backgroundImage: `linear-gradient(150deg, ${grad.from} 0%, ${grad.via} 55%, ${grad.to} 100%)`,
            }
      }
    >
      {showImage ? (
        <img
          src={item.poster}
          alt={item.title}
          loading="lazy"
          draggable={false}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-2 text-center">
          {item.type === 'live' ? (
            <Tv size={iconSize} className="text-white/70" />
          ) : item.type === 'series' ? (
            <MonitorPlay size={iconSize} className="text-white/70" />
          ) : (
            <Clapperboard size={iconSize} className="text-white/70" />
          )}
          <span className="line-clamp-3 text-[11px] font-semibold uppercase tracking-wider text-white/85 drop-shadow">
            {item.title}
          </span>
          <span className="text-[10px] font-bold tracking-[0.25em] text-white/35">
            {initials(item.title)}
          </span>
        </div>
      )}
      {/* brilho de vidro */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-white/5" />
    </div>
  )
}
