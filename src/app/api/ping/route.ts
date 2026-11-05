import { NextResponse } from 'next/server'
import { dbStorageInfo } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ t: Date.now(), storage: dbStorageInfo() })
}
