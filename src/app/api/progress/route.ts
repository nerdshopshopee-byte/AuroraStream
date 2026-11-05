import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAccount, SessionError } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const account = await requireAccount()
    const progress = await db.watchProgress.findMany({
      where: { accountId: account.id },
      orderBy: { updatedAt: 'desc' },
      take: 30,
    })
    return NextResponse.json({ ok: true, data: progress })
  } catch (err) {
    if (err instanceof SessionError) {
      return NextResponse.json({ error: err.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Erro ao carregar histórico.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const account = await requireAccount()
    const body = await req.json()
    const { mediaId, mediaType, title, poster, positionSec, durationSec, season, episode, episodeTitle } =
      body ?? {}
    if (!mediaId || !mediaType || !title) {
      return NextResponse.json({ error: 'Dados incompletos.' }, { status: 400 })
    }
    const data = {
      mediaId,
      mediaType,
      title,
      poster: poster ?? null,
      positionSec: Number(positionSec) || 0,
      durationSec: Number(durationSec) || 0,
      season: season != null ? Number(season) : null,
      episode: episode != null ? Number(episode) : null,
      episodeTitle: episodeTitle ?? null,
    }
    const saved = await db.watchProgress.upsert({
      where: { accountId_mediaId: { accountId: account.id, mediaId } },
      create: { accountId: account.id, ...data },
      update: data,
    })
    return NextResponse.json({ ok: true, data: saved })
  } catch (err) {
    if (err instanceof SessionError) {
      return NextResponse.json({ error: err.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Erro ao salvar progresso.' }, { status: 500 })
  }
}
