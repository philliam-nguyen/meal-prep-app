# 10 - Freshness without a held-open connection

Status: ready-for-agent

**What to build:** Two people shopping together work from one list. A Got It mark made on one phone
shows up on the other within a few seconds, with nobody navigating anywhere or reaching for a refresh
button, so they do not both buy the milk.

The API exposes a cheap version endpoint returning the maximum update timestamp across mutable state.
The client polls it on a short interval, only while the document is visible and only on the views
where staleness matters, and refetches real data when the value moves. An unchanged poll costs a few
bytes, and a backgrounded phone costs nothing.

No server-sent events and no websockets. Beyond being more than boolean toggles require, a long-lived
connection per visitor is server-side state an anonymous visitor can hold open on the public
instance, which is the shape of thing the guardrails exist to avoid (ADR-0001).

There are no write conflicts to resolve. Every write targets an independent field, so last-write-wins
is correct here rather than a compromise. Stale reads are the whole problem.

**Blocked by:** 06 (the Shopping List toggles, which are what two phones actually race on). Writes
exist from ticket 05, so this could be pulled earlier at the cost of having nothing worth polling
for.

- [ ] The version endpoint advances after a write and holds steady otherwise, proven by a test
- [ ] A change made in one browser appears in a second within a few seconds with no navigation
- [ ] Polling stops while the document is hidden and resumes when it becomes visible
- [ ] An unchanged version triggers no data refetch
- [ ] The endpoint costs one cheap query and returns a small body
- [ ] Views where staleness does not matter do not poll
