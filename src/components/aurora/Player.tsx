'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Hls, { type Level } from 'hls.js'
import {
  ArrowLeft,
  Check,
  Cpu,
  Gauge,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Settings2,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { useAurora } from '@/lib/store'
import { loadEpgPrograms, loadSeriesInfo } from '@/lib/client'
import { isNativeDirect } from '@/lib/direct'
import {
  isDirectFile,
  needsTranscode,
  proxyStreamUrl,
  remuxStreamUrl,
  transcodeStreamUrl,
  type EpgProgram,
  type EpisodeItem,
  type PlayerStats,
} from '@/lib/types'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

/**
 * Toca o vídeo tratando AbortError/NotAllowedError.
 * O AbortError ("play() request was interrupted because the media was removed
 * from the document") ocorre quando a mídia é removida/trocada antes de play()
 * concluir — ex.: fechar o player durante o carregamento ou trocar de stream.
 * Não é uma falha real de reprodução: apenas ignoramos silenciosamente.
 */
function safePlay(video: HTMLVideoElement | null | undefined) {
  if (!video) return
  try {
    const p = video.play()
    p?.catch((err) => {
      const name = (err as DOMException)?.name
      if (name !== 'AbortError' && name !== 'NotAllowedError') {
        console.warn('[AuroraStream] play() falhou:', err)
      }
    })
  } catch {
    /* elemento sem mídia carregada — ignora */
  }
}

/**
 * Player HLS completo:
 * - hls.js com buffer agressivo (anti-travamento) e ABR adaptativo
 * - fallback nativo (Safari/iOS)
 * - retomada de posição (VOD), estatísticas de rede/buffer
 * - salvamento automático de progresso
 */
export function Player() {
  const player = useAurora((s) => s.player)!
  const closePlayer = useAurora((s) => s.closePlayer)
  const setBuffer = useAurora((s) => s.setBuffer)
  const persistProgress = useAurora((s) => s.persistProgress)

  const item = player.episode ? player.item : player.item
  const src = (player.episode?.streamUrl ?? player.item.streamUrl) || ''
  const isLive = item.type === 'live' && !player.episode
  /** APK nativo: sem servidor — as URLs brutas do painel são tocadas direto */
  const noServer = isNativeDirect()

  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaveRef = useRef(0)
  const triedDirectRef = useRef(false)
  const nativeFallbackRef = useRef(false)
  const nextEpRef = useRef<EpisodeItem | null>(null)
  const seekRef = useRef<HTMLDivElement>(null)
  const transcodeRef = useRef(false)
  /** modo atual da rota ffmpeg: remux (-c copy) ou transcode (x264) */
  const transcodeModeRef = useRef<'remux' | 'full'>('full')
  /** falhas fatais de rede do hls.js em canais ao vivo (escala p/ remux) */
  const liveFragFailRef = useRef(0)
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** ticker do overlay de buffering (progresso real do buffer) */
  const bufferTickerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  /** janelas extras de 45 s enquanto o upstream responder — evita erro prematuro */
  const transcodePatienceRef = useRef(2)

  const [ready, setReady] = useState(false)
  const [buffering, setBuffering] = useState(true)
  const [transcoding, setTranscoding] = useState(false)
  const [nextCountdown, setNextCountdown] = useState<number | null>(null)
  const [epgNow, setEpgNow] = useState<{ now?: EpgProgram; next?: EpgProgram }>({})
  const [audioTracks, setAudioTracks] = useState<{ id: number; label: string }[]>([])
  const [currentAudio, setCurrentAudio] = useState(-1)
  const [subs, setSubs] = useState<{ id: number; label: string }[]>([])
  const [currentSub, setCurrentSub] = useState(-1)
  const [showSettings, setShowSettings] = useState(false)
  const isVod = !isLive
  const startAt = player.startAt ?? 0
  const epId = player.episode?.id ?? null
  const [initKey, setInitKey] = useState(`${src}|${startAt}`)
  /** incrementado pelo "Tentar novamente" — refaz toda a cadeia de boot */
  const [retryNonce, setRetryNonce] = useState(0)
  if (initKey !== `${src}|${startAt}`) {
    // reset ao trocar de stream/posição (padrão derivado de render)
    setInitKey(`${src}|${startAt}`)
    setReady(false)
    setBuffering(true)
    setEpgNow({})
    setAudioTracks([])
    setCurrentAudio(-1)
    setSubs([])
    setCurrentSub(-1)
    setShowSettings(false)
    setTranscoding(false)
    setNextCountdown(null)
  }
  const [bufferPct, setBufferPct] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [bufferedEnd, setBufferedEnd] = useState(0)
  const [levels, setLevels] = useState<Level[]>([])
  const [currentLevel, setCurrentLevel] = useState(-1)
  const [nextEp, setNextEp] = useState<EpisodeItem | null>(null)
  const [dragging, setDragging] = useState(false)
  const [seekHover, setSeekHover] = useState({ pct: 0, visible: false })
  const [showStats, setShowStats] = useState(false)
  const [controls, setControls] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<PlayerStats>({
    bitrateKbps: 0,
    bufferSec: 0,
    level: '—',
    droppedFrames: 0,
    resolution: '—',
    latencySec: 0,
  })

  // ---------- cadeia de fallbacks de reprodução ----------
  /** Derruba o hls.js e passa a tocar o arquivo direto via <video> (proxy com Range) */
  const goNative = useCallback(
    (target?: string) => {
      const video = videoRef.current
      if (!video || nativeFallbackRef.current || noServer) return false
      nativeFallbackRef.current = true
      hlsRef.current?.destroy()
      hlsRef.current = null
      setLevels([])
      setCurrentLevel(-1)
      video.src = target ?? src
      // retomada de posição ("Continuar assistindo") em arquivos diretos —
      // MP4/WebM/MOV via <video> só aceitam seek depois do loadedmetadata;
      // sem isso o filme recomeçava do zero (hls.js e Safari já aplicavam)
      if (startAt > 0) {
        const seekResume = () => {
          try {
            const dur = video.duration
            video.currentTime = dur > 0 ? Math.min(startAt, Math.max(0, dur - 1)) : startAt
          } catch {
            /* noop */
          }
        }
        if (video.readyState >= 1) seekResume()
        else video.addEventListener('loadedmetadata', seekResume, { once: true })
      }
      safePlay(video)
      return true
    },
    [src, noServer, startAt],
  )

  /**
   * Rota ffmpeg (/api/transcode) em dois modos:
   *  - remux (-c copy): TV ao vivo e 4K — TS/HLS → fMP4 em tempo real, CPU ~zero.
   *    Antídoto ao "Bufferizando..." eterno (painéis que respondem ao .m3u8 com
   *    fluxo TS bruto/infinito que o hls.js jamais termina de baixar)
   *  - full (x264 720p): MKV/AVI/WMV/FLV/MPG e codecs exóticos
   * `ss` reinicia o ffmpeg no offset indicado — é assim que o seek funciona.
   */
  const startTranscode = useCallback(
    (ss = 0, mode: 'remux' | 'full' = 'full') => {
      const video = videoRef.current
      // APK nativo: não há ffmpeg server-side — sem transcode/remux
      if (!video || noServer) return false
      if (!transcodeRef.current) {
        transcodeRef.current = true
        setTranscoding(true)
        hlsRef.current?.destroy()
        hlsRef.current = null
        setLevels([])
        setCurrentLevel(-1)
      }
      transcodeModeRef.current = mode
      video.src = mode === 'remux' ? remuxStreamUrl(src) : transcodeStreamUrl(src, ss)
      safePlay(video)
      return true
    },
    [src, noServer],
  )

  /** Seek unificado: currentTime nativo ou reinício com -ss (transcodificado) */
  const performSeek = useCallback(
    (target: number) => {
      const v = videoRef.current
      if (!v) return
      const dur = v.duration
      const t = dur > 0 ? Math.max(0, Math.min(target, dur)) : Math.max(0, target)
      if (transcodeRef.current) {
        setCurrentTime(t)
        setBufferedEnd(t)
        startTranscode(Math.floor(t))
        return
      }
      v.currentTime = t
    },
    [startTranscode],
  )

  /**
   * Diagnóstico real do transcode: a rota só responde depois de receber (ou
   * desistir de) o 1º chunk do provedor — até 45 s. O fetch abaixo devolve a
   * CAUSA real (HTTP do painel, timeout do upstream, codec…) em vez de um
   * genérico "falhou". Timeout do fetch: 60 s.
   */
  const diagnoseTranscode = useCallback(
    async (ss = 0) => {
      try {
        const res = await fetch(transcodeStreamUrl(src, ss), {
          signal: AbortSignal.timeout(60_000), // a rota espera até 45 s pelo 1º chunk
          headers: { Range: 'bytes=0-0' },
        })
        if (res.ok) {
          setError(
            'O transcodificador respondeu, mas o vídeo não começou. Conexão instável com o provedor — tente novamente.',
          )
          return
        }
        const body = await res.text().catch(() => '')
        setError(
          body.slice(0, 240) ||
            `A transcodificação falhou (HTTP ${res.status}) — arquivo indisponível no provedor ou codec desconhecido.`,
        )
      } catch (err) {
        const msg =
          err instanceof Error && err.name === 'TimeoutError'
            ? 'O servidor do provedor não enviou dados a tempo (upstream lento ou offline).'
            : 'Não foi possível contatar o transcodificador do servidor.'
        setError(msg)
      }
    },
    [src],
  )

  // ---------- init HLS ----------
  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    const url = noServer ? src : proxyStreamUrl(src)
    // reseta a cadeia de fallback a cada novo stream
    triedDirectRef.current = false
    nativeFallbackRef.current = false
    transcodeRef.current = false
    transcodeModeRef.current = 'full'
    liveFragFailRef.current = 0
    transcodePatienceRef.current = 2

    // zera a posição herdada do stream anterior no elemento de mídia —
    // sem isso o próximo episódio começa no fim do anterior e 'ended'
    // dispara em cadeia, pulando episódios instantaneamente
    try {
      video.pause()
      video.currentTime = 0
    } catch {
      /* noop */
    }

    // boot assíncrono de arquivos diretos (mantém o lint set-state-in-effect limpo)
    let bootTimer: ReturnType<typeof setTimeout> | null = null

    // Arquivo direto (VOD .mp4/.mkv/...)? NÃO usar hls.js — playlist solta
    // nunca "parseava" e deixava o player girando em "Bufferizando 0%".
    const directFile = !isLive && isDirectFile(src)

    // Watchdog VOD: sem metadata → tenta transcodificar; já transcodificando →
    // até 2 janelas extras de 45 s enquanto o upstream estiver vivo; esgotado
    // isso → diagnóstico com a causa real em vez de spinner eterno
    const scheduleWatchdog = (ms: number) => {
      if (watchdogRef.current) clearTimeout(watchdogRef.current)
      watchdogRef.current = setTimeout(() => {
        const v = videoRef.current
        if (!v || v.readyState >= 1) return
        if (!isLive && !transcodeRef.current) {
          startTranscode(startAt)
          return
        }
        // AO VIVO: hls.js não entregou nem os metadados — no desktop escala para
        // o remux (`-c copy`, antídoto do "Bufferizando..."); no APK (sem
        // servidor) reporta o erro claramente
        if (isLive && !transcodeRef.current && startTranscode(0, 'remux')) {
          return
        }
        if (isLive && noServer) {
          setError(
            'O servidor do provedor não entregou vídeo a tempo (formato incomum ou stream offline).',
          )
          return
        }
        if (transcodeRef.current && transcodePatienceRef.current > 0) {
          transcodePatienceRef.current -= 1
          scheduleWatchdog(45_000)
          return
        }
        if (!isLive) {
          diagnoseTranscode(startAt)
        } else {
          setError('O servidor não enviou dados a tempo — stream offline, muito lento ou formato incomum.')
        }
      }, ms)
    }
    scheduleWatchdog(directFile ? 25_000 : isLive ? 20_000 : 35_000)

    if (!directFile && Hls.isSupported()) {
      const hls = new Hls({
        // ---- buffer anti-travamento ----
        // buffers mais profundos dão fôlego quando o painel responde devagar
        // (o proxy soma um salto de rede a cada segmento)
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 45,
        maxBufferLength: isLive ? 40 : 90,
        maxMaxBufferLength: isLive ? 120 : 600,
        maxBufferSize: 120 * 1000 * 1000,
        maxBufferHole: 0.5,
        highBufferWatchdogPeriod: 1,
        nudgeMaxRetry: 10,
        // ---- ABR ----
        // estimativa inicial conservadora: começa num nível que carrega de
        // verdade e sobe — evita o ciclo abrir/travar/abaixar/abrir
        abrEwmaDefaultEstimate: 1_000_000,
        abrBandWidthFactor: 0.85,
        abrBandWidthUpFactor: 0.7,
        startLevel: -1,
        capLevelToPlayerSize: true,
        // pré-busca do próximo fragmento enquanto o atual é anexado —
        // fecha a brecha entre segmentos (travadas a cada 2 s em live)
        startFragPrefetch: true,
        // ---- resiliência ----
        fragLoadingMaxRetry: 10,
        fragLoadingRetryDelay: 500,
        fragLoadingMaxRetryTimeout: 8000,
        manifestLoadingMaxRetry: 8,
        manifestLoadingRetryDelay: 500,
        levelLoadingMaxRetry: 8,
      })
      hlsRef.current = hls
      hls.attachMedia(video)
      hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(url))
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        setLevels(data.levels ?? [])
        setReady(true)
        if (!isLive) video.currentTime = startAt
        safePlay(video)
      })
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
        setCurrentLevel(data.level)
        const lv = hls.levels[data.level]
        if (lv) {
          setStats((s) => ({
            ...s,
            level: lv.height ? `${lv.height}p` : `${lv.bitrate / 1000}k`,
            bitrateKbps: Math.round(lv.bitrate / 1000),
            resolution: lv.width && lv.height ? `${lv.width}×${lv.height}` : '—',
          }))
        }
      })
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        // fragmento carregou: recupera a confiança na rota HLS —
        // sem este reset, falhas esparsas acumulavam e trocavam p/ remux
        // desnecessariamente no meio de uma sessão ao vivo saudável
        liveFragFailRef.current = 0
        const b = video.buffered
        if (b.length > 0) {
          const len = Math.max(0, b.end(b.length - 1) - video.currentTime)
          setStats((s) => ({
            ...s,
            bufferSec: Math.round(len),
            latencySec: Math.round(len * 10) / 10,
          }))
        }
      })
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
        setAudioTracks((hls.audioTracks ?? []).map((t, i) => ({ id: t.id ?? i, label: t.name || t.lang || `Áudio ${i + 1}` })))
        setCurrentAudio(hls.audioTrack)
      })
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_e, data) => setCurrentAudio(data.id))
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_e, data) => {
        setSubs((data.subtitleTracks ?? []).map((t, i) => ({ id: t.id ?? i, label: t.name || t.lang || `Legenda ${i + 1}` })))
        setCurrentSub(hls.subtitleTrack)
      })
      hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, (_e, data) => setCurrentSub(data.id))
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR: {
            // Falhas de MANIFEST (rede ou parse — ex.: arquivo .mp4 puro que o
            // hls.js não entende como playlist) acionam a cadeia de fallback:
            const manifestFail =
              data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
              data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT ||
              data.details === Hls.ErrorDetails.MANIFEST_PARSING_ERROR
            if (manifestFail) {
              // 1ª alternativa: URL direta sem o proxy (painéis com CORS liberado)
              if (!triedDirectRef.current && !isDirectFile(src) && !noServer) {
                triedDirectRef.current = true
                hls.loadSource(src)
                return
              }
              // AO VIVO: <video> progressivo não toca TS bruto — vá ao remux
              // (c copy, serve até 4K) antes do transcode pesado
              if (isLive && startTranscode(0, 'remux')) return
              // 2ª alternativa: reprodução nativa progressiva via proxy (Range)
              if (goNative(url)) return
              // 3ª alternativa: transcodificação ffmpeg (x264)
              if (startTranscode(0)) return
              // esgotou: mensagem clara para o usuário
              setError('Não foi possível carregar o stream do servidor. Verifique sua conexão ou o status do painel.')
              return
            }
            // falha em segmento (não-manifest): recupera; ao vivo, se persistir,
            // escala para o remux em vez de girar indefinidamente
            if (isLive) {
              liveFragFailRef.current += 1
              if (liveFragFailRef.current >= 2 && startTranscode(0, 'remux')) return
            }
            // tenta recuperar automaticamente
            hls.startLoad()
            break
          }
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError()
            break
          default:
            setError(`Erro de reprodução: ${data.details}`)
        }
      })
    } else if (!directFile && video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari / iOS nativo (HLS)
      video.src = url
      const onLoaded = () => {
        setReady(true)
        if (startAt > 0 && !isLive) video.currentTime = startAt
        safePlay(video)
      }
      video.addEventListener('loadedmetadata', onLoaded, { once: true })
    } else {
      // arquivo direto: MKV/AVI/WMV/FLV/MPG → ffmpeg; MP4/WebM/MOV → <video>
      bootTimer = setTimeout(() => {
        if (needsTranscode(src)) startTranscode(startAt)
        else goNative(url)
      }, 0)
    }

    return () => {
      if (watchdogRef.current) clearTimeout(watchdogRef.current)
      if (bootTimer) clearTimeout(bootTimer)
      if (bufferTickerRef.current) {
        clearInterval(bufferTickerRef.current)
        bufferTickerRef.current = null
      }
      hlsRef.current?.destroy()
      hlsRef.current = null
      // libera a mídia antes de o elemento sair do DOM — elimina o AbortError
      // de play() pendente ("media was removed from the document")
      try {
        video.pause()
        video.removeAttribute('src')
        video.load()
      } catch {
        /* noop */
      }
    }
  }, [src, isLive, startAt, goNative, startTranscode, diagnoseTranscode, retryNonce])

  // ---------- eventos do vídeo ----------
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onTime = () => {
      setCurrentTime(video.currentTime)
      let bufLen = 0
      if (video.buffered.length > 0) {
        setBufferedEnd(video.buffered.end(video.buffered.length - 1))
        bufLen = video.buffered.end(video.buffered.length - 1) - video.currentTime
        setBuffer(Math.max(0, bufLen))
      }
      const q = video.getVideoPlaybackQuality?.()
      setStats((s) => ({
        ...s,
        bufferSec: Math.max(0, Math.round(bufLen)),
        latencySec: Math.round((video.buffered.length ? video.buffered.end(video.buffered.length - 1) - video.currentTime : 0) * 10) / 10,
        droppedFrames: q?.droppedVideoFrames ?? s.droppedFrames,
      }))
      // salvar progresso a cada 10s (VOD)
      if (isVod && video.duration > 0 && Date.now() - lastSaveRef.current > 10_000) {
        lastSaveRef.current = Date.now()
        persistProgress({
          item: player.item,
          positionSec: video.currentTime,
          durationSec: video.duration,
          episode: player.episode,
        })
      }
    }
    const onMeta = () => {
      setDuration(video.duration || 0)
      setStats((s) => ({
        ...s,
        resolution: video.videoWidth ? `${video.videoWidth}×${video.videoHeight}` : '—',
      }))
      // fallback nativo: lista legendas embutidas via textTracks
      if (nativeFallbackRef.current) {
        const tts: { id: number; label: string }[] = []
        for (let i = 0; i < video.textTracks.length; i++) {
          const tt = video.textTracks[i]
          if (tt.kind === 'subtitles' || tt.kind === 'captions') {
            tts.push({ id: i, label: tt.label || tt.language || `Legenda ${tts.length + 1}` })
          }
        }
        setSubs(tts)
      }
    }
    const onVideoError = () => {
      if (transcodeRef.current) {
        // remux falhou (codec não copiável p/ MP4, p.ex.) → escala p/ transcode
        if (transcodeModeRef.current === 'remux' && startTranscode(0, 'full')) return
        setError('A transcodificação falhou — diagnóstico em andamento…')
        diagnoseTranscode(0)
        return
      }
      // erro do <video> na reprodução nativa (ex.: MKV/AVI) → transcodifica
      if (!hlsRef.current && startTranscode(0)) return
      setError('Formato não suportado pelo navegador ou stream indisponível.')
    }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    /**
     * Bufferização com progresso REAL (buffer à frente do playhead / alvo).
     * v1.7 usava um contador fake (+7% a cada 150 ms) que enchia em ~2 s e
     * criava um setInterval NOVO a cada evento "waiting" sem nunca limpar os
     * anteriores (o retorno de um listener é descartado) — o resultado era o
     * looping de "Bufferizando… a cada 2 segundos" e intervalos zumbis
     * re-renderizando o player para sempre.
     */
    const BUFFER_TARGET_SEC = 30
    const stopBufferTicker = () => {
      if (bufferTickerRef.current) {
        clearInterval(bufferTickerRef.current)
        bufferTickerRef.current = null
      }
    }
    const startBufferTicker = () => {
      stopBufferTicker()
      // progresso imediato com o buffer já existente
      const ahead0 = video.buffered.length
        ? video.buffered.end(video.buffered.length - 1) - video.currentTime
        : 0
      setBufferPct(Math.max(0, Math.min(95, Math.round((ahead0 / BUFFER_TARGET_SEC) * 100))))
      bufferTickerRef.current = setInterval(() => {
        if (video.readyState >= 3 && !video.paused) {
          stopBufferTicker()
          setBuffering(false)
          return
        }
        const ahead = video.buffered.length
          ? video.buffered.end(video.buffered.length - 1) - video.currentTime
          : 0
        const pct = Math.max(0, Math.min(95, Math.round((ahead / BUFFER_TARGET_SEC) * 100)))
        setBufferPct((p) => (pct > p || p >= 95 ? pct : p))
      }, 200)
    }
    const onWaiting = () => {
      setBuffering(true)
      startBufferTicker()
    }
    // download de dados do <video> nativo (VOD direto) — avança o % do overlay
    const onProgressEvt = () => {
      if (!bufferTickerRef.current) return
      const ahead = video.buffered.length
        ? video.buffered.end(video.buffered.length - 1) - video.currentTime
        : 0
      const pct = Math.max(0, Math.min(95, Math.round((ahead / BUFFER_TARGET_SEC) * 100)))
      setBufferPct((p) => (pct > p || p >= 95 ? pct : p))
    }
    const onPlaying = () => {
      stopBufferTicker()
      setBuffering(false)
      setBufferPct(100)
    }
    const onCanPlay = () => {
      stopBufferTicker()
      setBuffering(false)
    }
    const onEnded = () => {
      if (isVod && video.duration > 0) {
        persistProgress({
          item: player.item,
          positionSec: video.duration,
          durationSec: video.duration,
          episode: player.episode,
        })
      }
      // fim do episódio: contagem regressiva "Próximo em 5s" (cancelável)
      if (nextEpRef.current) {
        setNextCountdown(5)
        setControls(true)
        return
      }
      if (player.episode) toast('Fim da série', { description: player.item.title })
      closePlayer()
    }
    const onVol = () => {
      setMuted(video.muted)
      setVolume(video.volume)
    }

    video.addEventListener('timeupdate', onTime)
    video.addEventListener('loadedmetadata', onMeta)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('progress', onProgressEvt)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('ended', onEnded)
    video.addEventListener('volumechange', onVol)
    video.addEventListener('error', onVideoError)
    return () => {
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('loadedmetadata', onMeta)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('progress', onProgressEvt)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('volumechange', onVol)
      video.removeEventListener('error', onVideoError)
      // nunca deixar intervalos zumbis re-renderizando o player
      stopBufferTicker()
    }
  }, [isVod, persistProgress, player, closePlayer, setBuffer, diagnoseTranscode, startTranscode])

  // ---------- salvar progresso ao sair ----------
  useEffect(() => {
    return () => {
      const video = videoRef.current
      if (video && isVod && video.duration > 0 && video.currentTime > 5) {
        useAurora.getState().persistProgress({
          item: useAurora.getState().player?.item ?? item,
          positionSec: video.currentTime,
          durationSec: video.duration,
          episode: useAurora.getState().player?.episode,
        })
      }
      useAurora.getState().setBuffer(0)
    }
  }, [])

  // ---------- auto-hide controles ----------
  const pokeControls = useCallback(() => {
    setControls(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      if (!videoRef.current?.paused) setControls(false)
    }, 3200)
  }, [])
  useEffect(() => {
    hideTimer.current = setTimeout(() => {
      if (!videoRef.current?.paused) setControls(false)
    }, 3200)
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [])

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      el.requestFullscreen().catch(() => {})
    }
  }, [])

  // ---------- teclado ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const video = videoRef.current
      if (!video) return
      switch (e.key) {
        case 'Escape':
          // Esc cancela a contagem do próximo episódio antes de fechar o player
          if (nextCountdown != null) setNextCountdown(null)
          else closePlayer()
          break
        case ' ':
          e.preventDefault()
          if (video.paused) safePlay(video)
          else video.pause()
          break
        case 'ArrowLeft':
          if (!isLive) performSeek(video.currentTime - (e.shiftKey ? 30 : 10))
          break
        case 'ArrowRight':
          if (!isLive) performSeek(video.currentTime + (e.shiftKey ? 30 : 10))
          break
        case 'ArrowUp':
          video.volume = Math.min(1, video.volume + 0.1)
          break
        case 'ArrowDown':
          video.volume = Math.max(0, video.volume - 0.1)
          break
        case 'm':
        case 'M':
          video.muted = !video.muted
          break
        case 'f':
        case 'F':
          toggleFullscreen()
          break
        case 's':
        case 'S':
          setShowStats((v) => !v)
          break
      }
      pokeControls()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closePlayer, isLive, nextCountdown, performSeek, pokeControls, toggleFullscreen])

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  // ---------- contagem regressiva do próximo episódio ----------
  useEffect(() => {
    if (nextCountdown == null) return
    const t = setTimeout(() => {
      if (nextCountdown <= 1) {
        const nx = nextEpRef.current
        setNextCountdown(null)
        if (nx) useAurora.getState().play(player.item, nx, 0)
      } else {
        setNextCountdown(nextCountdown - 1)
      }
    }, 1000)
    return () => clearTimeout(t)
  }, [nextCountdown, player.item])

  // ---------- player aberto: trava a rolagem da página (sem barras fantasmas) ----------
  useEffect(() => {
    document.documentElement.classList.add('player-open')
    return () => document.documentElement.classList.remove('player-open')
  }, [])

  // ---------- mini-EPG "Agora / A seguir" (canais ao vivo) ----------
  // Usa o cache de EPG do cliente (10 min) — custo zero após a 1ª carga.
  useEffect(() => {
    if (!isLive) return
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null
    loadEpgPrograms(item)
      .then((programs) => {
        if (cancelled || programs.length === 0) return
        const compute = () => {
          const t = Date.now()
          const now = programs.find((p) => t >= p.start && t < p.end)
          const next = programs.find((p) => p.start >= (now?.end ?? t))
          setEpgNow({ now, next })
        }
        compute()
        timer = setInterval(compute, 60_000)
      })
      .catch(() => {
        /* canal sem EPG — mantém a linha padrão "Transmissão ao vivo" */
      })
    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [isLive, item])

  const fmt = (sec: number) => {
    if (!Number.isFinite(sec) || sec <= 0) return '00:00'
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = Math.floor(sec % 60)
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const fmtHora = (ts: number) =>
    new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  // ---------- próximo episódio (autoplay ao terminar + botão "Próximo") ----------
  const wantedEpKey = item.type === 'series' ? epId : null
  const [loadedEpKey, setLoadedEpKey] = useState<string | null>(null)
  if (loadedEpKey !== wantedEpKey) {
    // troca de item/episódio: limpa o "próximo" até o efeito recarregar
    setLoadedEpKey(wantedEpKey)
    setNextEp(null)
  }
  useEffect(() => {
    nextEpRef.current = null
    if (!wantedEpKey) return
    let alive = true
    loadSeriesInfo(item, item.source)
      .then((d) => {
        if (!alive) return
        // lista plana ordenada: temporadas em ordem, episódios por número
        const flat: EpisodeItem[] = []
        for (const s of [...(d.seasons ?? [])].sort((a, b) => a - b)) {
          flat.push(...[...(d.episodes?.[s] ?? [])].sort((a, b) => a.num - b.num))
        }
        const idx = flat.findIndex((e) => e.id === wantedEpKey)
        const nx = idx >= 0 ? (flat[idx + 1] ?? null) : null
        setNextEp(nx)
        nextEpRef.current = nx
      })
      .catch(() => {
        /* sem info de série — sem autoplay */
      })
    return () => {
      alive = false
    }
  }, [item, wantedEpKey])

  // ---------- seleção de legendas (hls.js ou textTracks nativas) ----------
  const selectSub = (id: number) => {
    const video = videoRef.current
    if (hlsRef.current) {
      hlsRef.current.subtitleTrack = id
      setCurrentSub(id)
      return
    }
    if (!video) return
    for (let i = 0; i < video.textTracks.length; i++) {
      const tt = video.textTracks[i]
      if (tt.kind === 'subtitles' || tt.kind === 'captions') tt.mode = i === id ? 'showing' : 'disabled'
    }
    setCurrentSub(id)
  }
  const disableSubs = () => {
    const video = videoRef.current
    if (hlsRef.current) {
      hlsRef.current.subtitleTrack = -1
      setCurrentSub(-1)
      return
    }
    if (!video) return
    for (const tt of Array.from(video.textTracks)) {
      if (tt.kind === 'subtitles' || tt.kind === 'captions') tt.mode = 'disabled'
    }
    setCurrentSub(-1)
  }

  // ---------- seek arrastável ----------
  const seekToClientX = (clientX: number) => {
    const el = seekRef.current
    const video = videoRef.current
    if (!el || !video || !(duration > 0)) return
    const rect = el.getBoundingClientRect()
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    performSeek(pct * duration)
  }

  const seekPct = duration > 0 ? (currentTime / duration) * 100 : 0
  const bufPct = duration > 0 ? (bufferedEnd / duration) * 100 : 0

  const title = player.episode
    ? `${item.title} — T${player.episode.season}:E${player.episode.num} ${player.episode.title}`
    : item.title

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black"
      onMouseMove={pokeControls}
      onClick={pokeControls}
    >
      <video
        ref={videoRef}
        playsInline
        autoPlay
        preload="auto"
        className="block h-full w-full object-contain"
        onClick={(e) => {
          e.stopPropagation()
          const v = videoRef.current
          if (v) {
            if (v.paused) safePlay(v)
            else v.pause()
          }
          pokeControls()
        }}
      />

      {/* ---------- Buffering ---------- */}
      {buffering && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/55 backdrop-blur-sm">
          <Loader2 className="h-12 w-12 animate-spin text-emerald-400" />
          <p className="text-sm font-semibold text-white/80">Bufferizando… {bufferPct < 95 ? `${bufferPct}%` : ''}</p>
          <p className="text-xs text-white/40">{title}</p>
        </div>
      )}

      {/* ---------- Erro ---------- */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6">
          <div className="glass max-w-md rounded-2xl p-6 text-center">
            <p className="mb-2 text-sm font-bold text-red-300">Falha na reprodução</p>
            <p className="text-sm leading-relaxed text-white/70">{error}</p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                onClick={() => {
                  // retry de verdade: re-executa o efeito de init (nonce), que
                  // recria hls.js e refaz a cadeia HLS → direto → remux → transcode.
                  // (o antigo só chamava hls.startLoad(), inócuo quando o hls.js
                  // já havia sido destruído pelas rotas nativa/transcode)
                  setError(null)
                  setBuffering(true)
                  setBufferPct(0)
                  setRetryNonce((n) => n + 1)
                }}
                className="glass flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold hover:bg-white/12"
              >
                <RotateCcw size={15} /> Tentar novamente
              </button>
              <button
                onClick={closePlayer}
                className="flex h-10 items-center rounded-xl bg-emerald-500 px-4 text-sm font-bold text-black hover:bg-emerald-400"
              >
                Voltar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Barra superior ---------- */}
      <AnimatePresence>
        {controls && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="glass absolute inset-x-0 top-0 flex items-center gap-3 border-x-0 border-t-0 px-4 py-2.5"
          >
            <button
              onClick={closePlayer}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/8 transition-all hover:bg-white/15"
              aria-label="Voltar"
            >
              <ArrowLeft size={17} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">{title}</p>
              {isLive && epgNow.now ? (
                <p className="truncate text-[11px] text-white/45">
                  <span className="font-black tracking-wide text-emerald-300">AGORA</span>{' '}
                  {epgNow.now.title}
                  {epgNow.next && (
                    <span className="text-white/30">
                      {' '}· A seguir: {epgNow.next.title} · {fmtHora(epgNow.next.start)}
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-[11px] text-white/45">
                  {isLive ? 'Transmissão ao vivo' : 'Sob demanda'} · proxy AuroraStream · HLS
                </p>
              )}
            </div>
            {isLive && (
              <span className="flex items-center gap-1.5 rounded-md bg-red-600 px-2 py-1 text-[10px] font-black tracking-widest text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                AO VIVO
              </span>
            )}
            {transcoding && (
              <span className="flex items-center gap-1.5 rounded-md bg-amber-500/20 px-2 py-1 text-[10px] font-black tracking-widest text-amber-300 ring-1 ring-amber-400/30">
                <Cpu size={11} className="animate-pulse" />
                TRANSCODIFICANDO
              </span>
            )}
            <button
              onClick={() => setShowStats((v) => !v)}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-lg transition-all',
                showStats ? 'bg-emerald-500/25 text-emerald-300' : 'bg-white/8 hover:bg-white/15',
              )}
              aria-label="Estatísticas"
            >
              <Gauge size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- Estatísticas ---------- */}
      {showStats && (
        <div className="glass absolute right-4 top-16 z-10 w-60 rounded-xl p-3.5 font-mono text-[11px] leading-relaxed text-white/75">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
            Estatísticas de reprodução
          </p>
          <Row k="Resolução" v={stats.resolution} />
          <Row k="Qualidade" v={stats.level} />
          <Row k="Bitrate" v={`${stats.bitrateKbps} kbps`} />
          <Row k="Buffer" v={`${stats.bufferSec} s`} />
          <Row k="Latência" v={`${stats.latencySec} s`} />
          <Row k="Frames perdidos" v={String(stats.droppedFrames)} />
          <p className="mt-2 border-t border-white/10 pt-2 text-[10px] text-white/40">
            ABR automático · buffer-alvo {isLive ? '30s' : '60s'}
          </p>
        </div>
      )}

      {/* ---------- Ajustes: qualidade, áudio e legendas ---------- */}
      {showSettings && (levels.length > 1 || audioTracks.length > 1 || subs.length > 0) && (
        <div className="glass aurora-scroll absolute bottom-24 right-4 z-10 max-h-72 w-60 overflow-y-auto rounded-xl p-3">
          {levels.length > 1 && (
            <>
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-300">
                Qualidade
              </p>
              <Opt
                active={currentLevel === -1}
                onClick={() => {
                  if (hlsRef.current) hlsRef.current.currentLevel = -1
                  setCurrentLevel(-1)
                  setShowSettings(false)
                }}
              >
                Auto (ABR)
              </Opt>
              {levels.map((lv, i) => (
                <Opt
                  key={i}
                  active={currentLevel === i}
                  onClick={() => {
                    if (hlsRef.current) hlsRef.current.currentLevel = i
                    setCurrentLevel(i)
                    setShowSettings(false)
                  }}
                >
                  {lv.height ? `${lv.height}p` : `${Math.round(lv.bitrate / 1000)}k`}
                </Opt>
              ))}
            </>
          )}
          {audioTracks.length > 1 && (
            <>
              <p className="mb-1.5 mt-3 text-[10px] font-black uppercase tracking-widest text-emerald-300">
                Áudio
              </p>
              {audioTracks.map((t) => (
                <Opt
                  key={t.id}
                  active={currentAudio === t.id}
                  onClick={() => {
                    if (hlsRef.current) hlsRef.current.audioTrack = t.id
                    setCurrentAudio(t.id)
                    setShowSettings(false)
                  }}
                >
                  {t.label}
                </Opt>
              ))}
            </>
          )}
          {subs.length > 0 && (
            <>
              <p className="mb-1.5 mt-3 text-[10px] font-black uppercase tracking-widest text-emerald-300">
                Legendas
              </p>
              <Opt
                active={currentSub === -1}
                onClick={() => {
                  disableSubs()
                  setShowSettings(false)
                }}
              >
                Desativadas
              </Opt>
              {subs.map((t) => (
                <Opt
                  key={t.id}
                  active={currentSub === t.id}
                  onClick={() => {
                    selectSub(t.id)
                    setShowSettings(false)
                  }}
                >
                  {t.label}
                </Opt>
              ))}
            </>
          )}
        </div>
      )}

      {/* ---------- Próximo episódio (contagem regressiva cancelável) ---------- */}
      {nextCountdown != null && nextEp && (
        <div className="absolute inset-x-0 bottom-24 z-20 flex justify-center px-4">
          <div className="glass-strong w-full max-w-md rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 ring-2 ring-emerald-400/40">
                <span className="text-lg font-black text-emerald-300">{nextCountdown}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                  Próximo episódio
                </p>
                <p className="truncate text-sm font-bold text-white">
                  T{nextEp.season}:E{nextEp.num} · {nextEp.title}
                </p>
              </div>
              <button
                onClick={() => useAurora.getState().play(player.item, nextEp, 0)}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 text-xs font-bold text-black hover:bg-emerald-400"
              >
                <Play size={13} className="fill-black" /> Assistir agora
              </button>
              <button
                onClick={() => setNextCountdown(null)}
                className="glass h-9 shrink-0 rounded-xl px-3.5 text-xs font-semibold text-white/80 hover:bg-white/12"
              >
                Cancelar
              </button>
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-emerald-400 transition-[width] duration-1000 ease-linear"
                style={{ width: `${(nextCountdown / 5) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ---------- Controles inferiores ---------- */}
      <AnimatePresence>
        {controls && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="glass absolute inset-x-0 bottom-0 border-x-0 border-b-0 px-4 pb-3 pt-2 md:px-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* seek arrastável com pré-visualização de tempo */}
            {!isLive && (
              <div
                ref={seekRef}
                className="group relative mb-2.5 h-5 cursor-pointer touch-none"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId)
                  setDragging(true)
                  seekToClientX(e.clientX)
                }}
                onPointerMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
                  setSeekHover({ pct, visible: true })
                  if (dragging) seekToClientX(e.clientX)
                }}
                onPointerUp={() => setDragging(false)}
                onPointerCancel={() => setDragging(false)}
                onPointerLeave={() => setSeekHover((h) => ({ ...h, visible: false }))}
              >
                <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 overflow-hidden rounded-full bg-white/12">
                  <div className="h-full bg-white/25" style={{ width: `${bufPct}%` }} />
                </div>
                <div
                  className={cn(
                    'absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-emerald-400 transition-[width]',
                    dragging ? 'duration-0' : 'duration-150',
                  )}
                  style={{ width: `${seekPct}%` }}
                />
                <div
                  className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-emerald-400 opacity-0 shadow transition-opacity group-hover:opacity-100"
                  style={{ left: `calc(${seekPct}% - 7px)` }}
                />
                {seekHover.visible && duration > 0 && (
                  <span
                    className="glass-strong pointer-events-none absolute -top-7 -translate-x-1/2 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold text-white/90"
                    style={{ left: `${seekHover.pct * 100}%` }}
                  >
                    {fmt(seekHover.pct * duration)}
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 md:gap-3">
              <Ctl
                onClick={() => {
                  const v = videoRef.current
                  if (!v) return
                  if (v.paused) safePlay(v)
                  else v.pause()
                }}
                label={playing ? 'Pausar' : 'Reproduzir'}
              >
                {playing ? <Pause size={19} className="fill-current" /> : <Play size={19} className="fill-current" />}
              </Ctl>
              {!isLive && (
                <>
                  <Ctl
                    onClick={() => {
                      const v = videoRef.current
                      if (v) performSeek(v.currentTime - 30)
                    }}
                    label="-30s"
                  >
                    <span className="relative flex items-center">
                      <RotateCcw size={17} />
                      <span className="absolute inset-0 flex items-center justify-center text-[7px] font-black">30</span>
                    </span>
                  </Ctl>
                  <Ctl
                    onClick={() => {
                      const v = videoRef.current
                      if (v) performSeek(v.currentTime - 10)
                    }}
                    label="-10s"
                  >
                    <RotateCcw size={17} />
                  </Ctl>
                  <Ctl
                    onClick={() => {
                      const v = videoRef.current
                      if (v) performSeek(v.currentTime + 10)
                    }}
                    label="+10s"
                  >
                    <RotateCw size={17} />
                  </Ctl>
                  <Ctl
                    onClick={() => {
                      const v = videoRef.current
                      if (v) performSeek(v.currentTime + 30)
                    }}
                    label="+30s"
                  >
                    <span className="relative flex items-center">
                      <RotateCw size={17} />
                      <span className="absolute inset-0 flex items-center justify-center text-[7px] font-black">30</span>
                    </span>
                  </Ctl>
                  {nextEp && (
                    <Ctl
                      onClick={() => useAurora.getState().play(player.item, nextEp, 0)}
                      label={`Próximo: T${nextEp.season}:E${nextEp.num} ${nextEp.title}`}
                    >
                      <SkipForward size={17} />
                    </Ctl>
                  )}
                </>
              )}
              <div className="group flex items-center gap-1.5">
                <Ctl onClick={() => { if (videoRef.current) videoRef.current.muted = !videoRef.current.muted }} label="Mudo">
                  {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
                </Ctl>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    if (videoRef.current) {
                      videoRef.current.volume = v
                      videoRef.current.muted = v === 0
                    }
                  }}
                  className="aurora-range w-16 md:w-24"
                  aria-label="Volume"
                />
              </div>

              <span className="ml-1 font-mono text-xs text-white/60">
                {fmt(currentTime)} <span className="text-white/30">/ {isLive ? 'ao vivo' : fmt(duration)}</span>
              </span>

              <div className="ml-auto flex items-center gap-1.5 md:gap-2.5">
                {(levels.length > 1 || audioTracks.length > 1 || subs.length > 0) && (
                  <button
                    onClick={() => setShowSettings((v) => !v)}
                    className="glass-strong flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-white/80 transition-all hover:bg-white/15"
                  >
                    <Settings2 size={15} />
                    {currentLevel !== -1 && levels[currentLevel]?.height
                      ? `${levels[currentLevel].height}p`
                      : 'Ajustes'}
                  </button>
                )}
                <Ctl onClick={() => videoRef.current?.requestPictureInPicture?.().catch(() => {})} label="PiP">
                  <PictureInPicture2 size={16} />
                </Ctl>
                <Ctl onClick={toggleFullscreen} label="Tela cheia">
                  {fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
                </Ctl>
                <Ctl onClick={closePlayer} label="Fechar">
                  <X size={17} />
                </Ctl>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function Ctl({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode
  onClick: () => void
  label: string
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-white/85 transition-all hover:bg-white/12 hover:text-white active:scale-90"
    >
      {children}
    </button>
  )
}

function Opt({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
        active ? 'bg-emerald-500/20 text-emerald-300' : 'text-white/70 hover:bg-white/8',
      )}
    >
      {children}
      {active && <Check size={12} />}
    </button>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-white/40">{k}</span>
      <span className="font-semibold">{v}</span>
    </div>
  )
}
