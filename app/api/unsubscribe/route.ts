import { NextResponse } from 'next/server'
import { getSubscriberStore, StoreNotConfiguredError } from '@/lib/subscriberStore'
import { verifyUnsubscribeToken } from '@/lib/unsubscribeToken'

// node:crypto and the file store both need the Node runtime.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Performs the opt-out. POST only, deliberately:
 * mail clients, link scanners and security appliances follow GET links in email
 * without a human involved, so a GET that mutates would unsubscribe people who
 * never clicked anything.
 *
 * Accepts the token from either
 *   - the query string, which is what RFC 8058 one-click (List-Unsubscribe-Post)
 *     sends, or
 *   - a JSON body, which is what the confirmation page sends.
 */
export async function POST(request: Request) {
  const url = new URL(request.url)
  let token = url.searchParams.get('token')

  if (!token) {
    const body = await request.json().catch(() => null)
    if (body && typeof body.token === 'string') token = body.token
  }

  let payload
  try {
    payload = verifyUnsubscribeToken(token)
  } catch {
    // Secret missing — a server problem, not a bad link.
    return NextResponse.json(
      { ok: false, error: 'server_misconfigured' },
      { status: 500 }
    )
  }

  if (!payload) {
    return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 400 })
  }

  try {
    const outcome = await getSubscriberStore().unsubscribe(payload.email)
    return NextResponse.json({ ok: true, outcome, email: payload.email })
  } catch (error) {
    if (error instanceof StoreNotConfiguredError) {
      console.error('[unsubscribe] store not configured:', error.message)
      return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 500 })
    }
    // The write failed. Say so — never report success we did not achieve.
    console.error('[unsubscribe] failed to record opt-out:', error)
    return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 502 })
  }
}

export function GET() {
  return NextResponse.json(
    { ok: false, error: 'method_not_allowed' },
    { status: 405, headers: { allow: 'POST' } }
  )
}
