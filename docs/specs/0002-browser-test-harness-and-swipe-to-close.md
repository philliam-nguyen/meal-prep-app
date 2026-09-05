---
id: 0002
title: Browser test harness and swipe-to-close
status: accepted
date: 2026-09-05
adrs: [0005]
---

# Browser test harness and swipe-to-close

Vocabulary in this document follows `CONTEXT.md`. Decisions marked with an ADR reference are
recorded permanently in `docs/adr/`.

This spec was drafted through a local scratch tracker that is not part of the repository. This
committed copy is the authoritative content. It is the first of four specs from one design
session; the three that follow (Shopping List and Aisles, Pantry views, Recipe Steps and Batch)
depend on the harness this one creates.

## Problem Statement

On a phone, the Recipe sheet slides up from the bottom and shows a drag handle, but the handle does
nothing. The only way out is to tap the dimmed area above the sheet, which a long Recipe leaves
almost no room for. Every other bottom sheet on the phone closes when you pull it down, so the
cook pulls, nothing happens, and the app feels broken.

Underneath that, nothing in the repository can test what a finger does. The API is covered end to
end against a real Postgres (ADR-0005) and the pure frontend modules have unit tests, but the
rendered UI has no test at all. A gesture fix would ship with no proof it works and no protection
against the next change undoing it. The three specs that follow this one are all UI-heavy and
would inherit the same gap.

## Solution

A browser test harness, run by Playwright, that drives the real frontend against the real API on a
throwaway Postgres, on two device profiles: a desktop browser and an iPhone-sized WebKit browser
with touch enabled. It runs as its own CI job and gates the two publish jobs alongside the existing
tests.

The first and only test it carries: the Recipe sheet closes when dragged down far enough on the
phone, snaps back when released early, and closes on a tap outside on the desktop. The sheet
follows the finger while the drag is in progress, and the drag only begins when the sheet's own
content is scrolled to the top so a long ingredient list still scrolls.

## User Stories

1. As a cook on a phone, I want to pull the Recipe sheet down to close it, so that closing feels like every other sheet on my phone.
2. As a cook on a phone, I want the sheet to move with my finger while I drag, so that I can see it is responding before I commit.
3. As a cook on a phone, I want a short drag to snap the sheet back into place, so that an accidental nudge does not close what I was reading.
4. As a cook on a phone, I want a drag past a clear threshold to close the sheet with the same transition it opened with, so that the close feels intentional and finished.
5. As a cook on a phone reading a long Recipe, I want to scroll the ingredient list inside the sheet without the sheet closing, so that a long Recipe stays readable.
6. As a cook on a phone, I want the drag to take over only when the list is already scrolled to the top, so that scrolling up past the start becomes the close gesture naturally.
7. As a cook on a desktop, I want to keep closing the sheet by clicking outside it, so that nothing I already do changes.
8. As a cook on either device, I want the drag handle to be the visual cue for the gesture it now performs, so that the handle is not decoration.
9. As a cook on either device, I want the existing buttons inside the sheet to keep working during and after a drag that snapped back, so that the gesture never eats a tap.
10. As a maintainer, I want a browser test suite that runs against the real API and a real Postgres, so that a passing test means the whole stack worked and not a mock of it.
11. As a maintainer, I want the suite to run on a desktop profile and an iPhone WebKit profile, so that Safari-specific touch behaviour is caught before a phone finds it.
12. As a maintainer, I want the suite to be its own CI job, so that a flaky browser run cannot hide a failing API test and the fast unit path stays fast.
13. As a maintainer, I want the browser job to gate both publish jobs, so that neither Variant ships a UI that failed in a browser.
14. As a maintainer, I want one command that starts Postgres, the API and the frontend and runs the browser tests locally, so that running them is not a ritual.
15. As a maintainer, I want the browser tests to seed their own data through the API, so that they never depend on the Demo Variant's Seed and never touch the Homelab Variant.
16. As a maintainer writing the next three specs, I want a documented way to add a browser test, so that each feature ships with its own coverage without rediscovering the harness.
17. As a maintainer, I want the harness to leave the existing Node test runner and its global setup untouched, so that the two suites cannot break each other.

## Implementation Decisions

Rationale is included deliberately; the decisions below came out of the grilling session.

### The harness is Playwright against the real stack

Playwright drives a Vite dev server plus the API process, with the API pointed at a throwaway
Postgres started the same way the API tests start theirs. Three alternatives were rejected:

- **The built bundle in degraded mode with the recorded Seed** was rejected as the primary target
  because degraded mode disables every write, and the three specs that follow are write paths. It
  remains available as a fast lane for pure-UI gestures if a later spec wants it.
- **Mocking the API at the network layer** was rejected because the repository already decided
  that tests run against real Postgres (ADR-0005). A UI test passing against a mock proves the mock.
- **Adding UI tests to the Node test runner via jsdom** was rejected because the thing under test is
  a touch gesture and a scroll interaction, which jsdom does not model.

### Two projects, one test file

- **Desktop**: Chromium at a desktop viewport. Runs the click-outside-to-close case.
- **Mobile**: WebKit with Playwright's iPhone device descriptor, touch enabled. Runs the drag cases.

The mobile project is WebKit rather than Chromium because the Homelab Variant is used from iPhones
via Add to Home Screen, and touch and scroll edge cases differ between engines. Chromium mobile was
considered and dropped as a third project: the smoke tests that would have justified it were cut
from scope.

### The gesture

- The drag begins from anywhere on the sheet, not only the handle, but only when the sheet's
  scrollable content is at scroll position zero. Otherwise the touch scrolls the content as today.
- While dragging, the sheet translates with the finger. Dragging upward past its rest position is
  clamped.
- On release, if the sheet has travelled past a threshold, it closes using the existing close path
  so the overlay, focus and state all behave as a tap outside does. Otherwise it animates back.
- The threshold is a fraction of the sheet's height, not a pixel constant, so it behaves the same on
  a short and a tall sheet. The exact fraction and any velocity contribution are implementation
  detail for the ticket, not spec.
- Desktop keeps the existing overlay click. Mouse drag is not required.
- A drag that snaps back must not trigger the click handler of whatever was under the finger.

### The sheet component owns the gesture

The gesture lives in the Recipe sheet's container, the component that already owns open, close and
the slide-up animation. No shared gesture library is introduced for one gesture. If a second sheet
ever wants it, that is the moment to extract.

### Arranging Recipes

The browser tests create the Recipe they open through the API before the test, using the same
helpers the API tests use for creating Recipes, rather than reading a fixture. This keeps the
suite independent of the Seed and of any recorded data.

### Local and CI wiring

- A root script starts the throwaway Postgres, runs migrations, starts the API on a test port,
  starts Vite proxying to it, runs Playwright, then tears everything down. Playwright's own
  web-server support is preferred over a hand-rolled orchestrator where it fits.
- CI gains a `browser-tests` job: checkout, Node 24, `npm ci`, install the WebKit and Chromium
  browsers with their system dependencies, run the suite. Docker is available on the runner, so the
  throwaway Postgres boots as it does for the API tests.
- Both `publish-image` and `publish-bundle` list the new job in `needs` alongside `test`.
- Playwright's HTML report and traces on failure are uploaded as a CI artifact so a red run on the
  mobile project can be inspected without a phone.

### Documentation

A short section in the README's Tests section states how to run the browser suite locally, how to
add a test, and which project a test belongs to. The three following specs point at it.

## Testing Decisions

A good test here drives the page the way a person does and asserts what a person would see: the
sheet is gone, or the sheet is still there and back in place. It does not read component state,
inspect transform values mid-animation, or assert on class names.

Tests in this spec:

- **Mobile, drag past threshold**: open a Recipe, touch-drag the sheet down most of its height,
  release. The sheet and overlay are gone.
- **Mobile, short drag**: drag a small distance, release. The sheet is still visible and its
  content is still readable and tappable; a tap on Add to Shopping List still works.
- **Mobile, scrolled content**: open a Recipe with enough Recipe Ingredients to overflow the sheet,
  scroll the list down, then drag down. The list scrolls up rather than the sheet closing. Once at
  the top, a further drag closes the sheet.
- **Desktop, click outside**: open a Recipe, click the overlay, the sheet is gone.

Prior art: the API tests under the API package create Recipes through the app and assert on what
the next state read returns; their helpers for creating Recipes and Recipe Ingredients are the
model for the browser suite's setup. There is no prior browser test; this spec creates the
pattern.

The Node test runner, its global setup and the frontend bundle smoke test are not modified.

## Out of Scope

- Smoke tests for the other pages. Each following spec adds the browser coverage it needs.
- A Chromium mobile project. Revisit if an Android phone starts using the Homelab Variant.
- Swipe gestures anywhere other than the Recipe sheet. The Edit Recipe form takes over the page
  rather than opening a sheet, and stays that way.
- Mouse drag to close on desktop.
- Visual regression or screenshot comparison.
- Testing against the Demo Variant or any deployed instance.

## Further Notes

- WebKit on Linux CI is Playwright's own build, not Safari. It is close enough for touch and
  scroll semantics and is the best available without a device farm. A real iPhone check before
  merge is still worth a minute.
- The gesture uses pointer or touch events directly rather than a gesture library. If WebKit's
  handling of passive touch listeners fights the scroll-to-top rule, the ticket should record what
  it found; that is the one place this spec expects surprises.
- Ticket breakdown suggestion: (1) harness and CI job with a trivial page-loads test, (2) the
  gesture, (3) the four tests above, (4) the documentation section.
