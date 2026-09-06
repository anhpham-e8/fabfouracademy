import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { normalizeEmail } from './unsubscribeToken'

/**
 * Where opt-outs get written.
 *
 * The unsubscribe page is only as good as this: the address has to land
 * somewhere the daily send job actually reads before it builds its recipient
 * list. Nothing here is allowed to fail quietly — if the write doesn't happen,
 * the caller throws and the user is told the truth, rather than being shown a
 * confirmation that didn't do anything.
 */

export type UnsubscribeOutcome = 'unsubscribed' | 'already-unsubscribed'

export interface SubscriberStore {
  unsubscribe(email: string): Promise<UnsubscribeOutcome>
}

export class StoreNotConfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StoreNotConfiguredError'
  }
}

/**
 * Posts the opt-out to an HTTP endpoint owned by whatever system holds the
 * list (a Wix HTTP function, an Apps Script webhook, an ESP API shim, ...).
 * Keeps this app free of any assumption about where subscribers live.
 *
 * Sends: POST { action: 'unsubscribe', email } with a shared-secret header.
 * Expects: 2xx on success. A 404 is treated as "already gone", which is the
 * correct end state for an unsubscribe and keeps the flow idempotent.
 */
class WebhookStore implements SubscriberStore {
  constructor(
    private readonly url: string,
    private readonly secret: string | undefined
  ) {}

  async unsubscribe(email: string): Promise<UnsubscribeOutcome> {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (this.secret) headers['x-unsubscribe-secret'] = this.secret

    const response = await fetch(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'unsubscribe', email }),
      cache: 'no-store',
    })

    if (response.status === 404) return 'already-unsubscribed'
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(
        `Subscriber webhook responded ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`
      )
    }

    // Let the endpoint distinguish the two outcomes if it wants to; default to
    // the safe answer.
    const body = await response.json().catch(() => null)
    return body && body.outcome === 'already-unsubscribed' ? 'already-unsubscribed' : 'unsubscribed'
  }
}

/**
 * Local development only. Appends to a JSON file so the flow can be exercised
 * end to end without a backend. This does not persist on serverless hosts —
 * never select it in production.
 */
class FileStore implements SubscriberStore {
  constructor(private readonly filePath: string) {}

  async unsubscribe(email: string): Promise<UnsubscribeOutcome> {
    const path = resolve(process.cwd(), this.filePath)
    let existing: string[] = []
    try {
      existing = JSON.parse(await readFile(path, 'utf8')) as string[]
    } catch {
      existing = []
    }

    if (existing.includes(email)) return 'already-unsubscribed'

    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify([...existing, email], null, 2), 'utf8')
    return 'unsubscribed'
  }
}

export function getSubscriberStore(): SubscriberStore {
  const driver = process.env.UNSUBSCRIBE_STORE

  if (driver === 'webhook') {
    const url = process.env.SUBSCRIBER_WEBHOOK_URL
    if (!url) {
      throw new StoreNotConfiguredError(
        'UNSUBSCRIBE_STORE=webhook requires SUBSCRIBER_WEBHOOK_URL to be set.'
      )
    }
    return new WebhookStore(url, process.env.SUBSCRIBER_WEBHOOK_SECRET)
  }

  if (driver === 'file') {
    if (process.env.NODE_ENV === 'production') {
      throw new StoreNotConfiguredError(
        'UNSUBSCRIBE_STORE=file is for local development only and will lose data in production.'
      )
    }
    return new FileStore(process.env.UNSUBSCRIBE_FILE_PATH ?? '.data/unsubscribes.json')
  }

  throw new StoreNotConfiguredError(
    'UNSUBSCRIBE_STORE is not set. Set it to "webhook" (and SUBSCRIBER_WEBHOOK_URL) so opt-outs reach the real subscriber list.'
  )
}
