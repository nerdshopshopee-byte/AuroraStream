// ============================================================
// AuroraStream — Controle parental [+18]
// PIN de 4 dígitos (hash leve em localStorage) + desbloqueio por
// sessão + ocultação de conteúdo adulto nas linhas e na busca.
// ============================================================

'use client'

const PIN_KEY = 'aurora.parental.pin'
const HIDE_KEY = 'aurora.parental.hide'
const UNLOCK_KEY = 'aurora.parental.unlocked'

/** Padrões de categorias/títulos adultos comuns em painéis IPTV */
const ADULT_RE =
  /(xxx|adult[oa]s?|porn[oô]s?|er[oó]tic[oa]s?|hentai|\+18|18\+|strip|sexy|venus|brazzers|playboy|hustler|penthouse|priv[ée]|dorcel|nubile|metart)/i

/** True se algum dos textos bate com padrões de conteúdo adulto */
export function isAdultContent(...parts: (string | undefined | null)[]): boolean {
  return parts.some((p) => !!p && ADULT_RE.test(p))
}

/** True quando o item deve ser tratado como conteúdo +18 */
export function isAdultItem(item: { category?: string; title?: string } | null | undefined): boolean {
  if (!item) return false
  return isAdultContent(item.category, item.title)
}

/** FNV-1a 32-bit — ofuscação leve do PIN (não é segurança criptográfica) */
function hashPin(pin: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < pin.length; i++) {
    h ^= pin.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16)
}

/** PIN armazenado (hash) ou null quando o controle parental está desativado */
export function getStoredPin(): string | null {
  try {
    return localStorage.getItem(PIN_KEY)
  } catch {
    return null
  }
}

/** Define (ou remove, com null) o PIN parental */
export function setStoredPin(pin: string | null) {
  try {
    if (pin) localStorage.setItem(PIN_KEY, hashPin(pin))
    else localStorage.removeItem(PIN_KEY)
  } catch {
    /* storage indisponível */
  }
}

/** Controle parental ativo (PIN configurado)? */
export function parentalEnabled(): boolean {
  return getStoredPin() != null
}

/** Confere o PIN digitado contra o hash armazenado */
export function verifyPin(pin: string): boolean {
  const stored = getStoredPin()
  return !!stored && hashPin(pin) === stored
}

/** Sessão desbloqueada? (desbloqueio vale até fechar a aba/app) */
export function isUnlocked(): boolean {
  try {
    return sessionStorage.getItem(UNLOCK_KEY) === '1'
  } catch {
    return false
  }
}

/** Desbloqueia o conteúdo +18 para a sessão atual */
export function unlockSession() {
  try {
    sessionStorage.setItem(UNLOCK_KEY, '1')
  } catch {
    /* noop */
  }
}

/** Bloqueia novamente (botão "Bloquear agora" nas configurações) */
export function lockAgain() {
  try {
    sessionStorage.removeItem(UNLOCK_KEY)
  } catch {
    /* noop */
  }
}

/** Ocultação de conteúdo +18 está ativa? (filtra linhas, grade e busca) */
export function hideAdultEnabled(): boolean {
  try {
    return localStorage.getItem(HIDE_KEY) === '1'
  } catch {
    return false
  }
}

/** Liga/desliga a ocultação de conteúdo +18 */
export function setHideAdult(v: boolean) {
  try {
    if (v) localStorage.setItem(HIDE_KEY, '1')
    else localStorage.removeItem(HIDE_KEY)
  } catch {
    /* noop */
  }
}
