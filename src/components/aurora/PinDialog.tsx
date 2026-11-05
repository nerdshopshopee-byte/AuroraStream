'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Delete, Lock, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAurora } from '@/lib/store'
import { unlockSession, verifyPin } from '@/lib/parental'
import { cn } from '@/lib/utils'

/**
 * Diálogo de PIN do controle parental — abre sobre tudo (z-[55]) quando
 * o usuário tenta reproduzir conteúdo +18 sem sessão desbloqueada.
 * PIN de 4 dígitos: teclado na tela (controle remoto/toque) + teclado físico.
 */
export function PinDialog() {
  const closePinRequest = useAurora((s) => s.closePinRequest)
  const pinRequest = useAurora((s) => s.pinRequest)

  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(false)
  const busy = useRef(false)

  const confirm = useCallback(
    (value: string) => {
      if (busy.current) return
      if (!verifyPin(value)) {
        setShake(true)
        setPin('')
        setTimeout(() => setShake(false), 450)
        toast.error('PIN incorreto')
        return
      }
      busy.current = true
      unlockSession()
      const req = useAurora.getState().pinRequest
      useAurora.getState().closePinRequest()
      toast.success('Conteúdo +18 desbloqueado para esta sessão')
      if (req?.intent === 'play' && req.item) {
        useAurora.getState().play(req.item, req.episode ?? null, req.startAt ?? 0)
      }
      busy.current = false
    },
    [],
  )

  // teclado físico: dígitos, Backspace, Enter, Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        setPin((p) => {
          const next = (p + e.key).slice(0, 4)
          if (next.length === 4) setTimeout(() => confirm(next), 120)
          return next
        })
      } else if (e.key === 'Backspace') {
        setPin((p) => p.slice(0, -1))
      } else if (e.key === 'Enter') {
        if (pin.length === 4) confirm(pin)
      } else if (e.key === 'Escape') {
        closePinRequest()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pin, confirm, closePinRequest])

  const press = (d: string) => {
    setPin((p) => {
      const next = (p + d).slice(0, 4)
      if (next.length === 4) setTimeout(() => confirm(next), 120)
      return next
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
      onClick={closePinRequest}
    >
      <motion.div
        initial={{ scale: 0.94, y: 14 }}
        animate={{ scale: shake ? 0.97 : 1, y: 0, x: shake ? [0, -9, 9, -6, 6, 0] : 0 }}
        exit={{ scale: 0.96, y: 10 }}
        transition={{ duration: shake ? 0.4 : 0.25 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-strong w-full max-w-xs rounded-3xl p-6 shadow-2xl shadow-black/70"
      >
        <button
          onClick={closePinRequest}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg bg-black/40 text-white/70 hover:bg-white/15 hover:text-white"
          aria-label="Cancelar"
        >
          <X size={15} />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/15 ring-1 ring-red-500/30">
            <Lock size={20} className="text-red-300" />
          </div>
          <h2 className="mt-3 text-base font-black text-white">Conteúdo restrito (+18)</h2>
          <p className="mt-1 text-xs leading-relaxed text-white/50">
            Digite o PIN parental para desbloquear a reprodução nesta sessão.
          </p>
        </div>

        {/* indicador dos dígitos */}
        <div className="mt-5 flex justify-center gap-3" aria-label={`PIN ${pin.length} de 4 dígitos`}>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn(
                'h-3.5 w-3.5 rounded-full transition-all duration-200',
                i < pin.length
                  ? 'scale-110 bg-emerald-400 shadow-lg shadow-emerald-500/40'
                  : 'bg-white/15',
              )}
            />
          ))}
        </div>

        {/* teclado 3×4 estilo controle de TV */}
        <div className="mt-5 grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              onClick={() => press(d)}
              className="glass flex h-11 items-center justify-center rounded-xl text-base font-bold text-white/90 transition-all hover:bg-white/15 active:scale-90"
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => setPin((p) => p.slice(0, -1))}
            className="glass flex h-11 items-center justify-center rounded-xl text-white/70 transition-all hover:bg-white/15 active:scale-90"
            aria-label="Apagar"
          >
            <Delete size={16} />
          </button>
          <button
            onClick={() => press('0')}
            className="glass flex h-11 items-center justify-center rounded-xl text-base font-bold text-white/90 transition-all hover:bg-white/15 active:scale-90"
          >
            0
          </button>
          <button
            onClick={() => pin.length === 4 && confirm(pin)}
            className={cn(
              'flex h-11 items-center justify-center rounded-xl transition-all active:scale-90',
              pin.length === 4
                ? 'bg-emerald-500 text-black hover:bg-emerald-400'
                : 'bg-white/8 text-white/30',
            )}
            aria-label="Confirmar"
          >
            <ShieldCheck size={16} />
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
