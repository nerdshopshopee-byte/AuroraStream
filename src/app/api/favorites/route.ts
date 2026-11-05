import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAccount, SessionError } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const account = await requireAccount()
    const favorites = await db.favorite.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ ok: true, data: favorites })
  } catch (err) {
    if (err instanceof SessionError) {
      return NextResponse.json({ error: err.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Erro ao listar favoritos.' }, { status: 500 })
  }
}

/** POST = toggle favorito; retorna o novo estado */
export async function POST(req: NextRequest) {
  try {
    const account = await requireAccount()
    const body = await req.json()
    const { mediaId, mediaType, title, poster, category } = body ?? {}
    if (!mediaId || !mediaType || !title) {
      return NextResponse.json({ error: 'Dados incompletos.' }, { status: 400 })
    }
    const existing = await db.favorite.findUnique({
      where: { accountId_mediaId_mediaType: { accountId: account.id, mediaId, mediaType } },
    })
    if (existing) {
      await db.favorite.delete({ where: { id: existing.id } })
      return NextResponse.json({ ok: true, favorited: false })
    }
    await db.favorite.create({
      data: { accountId: account.id, mediaId, mediaType, title, poster, category },
    })
    return NextResponse.json({ ok: true, favorited: true })
  } catch (err) {
    if (err instanceof SessionError) {
      return NextResponse.json({ error: err.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Erro ao favoritar.' }, { status: 500 })
  }
}
