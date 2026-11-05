'use client'

import { motion } from 'framer-motion'
import { CalendarDays, Play } from 'lucide-react'
import { useAurora } from '@/lib/store'
import type { FixtureRow } from '@/lib/client'

/**
 * Faixa de "Jogos de hoje" — cards de vidro com confrontos do dia
 * e atalho para o canal da transmissão.
 */
export function FixturesStrip({ fixtures }: { fixtures: FixtureRow[] }) {
  const catalog = useAurora((s) => s.catalog)
  const play = useAurora((s) => s.play)

  const watch = (channelId: string) => {
    const ch = [...(catalog?.sports ?? []), ...(catalog?.live ?? [])].find(
      (c) => c.id === channelId,
    )
    if (ch) play(ch)
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="shrink-0"
    >
      <div className="mb-1.5 flex items-baseline gap-2 px-6 md:px-14">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.2em] text-white/80">
          <CalendarDays size={12} className="text-emerald-400" />
          Jogos de hoje
        </h3>
        <span className="text-[10px] font-semibold text-white/25">{fixtures.length}</span>
      </div>
      <div className="carousel-strip flex gap-3 overflow-x-auto px-6 pb-2 md:px-14">
        {fixtures.map((fx) => (
          <div
            key={fx.id}
            className="glass w-60 shrink-0 rounded-xl p-3 transition-all hover:bg-white/10"
          >
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-white/45">
              <span className="truncate">{fx.competition}</span>
              <span className="font-mono font-bold text-emerald-300">{fx.time}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm font-semibold text-white">
              <span className="truncate">{fx.home}</span>
              <span className="mx-2 text-white/35">×</span>
              <span className="truncate">{fx.away}</span>
            </div>
            <button
              onClick={() => watch(fx.channelId)}
              className="mt-2.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-white/8 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-400/25 transition-all hover:bg-emerald-500/20"
            >
              <Play size={12} /> Assistir em {fx.channel}
            </button>
          </div>
        ))}
      </div>
    </motion.section>
  )
}
