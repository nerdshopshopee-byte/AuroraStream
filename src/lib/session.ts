// ============================================================
// AuroraStream — Sessão server-side (cookie httpOnly + armazenamento JSON)
// ============================================================

import { cookies } from 'next/headers'
import { db, type Account } from '@/lib/db'
import type { SessionInfo } from '@/lib/types'
import { xtreamAuth, type XtreamAuthResult } from '@/lib/xtream'

export const SESSION_COOKIE = 'aurora_sid'

export async function getAccount(): Promise<Account | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  const account = await db.account.findUnique({ where: { token } })
  return account
}

export async function requireAccount(): Promise<Account> {
  const account = await getAccount()
  if (!account) throw new SessionError('Sessão expirada — faça login novamente.')
  return account
}

export class SessionError extends Error {}

export async function touchAccount(id: string) {
  await db.account.update({ where: { id }, data: { lastSeen: new Date() } }).catch(() => {})
}

/** Converte a conta + dados frescos do Xtream em SessionInfo p/ o cliente */
export async function buildSessionInfo(account: Account): Promise<SessionInfo> {
  const base: SessionInfo = {
    mode: account.mode === 'xtream' ? 'xtream' : 'demo',
    label: account.label || account.username || 'Convidado',
    server: account.server ?? undefined,
    username: account.username ?? undefined,
  }
  if (account.mode === 'xtream' && account.server && account.username && account.password) {
    base.password = account.password
    try {
      const auth: XtreamAuthResult = await xtreamAuth(
        account.server,
        account.username,
        account.password,
      )
      const ui = auth.user_info
      base.status = ui.status
      base.isTrial = ui.is_trial === '1'
      base.activeConnections = Number(ui.active_cons ?? 0)
      base.maxConnections = Number(ui.max_connections ?? 0)
      base.timezone = auth.server_info?.timezone
      if (ui.exp_date && Number(ui.exp_date) > 0) {
        base.expiry = new Date(Number(ui.exp_date) * 1000).toISOString()
      }
    } catch {
      // servidor offline agora: mantém info básica
    }
  }
  return base
}
