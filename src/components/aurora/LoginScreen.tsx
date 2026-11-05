'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Radio, Sparkles, Server, User, Lock, LogIn } from 'lucide-react'
import { useAurora } from '@/lib/store'
import { cn } from '@/lib/utils'

/**
 * Tela de login — estética glassmorphism Aurora.
 * Dois modos: Xtream Codes (DNS + usuário + senha) e Demonstração.
 */
export function LoginScreen() {
  const login = useAurora((s) => s.login)
  const bootError = useAurora((s) => s.bootError)
  const [mode, setMode] = useState<'xtream' | 'demo'>('xtream')
  const [server, setServer] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submitXtream(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login({ mode: 'xtream', server, username, password })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na conexão.')
    } finally {
      setBusy(false)
    }
  }

  async function submitDemo() {
    setError(null)
    setBusy(true)
    try {
      await login({ mode: 'demo' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao iniciar demo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#05070b] px-4">
      <AuroraBackdrop />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-white/5 backdrop-blur-xl">
            <Radio className="h-8 w-8 text-emerald-400" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">
            AURORA<span className="text-emerald-400">STREAM</span>
          </h1>
          <p className="mt-1 text-sm text-white/50">
            Player IPTV Xtream Codes — Filmes • Séries • TV • Futebol
          </p>
        </div>

        {/* Card glass */}
        <div className="glass rounded-2xl p-6 shadow-2xl shadow-black/50">
          {/* Alternador de modo */}
          <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-black/30 p-1">
            <ModeTab active={mode === 'xtream'} onClick={() => setMode('xtream')} icon={<Server size={15} />}>
              Servidor Xtream
            </ModeTab>
            <ModeTab active={mode === 'demo'} onClick={() => setMode('demo')} icon={<Sparkles size={15} />}>
              Demonstração
            </ModeTab>
          </div>

          {mode === 'xtream' ? (
            <form onSubmit={submitXtream} className="space-y-4">
              <GlassField
                icon={<Server size={15} />}
                label="DNS / Servidor"
                placeholder="http://meuservidor.tv:8080"
                value={server}
                onChange={setServer}
                autoComplete="url"
              />
              <GlassField
                icon={<User size={15} />}
                label="Usuário"
                placeholder="seu_usuario"
                value={username}
                onChange={setUsername}
                autoComplete="username"
              />
              <GlassField
                icon={<Lock size={15} />}
                label="Senha"
                placeholder="••••••••"
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
              />
              <GlassSubmit busy={busy} label="Conectar ao servidor" />
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-white/60">
                Explore a interface completa do player com catálogo de demonstração:
                filmes, séries com episódios, canais ao vivo e jogos de futebol,
                usando streams HLS públicos. Depois conecte seu painel Xtream
                normalmente.
              </p>
              <GlassSubmit busy={busy} label="Entrar no modo demo" onClick={submitDemo} />
            </div>
          )}

          {(error || bootError) && (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error || bootError}
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-white/35">
          Compatível com painéis Xtream Codes API • HLS (.m3u8) e MPEG-TS
          <br />
          O servidor atua como proxy — seu DNS nunca é exposto ao navegador.
        </p>
      </motion.div>
    </div>
  )
}

function ModeTab({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all',
        active
          ? 'bg-emerald-500/20 text-emerald-300 shadow-inner shadow-emerald-500/10 ring-1 ring-emerald-400/40'
          : 'text-white/50 hover:bg-white/5 hover:text-white/80',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function GlassField({
  icon,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  autoComplete,
}: {
  icon: React.ReactNode
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  autoComplete?: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-white/45">
        {label}
      </span>
      <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/30 px-3.5 transition-colors focus-within:border-emerald-400/50 focus-within:bg-black/40">
        <span className="text-white/35">{icon}</span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          spellCheck={false}
          className="h-11 w-full bg-transparent text-sm text-white outline-none placeholder:text-white/25"
        />
      </div>
    </label>
  )
}

function GlassSubmit({
  busy,
  label,
  onClick,
}: {
  busy: boolean
  label: string
  onClick?: () => void
}) {
  return (
    <button
      type="submit"
      disabled={busy}
      onClick={onClick}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 font-semibold text-black transition-all hover:bg-emerald-400 hover:shadow-lg hover:shadow-emerald-500/25 disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
      {busy ? 'Conectando…' : label}
    </button>
  )
}

export function AuroraBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div className="absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-emerald-500/12 blur-3xl aurora-drift" />
      <div className="absolute -bottom-52 right-0 h-[38rem] w-[38rem] rounded-full bg-teal-500/10 blur-3xl aurora-drift-slow" />
      <div className="absolute left-1/3 top-1/4 h-80 w-80 rounded-full bg-lime-400/8 blur-3xl aurora-drift" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,#05070b_100%)]" />
      <div className="aurora-noise absolute inset-0 opacity-[0.035]" />
    </div>
  )
}
