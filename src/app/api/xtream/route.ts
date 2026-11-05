import { NextRequest, NextResponse } from 'next/server'
import { requireAccount, SessionError } from '@/lib/session'
import { xtreamAction } from '@/lib/xtream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_ACTIONS = new Set([
  'get_live_categories',
  'get_vod_categories',
  'get_series_categories',
  'get_live_streams',
  'get_vod_streams',
  'get_series',
  'get_series_info',
  'get_vod_info',
  'get_simple_data_table',
])

/**
 * Proxy Xtream Codes: o navegador não consegue chamar player_api.php dos
 * painéis diretamente (CORS + mixed content). O servidor faz a ponte e
 * aplica cache com TTL por tipo de dado.
 */
export async function GET(req: NextRequest) {
  try {
    const account = await requireAccount()
    if (account.mode !== 'xtream' || !account.server || !account.username || !account.password) {
      return NextResponse.json({ error: 'Sessão não é Xtream.' }, { status: 400 })
    }

    const action = req.nextUrl.searchParams.get('action') ?? ''
    if (!ALLOWED_ACTIONS.has(action)) {
      return NextResponse.json({ error: `Ação não permitida: ${action}` }, { status: 400 })
    }

    const params: Record<string, string> = { action }
    for (const [k, v] of req.nextUrl.searchParams.entries()) {
      if (k !== 'action' && v) params[k] = v
    }

    const data = await xtreamAction(
      account.server,
      account.username,
      account.password,
      params,
    )
    return NextResponse.json(
      { ok: true, data },
      { headers: { 'cache-control': 'private, max-age=60' } },
    )
  } catch (err) {
    if (err instanceof SessionError) {
      return NextResponse.json({ error: err.message }, { status: 401 })
    }
    const message = err instanceof Error ? err.message : 'Erro ao consultar o servidor.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
