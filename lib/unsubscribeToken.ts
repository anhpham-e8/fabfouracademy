import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Stateless, signed unsubscribe tokens.
 *
 * The token carries the subscriber's address and is signed with a server-side
 * secret, so /unsubscribe can verify it without a database lookup. That removes
 * the failure mode where a token can't be resolved and the page silently gives
 * up without opting anyone out.
 *
 * Tokens deliberately do NOT expire. An unsubscribe link has to keep working for
 * as long as the email it was sent in exists in someone's inbox; an expired
 * opt-out link is a compliance problem, not a security feature.
 */

export type TokenPayload = {
  email: string
  issuedAt: number
}

/** Wire format: {"e": <email>, "t": <issuedAt ms>} kept short to keep URLs short. */
type WirePayload = { e: string; t: number }

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function toBase64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function getSecret(): string {
  const secret = process.env.UNSUBSCRIBE_TOKEN_SECRET
  if (!secret || secret.length < 32) {
    throw new Error(
      'UNSUBSCRIBE_TOKEN_SECRET is missing or too short. Set it to a random string of at least 32 characters.'
    )
  }
  return secret
}

function sign(payload: string): string {
  return toBase64Url(createHmac('sha256', getSecret()).update(payload).digest())
}

/**
 * Build the token to embed in an outgoing email. Call this from whatever sends
 * the daily email, once per recipient.
 */
export function createUnsubscribeToken(email: string, issuedAt: number = Date.now()): string {
  const wire: WirePayload = { e: normalizeEmail(email), t: issuedAt }
  const payload = toBase64Url(Buffer.from(JSON.stringify(wire), 'utf8'))
  return `${payload}.${sign(payload)}`
}

/** Returns the payload for a valid token, or null for anything malformed or unsigned. */
export function verifyUnsubscribeToken(token: string | undefined | null): TokenPayload | null {
  if (!token) return null

  const parts = token.split('.')
  if (parts.length !== 2) return null

  const [payload, providedSig] = parts
  if (!payload || !providedSig) return null

  let expectedSig: string
  try {
    expectedSig = sign(payload)
  } catch {
    // Missing secret is a server misconfiguration, not an invalid token. Let it
    // surface rather than reporting a valid link as broken.
    throw new Error('Unsubscribe token secret is not configured')
  }

  const provided = Buffer.from(providedSig, 'utf8')
  const expected = Buffer.from(expectedSig, 'utf8')
  if (provided.length !== expected.length) return null
  if (!timingSafeEqual(provided, expected)) return null

  try {
    const wire = JSON.parse(fromBase64Url(payload).toString('utf8')) as WirePayload
    if (typeof wire.e !== 'string' || !wire.e.includes('@')) return null
    return { email: normalizeEmail(wire.e), issuedAt: typeof wire.t === 'number' ? wire.t : 0 }
  } catch {
    return null
  }
}

/** Absolute URL to put in the email body and the List-Unsubscribe header. */
export function buildUnsubscribeUrl(email: string, baseUrl?: string): string {
  const origin = (baseUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.fabfouracademy.com').replace(
    /\/$/,
    ''
  )
  return `${origin}/unsubscribe?token=${encodeURIComponent(createUnsubscribeToken(email))}`
}
