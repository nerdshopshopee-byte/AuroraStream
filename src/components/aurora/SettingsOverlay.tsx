'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Database,
  EyeOff,
  Info,
  Keyboard,
  KeyRound,
  Lock,
  LogOut,
  RefreshCw,
  Server,
  Shield,
  Signal,
  Trash2,
  Unlock,
  X,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { useAurora } from '@/lib/store'
import { clearClientCache, clientCacheCount } from '@/lib/client'
import {
  getStoredPin,
  hideAdultEnabled,
  isUnlocked,
  lockAgain,
  parentalEnabled,
  setHideAdult,
  setStoredPin,
  verifyPin,
} from '@/lib/parental'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type PinMode = 'idle' | 'setup' | 'confirm-pin'
type PendingAction = 'change' | 'disable' | 'unhide' | null

/** Configurações estilo "System/Settings" do Aurora — layout responsivo dinâmico */
export function SettingsOverlay() {
  const closeOverlay = useAurora((s) => s.closeOverlay)
  const session = useAurora((s) => s.session)
  const ping = useAurora((s) => s.ping)
  const catalog = useAurora((s) => s.catalog)
  const refreshUserData = useAurora((s) => s.refreshUserData)
  const logout = useAurora((s) => s.logout)
  const [cacheN, setCacheN] = useState(clientCacheCount())

  // ---- controle parental ----
  const [pinMode, setPinMode] = useState<PinMode>('idle')
  const [pending, setPending] = useState<PendingAction>(null)
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [currentPin, setCurrentPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinSet, setPinSet] = useState(() => parentalEnabled())
  const [hideAdult, setHideAdultState] = useState(() => hideAdultEnabled())
  const [unlocked, setUnlocked] = useState(() => isUnlocked())

  const totals = catalog
    ? `Filmes: ${catalog.movies.length} · Séries: ${catalog.series.length} · Canais: ${catalog.live.length} · Esportes: ${catalog.sports.length}`
    : '—'

  const digitsOnly = (v: string) => v.replace(/\D/g, '').slice(0, 4)

  const savePin = () => {
    if (newPin.length !== 4) {
      setPinError('O PIN deve ter 4 dígitos.')
      return
    }
    if (newPin !== confirmPin) {
      setPinError('Os PINs não coincidem.')
      return
    }
    setStoredPin(newPin)
    setPinSet(true)
    setPinError(null)
    setPinMode('idle')
    setNewPin('')
    setConfirmPin('')
    setUnlocked(isUnlocked())
    toast.success('Controle parental ativado', {
      description: 'Conteúdo +18 agora exige PIN para reproduzir.',
    })
  }

  const requireCurrentPin = (action: Exclude<PendingAction, null>) => {
    setPending(action)
    setCurrentPin('')
    setPinError(null)
    setPinMode('confirm-pin')
  }

  const confirmCurrentPin = () => {
    if (!verifyPin(currentPin)) {
      setPinError('PIN atual incorreto.')
      return
    }
    if (pending === 'change') {
      setNewPin('')
      setConfirmPin('')
      setPinError(null)
      setPinMode('setup')
      return
    }
    if (pending === 'disable') {
      setStoredPin(null)
      setPinSet(false)
      setPinError(null)
      setPinMode('idle')
      setPending(null)
      toast.success('Controle parental desativado')
      return
    }
    if (pending === 'unhide') {
      setHideAdult(false)
      setHideAdultState(false)
      setPinError(null)
      setPinMode('idle')
      setPending(null)
      refreshUserData()
      toast.success('Conteúdo +18 visível novamente')
    }
  }

  const cancelPinFlow = () => {
    setPinMode('idle')
    setPending(null)
    setNewPin('')
    setConfirmPin('')
    setCurrentPin('')
    setPinError(null)
  }

  const onToggleHide = (v: boolean) => {
    if (v) {
      // restringir é livre
      setHideAdult(true)
      setHideAdultState(true)
      refreshUserData()
      toast.success('Conteúdo +18 oculto em todas as telas')
      return
    }
    // revelar exige PIN
    requireCurrentPin('unhide')
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-3 backdrop-blur-md md:p-4"
      onClick={closeOverlay}
    >
      <motion.div
        initial={{ scale: 0.95, y: 18 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-strong relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl shadow-2xl shadow-black/70"
      >
        {/* cabeçalho fixo */}
        <div className="flex shrink-0 items-start justify-between px-5 pb-3 pt-5 md:px-6">
          <div>
            <h2 className="text-xl font-black text-white">Sistema</h2>
            <p className="text-xs text-white/45">AuroraStream v1.4 · núcleo multiplataforma</p>
          </div>
          <button
            onClick={closeOverlay}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-black/40 text-white/70 transition-all hover:bg-white/15 hover:text-white"
            aria-label="Fechar"
          >
            <X size={17} />
          </button>
        </div>

        {/* conteúdo com rolagem interna discreta (sem barra exposta) */}
        <div className="scroll-invis min-h-0 flex-1 overflow-y-auto px-5 pb-5 md:px-6">
          <div className="space-y-3">
            {/* Conta */}
            <Section icon={<Server size={14} />} title="Conta">
              <Row k="Modo" v={session?.mode === 'xtream' ? 'Xtream Codes' : 'Demonstração'} />
              {session?.mode === 'xtream' ? (
                <>
                  <Row k="Servidor" v={session.server ?? '—'} />
                  <Row k="Usuário" v={session.label} />
                  <Row k="Status" v={session.status ?? '—'} />
                  <Row
                    k="Expira"
                    v={
                      session.expiry
                        ? new Date(session.expiry).toLocaleDateString('pt-BR')
                        : 'ilimitado'
                    }
                  />
                  <Row
                    k="Conexões"
                    v={`${session.activeConnections ?? 0} / ${session.maxConnections ?? 0}`}
                  />
                </>
              ) : (
                <Row k="Perfil" v="Convidado (catálogo local)" />
              )}
            </Section>

            {/* Rede + Catálogo lado a lado em telas largas */}
            <div className="grid gap-3 md:grid-cols-2">
              <Section icon={<Signal size={14} />} title="Rede & Cache">
                <Row k="Latência do proxy" v={ping < 0 ? '—' : `${ping} ms`} />
                <Row k="Cache local" v={`${cacheN} entradas`} />
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() => {
                      clearClientCache()
                      setCacheN(clientCacheCount())
                      toast.success('Cache local limpo')
                    }}
                    className="glass flex h-9 items-center gap-2 rounded-lg px-3.5 text-xs font-semibold text-white/80 hover:bg-white/12"
                  >
                    <Trash2 size={13} /> Limpar cache
                  </button>
                  <button
                    onClick={() => refreshUserData().then(() => toast.success('Dados recarregados'))}
                    className="glass flex h-9 items-center gap-2 rounded-lg px-3.5 text-xs font-semibold text-white/80 hover:bg-white/12"
                  >
                    <RefreshCw size={13} /> Recarregar
                  </button>
                </div>
              </Section>

              <Section icon={<Database size={14} />} title="Catálogo carregado">
                <p className="text-xs leading-relaxed text-white/60">{totals}</p>
                <p className="text-[11px] leading-relaxed text-white/35">
                  Catálogos ficam 6h no dispositivo e 10–30 min no servidor, acelerando a
                  navegação sem sobrecarregar o painel Xtream.
                </p>
              </Section>
            </div>

            {/* Controle parental */}
            <Section icon={<Shield size={14} />} title="Controle parental">
              {!pinSet ? (
                pinMode === 'setup' ? (
                  <div className="space-y-2.5">
                    <p className="text-xs text-white/60">
                      Crie um PIN de 4 dígitos. Ele será pedido ao reproduzir conteúdo +18.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="password"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="Novo PIN"
                        value={newPin}
                        onChange={(e) => setNewPin(digitsOnly(e.target.value))}
                        className="glass h-11 w-full rounded-xl bg-transparent px-3 text-center font-mono text-lg tracking-[0.4em] text-white placeholder:tracking-normal placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-emerald-400/60"
                        aria-label="Novo PIN"
                      />
                      <input
                        type="password"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="Confirmar"
                        value={confirmPin}
                        onChange={(e) => setConfirmPin(digitsOnly(e.target.value))}
                        onKeyDown={(e) => e.key === 'Enter' && savePin()}
                        className="glass h-11 w-full rounded-xl bg-transparent px-3 text-center font-mono text-lg tracking-[0.4em] text-white placeholder:tracking-normal placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-emerald-400/60"
                        aria-label="Confirmar PIN"
                      />
                    </div>
                    {pinError && <p className="text-[11px] font-semibold text-red-300">{pinError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={savePin}
                        className="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-500 px-4 text-xs font-bold text-black hover:bg-emerald-400"
                      >
                        <KeyRound size={13} /> Salvar PIN
                      </button>
                      <button
                        onClick={cancelPinFlow}
                        className="glass h-9 rounded-lg px-4 text-xs font-semibold text-white/70 hover:bg-white/12"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs leading-relaxed text-white/55">
                      Proteja o acesso ao conteúdo adulto com um PIN de 4 dígitos.
                    </p>
                    <button
                      onClick={() => {
                        setNewPin('')
                        setConfirmPin('')
                        setPinError(null)
                        setPinMode('setup')
                      }}
                      className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 text-xs font-bold text-black hover:bg-emerald-400"
                    >
                      <Lock size={13} /> Ativar
                    </button>
                  </div>
                )
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <Row k="Proteção" v="Ativa" />
                    <span
                      className={cn(
                        'flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider',
                        unlocked
                          ? 'bg-amber-500/15 text-amber-300'
                          : 'bg-emerald-500/15 text-emerald-300',
                      )}
                    >
                      {unlocked ? <Unlock size={10} /> : <Lock size={10} />}
                      {unlocked ? 'sessão liberada' : 'bloqueado'}
                    </span>
                  </div>

                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2.5">
                    <span className="flex items-center gap-2 text-xs font-semibold text-white/80">
                      <EyeOff size={13} className="text-white/50" />
                      Ocultar conteúdo +18 em todas as telas
                    </span>
                    <Switch checked={hideAdult} onCheckedChange={onToggleHide} />
                  </label>
                  <p className="text-[11px] leading-relaxed text-white/35">
                    Itens +18 desaparecem das linhas, da grade e da busca. Revelá-los de novo
                    exige o PIN.
                  </p>

                  {pinMode === 'confirm-pin' ? (
                    <div className="space-y-2 rounded-xl bg-black/30 p-3">
                      <p className="text-xs font-semibold text-white/75">
                        {pending === 'change'
                          ? 'Confirme o PIN atual para definir um novo'
                          : pending === 'disable'
                            ? 'Confirme o PIN atual para desativar a proteção'
                            : 'Confirme o PIN atual para revelar o conteúdo +18'}
                      </p>
                      <input
                        type="password"
                        inputMode="numeric"
                        autoFocus
                        autoComplete="off"
                        placeholder="PIN atual"
                        value={currentPin}
                        onChange={(e) => setCurrentPin(digitsOnly(e.target.value))}
                        onKeyDown={(e) => e.key === 'Enter' && confirmCurrentPin()}
                        className="glass h-11 w-full rounded-xl bg-transparent px-3 text-center font-mono text-lg tracking-[0.4em] text-white placeholder:tracking-normal placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-emerald-400/60"
                        aria-label="PIN atual"
                      />
                      {pinError && (
                        <p className="text-[11px] font-semibold text-red-300">{pinError}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={confirmCurrentPin}
                          className="flex h-9 items-center rounded-lg bg-emerald-500 px-4 text-xs font-bold text-black hover:bg-emerald-400"
                        >
                          Confirmar
                        </button>
                        <button
                          onClick={cancelPinFlow}
                          className="glass h-9 rounded-lg px-4 text-xs font-semibold text-white/70 hover:bg-white/12"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => requireCurrentPin('change')}
                        className="glass flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold text-white/80 hover:bg-white/12"
                      >
                        <KeyRound size={13} /> Alterar PIN
                      </button>
                      <button
                        onClick={() => requireCurrentPin('disable')}
                        className="glass flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold text-red-300 ring-1 ring-red-500/25 hover:bg-red-500/15"
                      >
                        <Unlock size={13} /> Desativar proteção
                      </button>
                      {unlocked && (
                        <button
                          onClick={() => {
                            lockAgain()
                            setUnlocked(false)
                            toast('Conteúdo +18 bloqueado novamente')
                          }}
                          className="glass flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold text-white/80 hover:bg-white/12"
                        >
                          <Lock size={13} /> Bloquear agora
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Section>

            {/* Atalhos + Sobre lado a lado em telas largas */}
            <div className="grid gap-3 md:grid-cols-2">
              <Section icon={<Keyboard size={14} />} title="Atalhos">
                <div className="grid grid-cols-1 gap-y-1 text-[11px] text-white/55 sm:grid-cols-2">
                  <span>Enter — Reproduzir</span>
                  <span>Esc — Voltar</span>
                  <span>F — Favorito</span>
                  <span>S — Buscar</span>
                  <span>D — Detalhes</span>
                  <span>G — Grade</span>
                  <span>E — Guia EPG</span>
                  <span>M — Mudo</span>
                  <span>◀ ▶ — ±10s (player)</span>
                  <span>Shift+◀ ▶ — ±30s</span>
                  <span>Espaço — Pausar</span>
                  <span>F (player) — Tela cheia</span>
                </div>
              </Section>

              <Section icon={<Info size={14} />} title="Sobre">
                <p className="text-[11px] leading-relaxed text-white/45">
                  Núcleo web em Next.js + hls.js. Conteúdos MKV/AVI são convertidos em tempo
                  real pelo servidor (ffmpeg). Empacotável para Android (APK via
                  Capacitor/TWA), Windows e Linux (Tauri/Electron).
                </p>
              </Section>
            </div>

            <button
              onClick={() => logout()}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-500/15 font-bold text-red-300 ring-1 ring-red-500/30 transition-all hover:bg-red-500/25 active:scale-[0.98]"
            >
              <LogOut size={16} /> Encerrar sessão
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl bg-black/25 p-3.5 ring-1 ring-white/8">
      <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-300">
        {icon}
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </section>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="shrink-0 text-white/40">{k}</span>
      <span className="max-w-[60%] truncate font-semibold text-white/80">{v}</span>
    </div>
  )
}
