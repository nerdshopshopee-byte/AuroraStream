'use client'

import { useEffect } from 'react'
import { useAurora } from '@/lib/store'
import { LoginScreen } from '@/components/aurora/LoginScreen'
import { Dashboard } from '@/components/aurora/Dashboard'
import { AuroraBackdrop } from '@/components/aurora/LoginScreen'
import { Radio } from 'lucide-react'

/**
 * AuroraStream — ponto de entrada único (SPA):
 * loading → login (Xtream Codes / demo) → dashboard Aurora → player.
 */
export default function Home() {
  const view = useAurora((s) => s.view)
  const init = useAurora((s) => s.init)

  useEffect(() => {
    init()
  }, [init])

  if (view === 'loading') {
    return (
      <div className="relative flex min-h-dvh items-center justify-center bg-[#05070b]">
        <AuroraBackdrop />
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-white/5 backdrop-blur-xl">
            <Radio className="h-8 w-8 animate-pulse text-emerald-400" />
          </div>
          <p className="text-sm font-semibold tracking-[0.3em] text-white/60">AURORASTREAM</p>
          <div className="h-1 w-40 overflow-hidden rounded-full bg-white/10">
            <div className="aurora-progress h-full w-1/2 rounded-full bg-emerald-400" />
          </div>
        </div>
      </div>
    )
  }

  if (view === 'login') {
    return <LoginScreen />
  }

  return <Dashboard />
}
