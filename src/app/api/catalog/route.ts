import { NextRequest, NextResponse } from 'next/server'
import { DEMO_MOVIES, DEMO_SERIES, DEMO_LIVE, demoFixtures, DEMO_SERIES_EPISODES } from '@/lib/demo-data'
import { requireAccount, SessionError } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Catálogo de demonstração + detalhes de série demo */
export async function GET(req: NextRequest) {
  try {
    await requireAccount()
    const what = req.nextUrl.searchParams.get('what') ?? 'all'

    if (what === 'series-info') {
      const id = req.nextUrl.searchParams.get('id') ?? ''
      const episodes = DEMO_SERIES_EPISODES[id]
      if (!episodes) return NextResponse.json({ error: 'Série não encontrada.' }, { status: 404 })
      const seasons = [...new Set(episodes.map((e) => e.season))].sort()
      return NextResponse.json({ ok: true, data: { seasons, episodes } })
    }

    if (what === 'fixtures') {
      return NextResponse.json({ ok: true, data: demoFixtures() })
    }

    return NextResponse.json({
      ok: true,
      data: {
        movies: DEMO_MOVIES,
        series: DEMO_SERIES,
        live: DEMO_LIVE,
        fixtures: demoFixtures(),
      },
    })
  } catch (err) {
    if (err instanceof SessionError) {
      return NextResponse.json({ error: err.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Erro ao carregar catálogo.' }, { status: 500 })
  }
}
