# Email Ingestion Plan

How to get club and department event emails — the ones that never reach a public calendar — onto
the map. Written 2026-10-30 on branch `mohul-email-forward`.

The gap: LSBE, EECS, cultural orgs and most departments announce events to their own mailing
lists. `events.berkeley.edu` never sees them, calevents.app only sees what gets posted to
Instagram, and `pipeline/sources/gmail.py` only sees the lists **Dhilen personally joined**. The
events students most want are exactly the ones in somebody else's inbox.

Two ways to reach those inboxes are compared below. **The recommendation is approach 1**, and the
reasoning is at the bottom of each section rather than up front.

---

## Recommendation, in one paragraph

Ship **approach 1, forward-to-address**, in the form that needs no domain and no Cloudflare
account: one dedicated free mailbox that the pipeline polls over IMAP, and students forward event
mail to it. It is free, it adds no OAuth client and no Google review, it is opt-in per message, it
never touches anyone's inbox, and the whole thing is ~250 lines in the shape of the existing
sources. A pretty address (`events@uberkfree.com`) can be layered on later for free with
Cloudflare Email Routing without changing a line of pipeline code. **Approach 2, an OAuth Gmail
read of each user's mailbox, should not be started**: `gmail.readonly` is a Google *restricted*
scope, which means app review plus an annual third-party CASA security assessment (third-party
reports put it at roughly $540–$4,500/yr; Google itself charges nothing but does not do the
assessment), several weeks of review, and — the detail that actually kills it — in Testing mode
every user's consent **and refresh token expires after 7 days**, so an unattended daily job breaks
weekly until the app is verified. That is Dhilen's call, not something to begin.

---

## Approach 1 — forward-to-address

A dedicated address. A student sees "free pizza, Thursday 6pm, Cory 540" on the LSBE list, hits
forward, and it is on the map an hour later. Opt-in per message. No inbox access, no OAuth client,
no Google review, nothing to revoke.

### How the mail actually reaches the pipeline

Four transports were priced out. All of the costs below are current free-tier terms, each with its
source.

**(a) A dedicated free mailbox the pipeline polls over IMAP — recommended.**
Create one free account (e.g. a new `gmail.com` address), turn on 2-Step Verification, generate an
app password, and the pipeline reads it with `imaplib` from the Python standard library.
- Cost: **$0**. No new dependency either — `imaplib` and `email` are stdlib.
- Credentials: one app password. No OAuth client, no Google Cloud project, no verification; an app
  password is not an OAuth app, so none of the restricted-scope machinery in approach 2 applies.
- Caveat: Google ended plain-password (basic auth) access for IMAP in 2024; app passwords are the
  surviving path and require 2SV ([Google's own IMAP/basic-auth notice is quoted
  here](https://www.github.com/node-red/node-red-nodes/issues/1063), and current setup guides still
  document `imap.gmail.com:993` with an app password, e.g.
  [smtpedia](https://smtpedia.com/gmail-email-settings-pop3-imap-smtp/)). Google could withdraw app
  passwords. Mitigation: the source takes `FORWARD_IMAP_HOST` as an env var and speaks plain IMAP,
  so moving to any other free IMAP host is a secret change, not a code change.
- Note for the record: Google classifies `https://mail.google.com/` — *"includes any usage of IMAP,
  SMTP, and POP3"* — as a restricted scope
  ([restricted scopes list](https://support.google.com/cloud/answer/13464325)). That applies to
  reading *other people's* mailboxes through an OAuth app. It does not apply to us signing into our
  own mailbox with its own password.

**(b) Cloudflare Email Routing → forwards into that same mailbox.** This is the "pretty address"
layer, and it is strictly additive: `events@<ourdomain>` forwards to the mailbox from (a), and the
pipeline does not know the difference.
- Cost: **$0**. Inbound email is listed as unlimited on both the Workers Free and Paid plans;
  limits are 200 routing rules per domain, 200 destination addresses per account, 25 MiB per
  message ([Email Routing limits](https://developers.cloudflare.com/email-routing/limits/),
  [Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/)).
- What it needs that we do not have: **the domain's DNS on Cloudflare**, so its MX records can be
  changed. See "the domain question" below.
- No Email Worker is needed for plain forwarding, which matters: Email Workers run under the normal
  Workers CPU/memory limits and can fail with `EXCEEDED_CPU` on the free plan.

**(c) Cloudflare Email Worker → writes straight into Supabase `raw_items`.** Also free, and it
removes the polling delay. Rejected for v1 anyway:
- It puts `SUPABASE_SECRET_KEY` in a second place outside the pipeline. `CLAUDE.md` says that key
  is pipeline-only, and it bypasses row-level security — a public HTTPS endpoint holding it is a
  worse failure mode than a mailbox.
- It adds a Worker to deploy, version and debug, and MIME parsing in a CPU-limited Worker, to buy
  latency we do not need (the pipeline runs every ~6h in practice, and GitHub's cron is the real
  latency floor, not the mailbox).
- Keep it on the shelf as the fallback if app passwords ever disappear: a Worker writing to its own
  Cloudflare KV namespace, polled by the pipeline over HTTPS with a shared token, keeps the secret
  key in the pipeline.

**(d) Forward into Dhilen's existing bmail `FreeFood` label.** Zero code: the existing
`gmail.py` would pick forwarded mail up tomorrow. Rejected: it loses all provenance (no way to tell
a forward from Dhilen's own list mail, so no contributor model later and no sender allowlist), it
points a public address at the owner's personal mailbox, and any spam that gets forwarded lands in
his mail. A dedicated mailbox with its own label costs one `.py` file and avoids all three. A
variant — forward into Dhilen's bmail under a *second* label, read with the OAuth token he already
has — was also rejected: `CLAUDE.md` says Gmail must only ever read the `FreeFood` label, and
quietly adding a second label is a rule change, not an implementation detail.

### The domain question

The brief named `events@calfreefood.com`. There is no such domain in this repo. What exists:
- `main` deploys the site to GitHub Pages under **dhilen.com**/freefood (`site/CNAME`).
- branch `mohul-web` adds a Vercel deployment on **uberkfree.com** (`web/src/lib/site.ts`).

So a custom forwarding address means pointing MX records for `dhilen.com` or `uberkfree.com` at
Cloudflare. **Whoever controls that domain's DNS has to do it** — free, about ten minutes, but it
is an owner action. This is precisely why transport (a) is the recommendation: a plain mailbox
address needs no domain at all, and the address can be upgraded later without touching the
pipeline.

### Verdict

Yes, this is the right first version, and the agreement is not grudging. Everything that makes the
other approach expensive — consent, review, liability, per-user tokens — is replaced by the user
pressing "forward". It costs nothing, it degrades gracefully (an unconfigured mailbox means the
source no-ops, not a failing pipeline), and the only thing it asks of the owner is one free account.

The honest cost is **volume**: forwarding is a deliberate act, so expect a handful of messages a
week, not a feed. That is still strictly better than zero, and it is the only version of this that
can ship this week.

---

## Approach 2 — OAuth read of each user's Gmail

The user connects their Google account, the project gets a refresh token, and a scheduled job reads
their mail looking for events.

### Why this is not a weekend project

- **`gmail.readonly` is a *restricted* scope.** Confirmed on Google's own list, alongside
  `gmail.modify`, `gmail.metadata` and `https://mail.google.com/`
  ([restricted scopes](https://support.google.com/cloud/answer/13464325)). There is no narrower
  Gmail read scope to hide behind; `gmail.metadata` (headers only, no bodies) is restricted too.
- **Restricted scopes require brand verification, an app review with a demo video, and an
  independent CASA security assessment** by a Google-approved assessor, because the app moves
  restricted-scope data through a third-party server (ours). Re-verification is required at least
  every 12 months, and Google's own page says the process "can potentially take several weeks to
  complete"
  ([restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)).
- **Money.** Google charges nothing for verification; the assessment lab does. Published
  third-party figures range from ~$540 to ~$4,500 per year depending on lab and tier, and sources
  disagree on whether Gmail restricted scopes land in CASA Tier 2 or Tier 3 (Tier 3 is a full
  penetration test). Treat **$500–$4,500/yr, recurring** as the planning range and confirm with an
  approved lab before committing
  ([one lab-rate summary](https://www.unipile.com/integrating-google-oauth-2-0-user-authentication-into-your-app/),
  [a self-reported $540 pass](https://meetorbis.com/blog/how-we-passed-google-casa-tier-2-with-claude),
  [a cost breakdown](https://bright-softwares.com/blog/en/google-workspace/the-50000-gmail-add-on-myth-what-google-s-casa-certification-really-costs)).
  Against a project whose entire budget is "free tiers only, $4.50/month of Apify", this is the
  largest line item in the repo by an order of magnitude.
- **Time.** Brand verification 2–3 business days, then weeks of app review, then the assessment.
  Realistically a month or two of calendar time and real paperwork — a privacy policy that survives
  review, a deletion path, a demo video, security questionnaires.
- **The unverified cap is worse than "100 users".** An unverified app is capped at **100 users for
  the lifetime of the project**, and it "cannot be reset or changed". In Testing mode you may list
  up to 100 test users, and — the decisive part — **a test user's authorization expires 7 days after
  consent, and an offline refresh token expires with it**
  ([user caps and test-mode expiry](https://support.google.com/cloud/answer/15549945)). A daily
  unattended agent reading connected mailboxes therefore **stops working for every user every
  week** until the app is verified. So "launch unverified to 100 friends and see if it works" is not
  actually available: either verify, or re-consent everyone weekly.
- **It is also the wrong shape ethically.** A forward is one message the sender chose to share.
  A mailbox read is everything the filter catches, including mail the user never thought about and
  mail about other people. See Privacy below.

### Verdict

**A decision for Dhilen, not work to start.** It only becomes rational if the forwarding version
proves there is real demand *and* someone is willing to own a recurring $500–$4,500/yr bill, an
annual reassessment, and the duty of care that comes with holding other students' mail. The
forwarding version should run for a term first.

---

## On "a daily agent on Vercel calling an email MCP"

Two corrections worth making before this gets built, because they are easy to miss:

1. **An MCP server does not change Google's scope classification.** Reading a user's Gmail through
   an email MCP still consumes `gmail.readonly` (or `https://mail.google.com/`) on *someone's*
   OAuth client. If it is our client, we need the verification in approach 2. If it is the MCP
   vendor's client, then every connected student's mail flows through a third party's
   infrastructure under *their* terms — which is worse for the user, not better, and makes us
   dependent on a vendor for the project's core data. The MCP moves where the token lives; it does
   not remove the review.
2. **Vercel is the wrong scheduler here.** Hobby-plan cron jobs are **limited to once per day**,
   with no sub-daily expressions (they fail at deploy time), and the fire time drifts by up to an
   hour ([Vercel cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)).
   More to the point, the pipeline already has a scheduler on GitHub Actions with all the secrets,
   the Gemini model chain, the dedupe and the budget guard. A second scheduler on another platform
   means a second copy of the secrets and two places to debug, for nothing. Ingestion belongs in
   `pipeline/`, as a source.

Everything *good* about the idea — that this should be automatic, daily, read-only, and that the
reward for contributing is seeing more — survives both corrections intact.

---

## The per-user visibility model

Mohul's gating idea: you see the exclusive events only if you contribute your own. Worth being
explicit about what that costs, because today there is no concept of a user anywhere in the stack.

**What exists now** (`supabase/schema.sql`): RLS is on for every table, and there is exactly one
public policy —

```sql
create policy "public read events" on events for select to anon, authenticated using (true);
```

The website and the Expo app both read `events` with the publishable (anon) key and **have no
sign-in at all**. The pipeline uses the secret key and bypasses RLS entirely.

**What gating would actually require:**

1. **Auth.** Supabase Auth, Google sign-in (the `openid`/`email`/`profile` scopes are *not*
   sensitive or restricted — no verification, no CASA, and Google's basic-sign-in exception means
   no 7-day expiry). Free plan covers 50,000 MAU, far past anything this project will see
   (third-party figure, consistent across 2026 guides — worth confirming on Supabase's own pricing
   page before relying on it). Avoid magic links: the built-in SMTP is rate-limited to a few mails
   an hour and would need our own SMTP provider.
2. **A contributors table.**
   ```sql
   create table contributors (
     user_id    uuid primary key references auth.users on delete cascade,
     joined_at  timestamptz not null default now(),
     last_contribution_at timestamptz,
     active     boolean not null default true
   );
   alter table contributors enable row level security;
   create policy "read own contributor row" on contributors
     for select to authenticated using (user_id = (select auth.uid()));
   ```
3. **A visibility flag on events, not a second table.**
   ```sql
   alter table events add column visibility text not null default 'public'
     check (visibility in ('public', 'contributors'));
   ```
   **A separate `contributed_events` table is the wrong call.** `dedupe.py` fingerprints and merges
   against a single `events` table with a `unique (fingerprint)` constraint; `cleanup()` deletes
   from one table; `geocode`/`upsert`/`merge` all assume one. Splitting it means the same event
   arriving from a forward *and* from Berkeley Events becomes two rows that cannot see each other,
   plus two queries and a client-side merge in both the web app and the Expo app. One column and
   one extra policy keeps every existing code path working.
4. **Two policies instead of one.**
   ```sql
   drop policy "public read events" on events;
   create policy "public read public events" on events
     for select to anon, authenticated using (visibility = 'public');
   create policy "contributors read everything" on events
     for select to authenticated using (
       exists (select 1 from contributors c
                where c.user_id = (select auth.uid()) and c.active)
     );
   ```
   `(select auth.uid())` rather than bare `auth.uid()` so Postgres evaluates it once instead of per
   row, and `create index on contributors (user_id)` (the primary key covers it).
5. **Both clients need sign-in before this ships.** Narrowing the existing policy is a **breaking
   change**: the website and the app read anonymously, so the day the policy lands they silently
   stop seeing contributor-visible rows — no error, just missing pins. Order of operations must be:
   add the column defaulting to `public` → add auth + sign-in to the web app → only then start
   marking rows `contributors`.
6. **Keep the model binary.** "Contributors see contributor-sourced events" is one flag. Mohul's
   example — *he* sees LSBE only if he connects, others get EECS the same way — reads naturally as
   per-list reciprocity, but per-list targeting needs an event → mailing-list → subscriber mapping
   and makes every event visible to the fewest possible people, which is the opposite of the point.
   One flag, reciprocity at the level of "contribute anything, see everything".

**Rough size:** schema migration and policies, maybe an hour. Supabase Auth plus a sign-in flow,
session handling and a signed-in read path in `web/` (and separately in the Expo app) is the real
work — a day or two, and it changes `web/` substantially. **Out of scope for this PR**, which does
not touch `web/`.

**One open question for Dhilen before any of this:** gating makes a public map partly private, and
a signed-out visitor currently sees everything. Is "sign in to see the other 20%" worth the drop-off
on a map whose whole appeal is that you open it and there is a pin? A softer version — everything
public, contributors just get credited — keeps the funnel and loses only the incentive.

---

## Privacy

This is the part to be plain about, because the project already has a rule written *for exactly this
reason*: `CLAUDE.md` says Gmail must only ever read the `FreeFood` label, never the wider inbox.
That rule protects Dhilen's own mailbox, which he consented to. Ingesting other people's mail is
the same problem with someone else's consent.

**Forwarding (approach 1).** The forwarder consents per message, which is the strongest consent
model available here — but the *original sender* and the message's other recipients did not. And
the text goes to Gemini's free tier, where `Original Plan.md` already records that Google may train
on inputs. So forwarded mail must be treated as *about to be published*. The mitigations built into
the source below:
- **Sender allowlist**, defaulting to `berkeley.edu` — only forwards from Berkeley addresses are
  ingested at all. Cheap, and it matches the audience.
- **The forwarder's address is used for the allowlist check and then dropped.** It is never stored
  in `raw_items.text` and never reaches Gemini. (It will have to be stored *somewhere* when the
  contributor model arrives — that is a new column and a new consent line, not a quiet change.)
- **`To`/`Cc` are never copied into the stored text**, so other recipients are not collected.
- **Personal threads are skipped** the way `gmail.py` already skips them: a `Re:` subject with no
  `List-Id` is a conversation, not an announcement.
- Existing protections carry over: `raw_items` are deleted 14 days after processing, only extracted
  event fields are ever published, and only the pipeline's secret key can read `raw_items` at all.
- **`PRIVACY.md` needs a new section before the address is advertised**: what forwarding sends us,
  that the body goes to an AI model, what is kept (event fields), what is dropped (sender address,
  recipients), and how to ask for something to be removed. Drafting that is a small task but it is a
  real one, and it should land with the first public mention of the address.

**OAuth mailbox read (approach 2).** Strictly worse, and the CASA assessment is simply the formal
version of a duty we would genuinely be taking on: holding other students' mail on our servers,
with a filter we wrote deciding what gets read. The 100-user cap and the annual reassessment are
Google making us prove we can carry that. If we would not want to write the breach-notification
email, we should not hold the mail.

---

## What this PR actually ships

`pipeline/sources/forwarded.py` — transport (a), in the shape of the existing sources:

- Polls one IMAP mailbox (`FORWARD_IMAP_HOST`/`_USER`/`_PASSWORD`, optional `_FOLDER`,
  `FORWARD_ALLOWED_DOMAINS`) with stdlib `imaplib`; **no new dependency**.
- **No-ops with a printed note when unconfigured**, so the pipeline keeps working on any machine
  (or in Actions) without the new secrets, instead of logging a failed source every run.
- Reads unseen messages only, newest first, capped per run; marks them `\Seen` so they are not
  re-read; `source_id` is the RFC-822 `Message-ID`, so `raw_items`' unique constraint dedupes
  retries for free.
- **Unwraps the forward**: Gmail's `---------- Forwarded message ---------` block carries the
  original `From`/`Date`/`Subject`, and `posted_at` is taken from the *original* date, not the
  forward's. This matters — `extract.py` resolves "this Thursday" and "tonight" against
  `posted_at`, so using the forwarding time would shift relative dates.
- Shapes text exactly like `gmail.py` (`Subject:/From:/Date:/List:` header block, then the body;
  `strip_html` for HTML-only mail; 20k cap) so `extract.py`'s prompt sees a familiar item.
- Images: inline/attached images ≥15 KB go to the private `media` bucket via the existing
  `upload_media` (the path `instagram.py` already uses, and `extract.py` deletes them after
  reading); remote HTML images become `url:` refs; logos, trackers and tiny images are filtered with
  `gmail.py`'s rules.
- Reuses `extract.py` untouched, which means **club events still require `stated` food** — a
  forwarded club GM with no food mentioned is dropped by `extract.keep`, same as everywhere else.
- Registered in `auto_plan()` next to `gmail` (every run). The cost of a poll is one IMAP
  connection; the real budget is Gemini calls, which the existing per-run cap already governs, and
  the per-run item cap stops a forwarding burst from eating a day's quota.
- Tested offline in `pipeline/tests/test_forwarded.py` — IMAP and Supabase faked, so it costs
  nothing and never touches production.

**Not shipped, deliberately:** the custom domain (needs owner DNS), auth and the visibility model
(needs `web/` changes, out of scope), and anything OAuth.

---

## Decisions for Dhilen

1. **Create the forwarding mailbox** — one free account, 2SV on, app password generated — and add
   `FORWARD_IMAP_HOST`, `FORWARD_IMAP_USER`, `FORWARD_IMAP_PASSWORD` as GitHub Actions secrets.
   Until then the source no-ops and nothing breaks. **This is the only thing blocking the feature.**
2. **Optional, free: the pretty address.** Point MX for `dhilen.com` or `uberkfree.com` at
   Cloudflare Email Routing and forward `events@` into that mailbox. Needs whoever holds the
   domain's DNS; no pipeline change.
3. **`PRIVACY.md`**: approve the forwarding section before the address is advertised anywhere.
4. **Approach 2 (OAuth Gmail)**: park it. Revisit only with evidence of demand and a willingness to
   fund ~$500–$4,500/yr recurring plus annual reassessment.
5. **Gating**: is a sign-in gate worth the drop-off, or is credit without gating enough? This
   decides whether the auth work is ever scheduled.
