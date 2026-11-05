import { NextRequest, NextResponse } from 'next/server'
import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'
import { requireAccount, SessionError } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const UA = 'AuroraStream/1.0 (IPTV Player; like VLC/3.0.20)'

/** ffmpeg embutido no desktop (AURORA_FFMPEG) ou do PATH do servidor */
function ffmpegBin(): string {
  const fromEnv = process.env.AURORA_FFMPEG?.trim()
  return fromEnv || 'ffmpeg'
}

/**
 * Transcodificação/remux sob demanda (fallback de compatibilidade):
 *
 * Navegadores não reproduzem Matroska (.mkv), AVI, WMV, FLV ou MPG — containers
 * legados comuns em catálogos IPTV. Esta rota invoca o ffmpeg do servidor para
 * converter o arquivo para fMP4 (H.264 + AAC) e transmite o resultado em
 * streaming progressivo, tocável pelo <video> nativo.
 *
 * Dois modos:
 *  - mode=transcode (padrão): reencoda x264 720p — para MKV/AVI e codecs exóticos
 *  - mode=remux: `-c copy` (sem reencodar) — converte TS/HLS→fMP4 em tempo real
 *    com CPU ~zero. É o antídoto ao "Bufferizando..." eterno em TV ao vivo:
 *    painéis IPTV costumam responder ao .m3u8 com fluxo TS bruto/infinito que o
 *    hls.js jamais termina de baixar, e o remux entrega até canais 4K
 *
 * Parâmetros:
 *  - u    : URL de origem (http/https)
 *  - ss   : offset inicial em segundos (seek por reinício do ffmpeg)
 *  - mode : remux | transcode
 *
 * Resolução do ffmpeg: variável AURORA_FFMPEG (binário embutido no app
 * desktop) → "ffmpeg" no PATH (servidor Linux com apt install ffmpeg).
 *
 * Robustez contra servidores IPTV lentos:
 *  - reconexão automática em falhas de rede e em HTTP 429/5xx
 *  - análise reduzida (2 MB) — o TTFB de MP4/MKV gigantes era o gargalo
 *  - rw_timeout de 20 s detecta travamentos do upstream no meio do fluxo
 *  - espera de até 45 s pelo primeiro chunk antes de declarar falha
 */

export async function GET(req: NextRequest) {
  try {
    await requireAccount()
  } catch (err) {
    if (err instanceof SessionError) {
      return new NextResponse('Sessão expirada', { status: 401 })
    }
    return new NextResponse('Erro de sessão', { status: 500 })
  }

  const raw = req.nextUrl.searchParams.get('u')
  if (!raw) return new NextResponse('Parâmetro u ausente', { status: 400 })

  let target: URL
  try {
    target = new URL(raw)
  } catch {
    return new NextResponse('URL inválida', { status: 400 })
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return new NextResponse('Protocolo não suportado', { status: 400 })
  }

  const ssRaw = Number(req.nextUrl.searchParams.get('ss') ?? '0')
  const ss = Number.isFinite(ssRaw) && ssRaw > 0 ? Math.floor(ssRaw) : 0
  const mode = req.nextUrl.searchParams.get('mode') === 'remux' ? 'remux' : 'transcode'

  // ---- saída ----
  // remux: stream copy — zero CPU, latência ~1 keyframe, serve 4K
  // transcode: x264 ultrafast 720p — compatibilidade máxima (codecs exóticos)
  const outArgs =
    mode === 'remux'
      ? [
          '-c', 'copy',
          // timestamps de TS ao vivo costumam vir desordenados — regenera
          '-fflags', '+genpts',
          '-max_muxing_queue_size', '1024',
          '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
          '-f', 'mp4',
          'pipe:1',
        ]
      : [
          '-map', '0:v:0',
          '-map', '0:a:0?',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-tune', 'zerolatency',
          '-crf', '26',
          '-vf', "scale=-2:'min(720,ih)'",
          '-c:a', 'aac',
          '-ac', '2',
          '-b:a', '128k',
          '-sn',
          '-max_muxing_queue_size', '1024',
          '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
          '-f', 'mp4',
          'pipe:1',
        ]

  const args = [
    '-hide_banner',
    '-loglevel', 'error',
    '-nostdin',
    '-user_agent', UA,
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_on_network_error', '1',
    '-reconnect_on_http_error', '429,500,502,503,504',
    '-reconnect_delay_max', '8',
    '-analyzeduration', '2M',
    '-probesize', '2M',
    '-rw_timeout', '20000000',
    ...(ss > 0 ? ['-ss', String(ss)] : []),
    '-i', target.toString(),
    ...outArgs,
  ]

  let child: ChildProcessByStdio<null, Readable, Readable>
  const t0 = Date.now()
  try {
    child = spawn(ffmpegBin(), args, { stdio: ['ignore', 'pipe', 'pipe'] })
  } catch {
    return new NextResponse('Transcodificador (ffmpeg) indisponível no servidor', { status: 501 })
  }

  // coleta o stderr (limitado) para diagnóstico em falhas precoces
  let stderrTail = ''
  child.stderr.on('data', (d: Buffer) => {
    stderrTail = (stderrTail + d.toString()).slice(-2000)
  })

  let closed = false
  const kill = () => {
    if (closed) return
    closed = true
    try {
      child.kill('SIGKILL')
    } catch {
      /* noop */
    }
  }
  req.signal.addEventListener('abort', kill)

  // aguarda o primeiro pedaço de vídeo (ou a morte do processo) antes de
  // assumir o status HTTP — falhas precoces (404/403/codec) viram erro claro
  const head = await new Promise<{ chunk?: Buffer; error?: string }>((resolve) => {
    // 45 s: servidores IPTV podem levar dezenas de segundos para mandar o
    // início de arquivos grandes (TTFB alto). Menos que isso gerava falsos
    // "servidor não enviou dados a tempo".
    const timer = setTimeout(() => {
      cleanup()
      resolve({
        error:
          'Tempo esgotado aguardando dados do servidor do provedor (upstream não enviou o início do arquivo)',
      })
    }, 45_000)
    const onData = (c: Buffer) => {
      cleanup()
      resolve({ chunk: c })
    }
    const onExit = () => {
      cleanup()
      resolve({ error: stderrTail || 'ffmpeg encerrou sem produzir vídeo' })
    }
    const onError = (e: Error) => {
      cleanup()
      resolve({ error: e.message })
    }
    const cleanup = () => {
      clearTimeout(timer)
      child.stdout.off('data', onData)
      child.off('exit', onExit)
      child.off('error', onError)
    }
    child.stdout.once('data', onData)
    child.once('exit', onExit)
    child.once('error', onError)
  })

  if (!head.chunk) {
    kill()
    const detail = (head.error ?? 'Falha na transcodificação').slice(0, 300)
    return new NextResponse(`Falha na transcodificação: ${detail}`, { status: 502 })
  }
  console.log(
    `[transcode:${mode}] primeiro chunk em ${Date.now() - t0} ms · ss=${ss} · ${target.host}`,
  )

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (head.chunk) controller.enqueue(new Uint8Array(head.chunk))
      child.stdout.on('data', (chunk: Buffer) => {
        try {
          controller.enqueue(new Uint8Array(chunk))
        } catch {
          kill()
        }
      })
      child.stdout.on('end', () => {
        try {
          controller.close()
        } catch {
          /* noop */
        }
        kill()
      })
      child.on('error', () => {
        try {
          controller.close()
        } catch {
          /* noop */
        }
        kill()
      })
    },
    cancel() {
      kill()
    },
  })

  return new NextResponse(stream, {
    headers: {
      'content-type': 'video/mp4',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
  })
}
