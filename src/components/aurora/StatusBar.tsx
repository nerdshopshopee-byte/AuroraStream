'use client'

import { useEffect, useState } from 'react'
import { useAurora } from '@/lib/store'
import { clientCacheCount, measurePing } from '@/lib/client'
import { Activity, Database, LogOut, Settings, Signal, Timer, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

function fmtExpiry(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Barra superior estilo monitor do Aurora: NET / BUF / CACHE à esquerda,
 * status central e identidade da conta à direita.
 */
export function StatusBar({ scanning }: { scanning?: boolean }) {
  const session = useAurora((s) => s.session)
  const ping = useAurora((s) => s.ping)
  const bufferSec = useAurora((s) => s.bufferSec)
  const catalog = useAurora((s) => s.catalog)
  const openSettings = useAurora((s) => s.openSettings)
  const logout = useAurora((s) => s.logout)
  const [cacheCount, setCacheCount] = useState(0)
  const [clock, setClock] = useState('')

  useEffect(() => {
    const t0 = setTimeout(() => setCacheCount(clientCacheCount()), 60)
    const t = setInterval(() => setCacheCount(clientCacheCount()), 5000)
    return () => {
      clearTimeout(t0)
      clearInterval(t)
    }
  }, [])

  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
    const t0 = setTimeout(tick, 60)
    const t = setInterval(tick, 20_000)
    return () => {
      clearTimeout(t0)
      clearInterval(t)
    }
  }, [])

  // ping periódico
  useEffect(() => {
    let alive = true
    const run = async () => {
      const p = await measurePing()
      if (alive) useAurora.getState().setPing(p)
    }
    run()
    const t = setInterval(run, 12_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  const totalItems = catalog
    ? catalog.movies.length + catalog.series.length + catalog.live.length
    : 0

  const pingTone = ping < 0 ? 'text-white/30' : ping < 120 ? 'text-emerald-400' : ping < 350 ? 'text-amber-400' : 'text-red-400'

  return (
    <header className="glass z-20 flex h-12 items-center gap-3 border-x-0 border-t-0 px-3 md:px-5">
      {/* Gauges à esquerda */}
      <div className="hidden items-center gap-2 md:flex">
        <Gauge icon={<Signal size={12} />} label="NET" value={ping < 0 ? '—' : `${ping}ms`} tone={pingTone} />
        <Gauge icon={<Timer size={12} />} label="BUF" value={`${Math.round(bufferSec)}s`} tone={bufferSec > 15 ? 'text-emerald-400' : bufferSec > 5 ? 'text-amber-400' : 'text-white/50'} />
        <Gauge icon={<Database size={12} />} label="CACHE" value={String(cacheCount)} tone="text-teal-300" />
        <Gauge icon={<Activity size={12} />} label="MÍDIA" value={String(totalItems)} tone="text-white/70" />
      </div>

      {/* Status central */}
      <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
        {scanning ? (
          <span className="truncate text-xs font-medium tracking-wide text-amber-300/90">
            <span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300 align-middle" />
            Carregando catálogo…
          </span>
        ) : (
          <span className="truncate text-xs text-white/45">
            {session?.mode === 'xtream'
              ? `Conectado a ${session.server?.replace(/^https?:\/\//, '') ?? 'servidor'}`
              : 'Modo demonstração — catálogo local'}
          </span>
        )}
      </div>

      {/* Relógio + conta */}
      <div className="flex items-center gap-2 md:gap-3">
        <span className="hidden font-mono text-sm font-semibold text-white/80 sm:block">
          {clock}
        </span>
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1">
          <span className="max-w-[9rem] truncate text-xs font-semibold text-emerald-300">
            {session?.label ?? 'Convidado'}
          </span>
          {session?.expiry && (
            <span className="hidden text-[10px] text-white/40 lg:block">
              exp {fmtExpiry(session.expiry)}
            </span>
          )}
          {session?.mode === 'xtream' && session.maxConnections ? (
            <span className="hidden items-center gap-1 text-[10px] text-white/40 md:flex">
              <Users size={10} />
              {session.activeConnections ?? 0}/{session.maxConnections}
            </span>
          ) : null}
        </div>
        <button
          onClick={openSettings}
          aria-label="Configurações"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/60 transition-all hover:bg-white/10 hover:text-white"
        >
          <Settings size={15} />
        </button>
        <button
          onClick={logout}
          aria-label="Sair"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/60 transition-all hover:bg-red-500/20 hover:text-red-300"
        >
          <LogOut size={15} />
        </button>
      </div>
    </header>
  )
}

function Gauge({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-2 py-1">
      <span className="text-white/35">{icon}</span>
      <span className="text-[10px] font-bold tracking-wider text-white/35">{label}</span>
      <span className={cn('font-mono text-xs font-semibold', tone)}>{value}</span>
    </div>
  )
}
