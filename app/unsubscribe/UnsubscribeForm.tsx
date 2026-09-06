'use client'

import { useState } from 'react'
import styles from './Unsubscribe.module.css'

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'done'; alreadyOff: boolean }
  | { kind: 'error'; message: string }

const ERROR_COPY: Record<string, string> = {
  invalid_token: 'This unsubscribe link is not valid. Please use the link in a recent daily email.',
  server_misconfigured:
    'Something is misconfigured on our end and we could not process this. Please email us and we will remove you manually.',
  write_failed:
    'We could not reach the subscriber list just now, so you have NOT been removed. Please try again in a moment.',
}

export default function UnsubscribeForm({ email, token }: { email: string; token: string }) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  async function submit() {
    setStatus({ kind: 'submitting' })
    try {
      const response = await fetch('/api/unsubscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const body = await response.json().catch(() => null)

      if (!response.ok || !body?.ok) {
        const code = body?.error as string | undefined
        setStatus({
          kind: 'error',
          message:
            (code && ERROR_COPY[code]) ??
            'We could not complete this just now, so you have NOT been removed. Please try again.',
        })
        return
      }

      setStatus({ kind: 'done', alreadyOff: body.outcome === 'already-unsubscribed' })
    } catch {
      setStatus({
        kind: 'error',
        message:
          'We could not reach the server, so you have NOT been removed. Please check your connection and try again.',
      })
    }
  }

  if (status.kind === 'done') {
    return (
      <div className={styles.result} role="status">
        <h1 className={styles.heading}>
          {status.alreadyOff ? 'You were already unsubscribed' : "You're unsubscribed"}
        </h1>
        <p className={styles.body}>
          <strong>{email}</strong> has been removed from the Daily Words of Wisdom list. You may
          still receive an email that was already queued before now, but nothing after that.
        </p>
        <a className={styles.homeLink} href="/">
          Return to fabfouracademy.com →
        </a>
      </div>
    )
  }

  return (
    <div className={styles.result}>
      <h1 className={styles.heading}>Unsubscribe from daily emails</h1>
      <p className={styles.body}>
        Confirm that you want to stop receiving Daily Words of Wisdom at{' '}
        <strong>{email}</strong>.
      </p>

      <button
        type="button"
        className={`btn btn-primary ${styles.confirm}`}
        onClick={submit}
        disabled={status.kind === 'submitting'}
      >
        {status.kind === 'submitting' ? 'Removing…' : 'Yes, unsubscribe me'}
      </button>

      {status.kind === 'error' && (
        <p className={styles.error} role="alert">
          {status.message}
        </p>
      )}

      <a className={styles.homeLink} href="/">
        Keep my subscription →
      </a>
    </div>
  )
}
