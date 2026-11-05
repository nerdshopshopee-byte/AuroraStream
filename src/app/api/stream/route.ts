import { NextRequest, NextResponse } from 'next/server'
import { requireAccount, SessionError } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const UA = 'AuroraStream/1.0 (IPTV Player; like VLC/3.0.20)'

/**
 * Proxy de mídia:
 * - Reescreve playlists .m3u8 (master e variant) para que todos os segmentos
 *   voltem por este proxy — necessário porque servidores IPTV raramente
 *   enviam cabeçalhos CORS e o hls.js precisa baixar segmentos via XHR/fetch.
 * - Faz passthrough binário para .ts / .mp4 / chaves AES com suporte a Range
 *   (seek em VOD).
 */

function proxied(url: string): string {
  return `/api/stream?u=${encodeURIComponent(url)}`
}

function absoluteUrl(base: string, uri: string): string {
  try {
    return new URL(uri, base).toString()
  } catch {
    return uri
  }
}

function rewritePlaylist(text: string, base: string): string {
  return text
    .split('\n')
    .map((rawLine) => {
      const line = rawLine.trim()
      if (!line) return rawLine
      if (line.startsWith('#')) {
        // #EXT-X-KEY:...URI="...", #EXT-X-MAP:...URI="...", #EXT-X-MEDIA URI=...
        if (line.includes('URI="')) {
          return rawLine.replace(
            /URI="([^"]+)"/g,
            (_m, uri: string) => `URI="${proxied(absoluteUrl(base, uri))}"`,
          )
        }
        return rawLine
      }
      // linha de URI de segmento/variante
      return proxied(absoluteUrl(base, line))
    })
    .join('\n')
}

function isPlaylist(target: string, contentType: string): boolean {
  const ct = contentType.toLowerCase()
  if (ct.includes('mpegurl')) return true
  const path = target.split('?')[0].toLowerCase()
  return path.endsWith('.m3u8') || path.endsWith('.m3u')
}

export async function GET(req: NextRequest) {
  try {
    // sessão obriga posse de cookie (evita proxy aberto)
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

  const range = req.headers.get('range') ?? undefined

  let upstream: Response
  try {
    upstream = await fetch(target.toString(), {
      headers: {
        'User-Agent': UA,
        Accept: '*/*',
        ...(range ? { Range: range } : {}),
      },
      redirect: 'follow',
      cache: 'no-store',
      ...(isPlaylist(target.toString(), '') ? { signal: AbortSignal.timeout(30_000) } : {}),
    })
  } catch (err) {
    const msg = err instanceof Error && err.name === 'TimeoutError'
      ? 'Tempo esgotado ao contatar o servidor de vídeo'
      : 'Falha ao contatar o servidor de vídeo'
    return new NextResponse(msg, { status: 504 })
  }

  const finalUrl = upstream.url || target.toString()
  const contentType = upstream.headers.get('content-type') ?? ''

  if (upstream.ok && isPlaylist(finalUrl, contentType)) {
    let body: string
    try {
      body = await upstream.text()
    } catch {
      return new NextResponse('Falha ao ler playlist', { status: 502 })
    }
    return new NextResponse(rewritePlaylist(body, finalUrl), {
      status: 200,
      headers: {
        'content-type': 'application/vnd.apple.mpegurl',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      },
    })
  }

  // passthrough binário (segmentos .ts, mp4, chaves, imagens)
  const headers = new Headers()
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const v = upstream.headers.get(h)
    if (v) headers.set(h, v)
  }
  if (!headers.has('content-type')) headers.set('content-type', 'video/mp2t')
  headers.set('access-control-allow-origin', '*')
  headers.set('cache-control', 'no-store')

  return new NextResponse(upstream.body, { status: upstream.status, headers })
}
