import { NextResponse } from 'next/server'
import { getAccount, buildSessionInfo } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const account = await getAccount()
  if (!account) return NextResponse.json({ session: null })
  const session = await buildSessionInfo(account)
  return NextResponse.json({ session })
}
