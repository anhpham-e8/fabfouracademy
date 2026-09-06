# Self-serve unsubscribe

Replaces the previous `/unsubscribe` page, which rendered the same static text
regardless of the token it was given and never actually opted anyone out.

## How it works

Unsubscribe tokens are **stateless and HMAC-signed**. The token carries the
subscriber's address and a signature, so `/unsubscribe` can verify it with no
database lookup — the step that previously had nothing behind it. Tokens do not
expire: an opt-out link has to keep working for as long as the email sits in
someone's inbox.

| Route | Method | Purpose |
| --- | --- | --- |
| `/unsubscribe?token=…` | GET | Verifies the token and shows a confirmation screen. Never mutates. |
| `/api/unsubscribe` | POST | Performs the opt-out. Accepts the token in the query string (RFC 8058 one-click) or a JSON body (the confirm button). |

The opt-out is on POST only and deliberately so. Mail clients, link scanners and
security appliances follow GET links in email with no human involved; a GET that
mutated would unsubscribe people who never clicked.

## Required environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `UNSUBSCRIBE_TOKEN_SECRET` | yes | Random string, 32+ chars. Must be identical in the app and in whatever sends the email, or every link will read as invalid. Rotating it invalidates all outstanding links. |
| `UNSUBSCRIBE_STORE` | yes | `webhook` in production. `file` is local-dev only and is refused when `NODE_ENV=production`. |
| `SUBSCRIBER_WEBHOOK_URL` | with `webhook` | Endpoint on whatever system owns the subscriber list. |
| `SUBSCRIBER_WEBHOOK_SECRET` | recommended | Sent as `x-unsubscribe-secret`; verify it on the receiving end. |
| `NEXT_PUBLIC_SITE_URL` | no | Origin used when building links. Defaults to `https://www.fabfouracademy.com`. |

## What still has to be built on the list side

This app does not own the subscriber list, so **one endpoint has to exist for any
of this to take effect**. It receives:

```
POST <SUBSCRIBER_WEBHOOK_URL>
x-unsubscribe-secret: <SUBSCRIBER_WEBHOOK_SECRET>
{ "action": "unsubscribe", "email": "someone@example.com" }
```

It must mark that address opted out **in the same place the daily send job reads
its recipients from**, then return `2xx`. Optionally return
`{"outcome":"already-unsubscribed"}` so the page can word the confirmation
accurately. `404` is treated as "already gone". Any non-2xx makes the app report
failure to the user rather than a false confirmation.

Two things worth handling there: remove the address from **every** list and
in-flight automation, not just the daily broadcast, and match on the normalized
(lower-cased, trimmed) address so duplicate records don't survive.

## Wiring the sender

Build one link per recipient and put it in both the email body and the headers:

```ts
import { buildUnsubscribeUrl } from '@/lib/unsubscribeToken'

const url = buildUnsubscribeUrl(recipient.email)
```

Headers to set on every send — Gmail and Yahoo have required these of bulk
senders since February 2024, and they power the native "Unsubscribe" control in
the mail client, which is more reliable than any in-body link:

```
List-Unsubscribe: <https://www.fabfouracademy.com/api/unsubscribe?token=TOKEN>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

Use the `/api/unsubscribe` URL in the header (one-click posts straight to it) and
the `/unsubscribe` page URL in the body (a human gets a confirmation screen).

If the sender is not JavaScript, the token is easy to reproduce — it is
`base64url({"e":<lowercased email>,"t":<epoch ms>})` + `"."` +
`base64url(HMAC_SHA256(payload, UNSUBSCRIBE_TOKEN_SECRET))`.

## Verified behavior

Exercised end to end against a stand-in list endpoint:

- valid token → opt-out reaches the list, page confirms
- repeat click → idempotent, reported as already unsubscribed
- RFC 8058 one-click POST → same result
- tampered token → `400`, page says the link isn't valid, nothing written
- `GET /api/unsubscribe` → `405`, never mutates
- **list unreachable → `502` and the user is told they have _not_ been removed**

That last one is the point of the rewrite. The page never claims success it
didn't achieve.

## Known gap

Links in already-sent emails use the old opaque UUID tokens and will read as
invalid here — they land on a clear "this link isn't valid, reply and we'll
remove you" screen instead of the old dead end. Fixing those retroactively was
explicitly out of scope; anyone still holding one needs manual removal.
