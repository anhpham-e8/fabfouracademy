import type { Metadata } from 'next'
import { verifyUnsubscribeToken } from '@/lib/unsubscribeToken'
import UnsubscribeForm from './UnsubscribeForm'
import styles from './Unsubscribe.module.css'

export const metadata: Metadata = {
  title: 'Unsubscribe — Fab Four Academy',
  // Keep opt-out links out of search results, and out of referrer headers so the
  // token is not leaked to third parties by an outbound click.
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export const dynamic = 'force-dynamic'

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  let payload = null
  let misconfigured = false
  try {
    payload = verifyUnsubscribeToken(token)
  } catch {
    misconfigured = true
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <span className="eyebrow">Fab Four Academy</span>

        {misconfigured ? (
          <div className={styles.result}>
            <h1 className={styles.heading}>We can&apos;t process this right now</h1>
            <p className={styles.body}>
              Something is misconfigured on our end, so we could not read your unsubscribe link.
              You have <strong>not</strong> been removed yet. Please reply to any daily email and
              we will take you off the list manually.
            </p>
            <a className={styles.homeLink} href="/">
              Return to fabfouracademy.com →
            </a>
          </div>
        ) : !token ? (
          <div className={styles.result}>
            <h1 className={styles.heading}>This link is incomplete</h1>
            <p className={styles.body}>
              We need the unsubscribe link from one of your daily emails to know which subscription
              to cancel — this page was opened without it. Open a recent Daily Words of Wisdom
              email and use the unsubscribe link at the bottom.
            </p>
            <a className={styles.homeLink} href="/">
              Return to fabfouracademy.com →
            </a>
          </div>
        ) : !payload ? (
          <div className={styles.result}>
            <h1 className={styles.heading}>This link isn&apos;t valid</h1>
            <p className={styles.body}>
              We couldn&apos;t verify this unsubscribe link, so you have <strong>not</strong> been
              removed. It may have been altered in transit or truncated by your email client. Try
              the link in your most recent daily email, or reply to that email and we&apos;ll remove
              you manually.
            </p>
            <a className={styles.homeLink} href="/">
              Return to fabfouracademy.com →
            </a>
          </div>
        ) : (
          <UnsubscribeForm email={payload.email} token={token} />
        )}
      </div>
    </main>
  )
}
