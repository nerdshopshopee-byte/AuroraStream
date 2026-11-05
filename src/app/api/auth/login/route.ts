import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { SESSION_COOKIE } from '@/lib/session'
import { xtreamAuth, normalizeServer } from '@/lib/xtream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: { mode?: string; server?: string; username?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }

  try {
    if (body.mode === 'demo') {
      const account = await db.account.create({
        data: { mode: 'demo', label: 'Convidado' },
      })
      const res = NextResponse.json({
        ok: true,
        session: { mode: 'demo', label: 'Convidado' },
      })
      setCookie(res, account.token)
      return res
    }

    // Modo Xtream Codes
    const server = normalizeServer(String(body.server ?? ''))
    const username = String(body.username ?? '').trim()
    const password = String(body.password ?? '').trim()
    if (!username || !password) {
      return NextResponse.json(
        { error: 'Informe servidor, usuário e senha.' },
        { status: 400 },
      )
    }

    const auth = await xtreamAuth(server, username, password)
    const ui = auth.user_info

    const account = await db.account.create({
      data: { mode: 'xtream', server, username, password, label: username },
    })

    const session = {
      mode: 'xtream' as const,
      label: username,
      server,
      username,
      // ESSENCIAL: o cliente monta as URLs de stream (movie/series/live) a
      // partir da sessão. Sem a senha aqui, play() devolve streamUrl undefined
      // e o player fica eternamente em "Bufferizando 0%" até a próxima
      // recarga da página (que usa /api/auth/session, que já enviava a senha).
      password,
      status: ui.status,
      isTrial: ui.is_trial === '1',
      activeConnections: Number(ui.active_cons ?? 0),
      maxConnections: Number(ui.max_connections ?? 0),
      timezone: auth.server_info?.timezone,
      expiry:
        ui.exp_date && Number(ui.exp_date) > 0
          ? new Date(Number(ui.exp_date) * 1000).toISOString()
          : undefined,
    }
    const res = NextResponse.json({ ok: true, session })
    setCookie(res, account.token)
    return res
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Falha ao conectar ao servidor Xtream.'
    return NextResponse.json({ error: message }, { status: 401 })
  }
}

function setCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}
