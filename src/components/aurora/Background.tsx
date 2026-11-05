'use client'

import { useState } from 'react'
import type { MediaItem } from '@/lib/types'
import { Poster } from './Poster'
import { AuroraBackdrop } from './LoginScreen'

/**
 * Fundo dinâmico do dashboard: arte do item selecionado desfocada +
 * blobs aurora animados — replicando a sensação do dashboard da Xbox 360.
 */
export function Background({ item }: { item?: MediaItem }) {
  const [failed, setFailed] = useState(false)
  const [lastId, setLastId] = useState(item?.id)
  if (lastId !== item?.id) {
    setLastId(item?.id)
    setFailed(false)
  }

  const art = item?.backdrop || item?.poster
  const showArt = art && !failed

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-[#05070b]" aria-hidden>
      {showArt && (
        <img
          key={art}
          src={art}
          alt=""
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-2xl brightness-[0.42] saturate-[1.15] transition-all duration-1000"
        />
      )}
      {/* gradiente base */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/35 to-black/85" />
      <AuroraBackdrop />
      {/* vinheta */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(0,0,0,0.55)_100%)]" />
    </div>
  )
}
