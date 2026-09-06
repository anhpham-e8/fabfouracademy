#!/usr/bin/env node
/**
 * Generates a real unsubscribe link, for testing the flow and for reference when
 * wiring the send job.
 *
 * Imports the app's own token module rather than reimplementing the signing, so
 * what this prints is exactly what the route will accept.
 *
 *   UNSUBSCRIBE_TOKEN_SECRET=<32+ chars> \
 *     node --experimental-strip-types scripts/unsubscribe-link.mjs someone@example.com [baseUrl]
 */
import { createUnsubscribeToken } from '../lib/unsubscribeToken.ts'

const [email, baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'] =
  process.argv.slice(2)

if (!email) {
  console.error('usage: node --experimental-strip-types scripts/unsubscribe-link.mjs <email> [baseUrl]')
  process.exit(1)
}

if (!process.env.UNSUBSCRIBE_TOKEN_SECRET) {
  console.error('UNSUBSCRIBE_TOKEN_SECRET is not set (needs 32+ characters).')
  process.exit(1)
}

const origin = baseUrl.replace(/\/$/, '')
// One token for both links, so the pair is directly comparable.
const token = encodeURIComponent(createUnsubscribeToken(email))

console.log(`
Recipient   ${email}

Body link (human sees a confirmation screen):
  ${origin}/unsubscribe?token=${token}

Header link (RFC 8058 one-click):
  List-Unsubscribe: <${origin}/api/unsubscribe?token=${token}>
  List-Unsubscribe-Post: List-Unsubscribe=One-Click
`)
