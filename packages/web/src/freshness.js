// Two people shopping together work from one list, and a Got It mark made on one phone has to reach
// the other before they both buy the milk. This asks the API for a version every few seconds and
// tells the app to refetch when that version moves.
//
// A poll rather than a server-sent event stream or a websocket: a long-lived connection per visitor
// is server-side state an anonymous visitor can hold open on the public instance, which is the shape
// of thing the guardrails exist to avoid (ADR-0001). An unchanged poll costs a few dozen bytes.
//
// The browser is reached through the environment below rather than directly, so the polling rules
// can be driven by a test with a clock it controls instead of by waiting.

// Long enough that a phone left on the shop shelf is not chattering, short enough that the other
// cook has not walked past the onions by the time it arrives.
const POLL_INTERVAL_MS = 4000;

// Staleness matters where two phones write to the same thing. Nobody else is filling in the Add
// form, and Settings has nothing shared to go stale.
const VIEWS_THAT_GO_STALE = new Set(['recipes', 'shopping', 'pantry']);

const browserEnvironment = {
  isHidden: () => document.hidden,
  watchVisibility(listener) {
    document.addEventListener('visibilitychange', listener);
    return () => document.removeEventListener('visibilitychange', listener);
  },
  every(intervalMs, run) {
    const id = setInterval(run, intervalMs);
    return () => clearInterval(id);
  },
};

// Handed back for a view that cannot go stale, so the caller starts a poll either way instead of
// asking first and remembering to.
const NOT_WATCHING = { stop() {} };

/**
 * Watches the API's version for changes and calls `onStale` when it finds one. Returns a handle
 * with `stop()`.
 *
 * `versionOnScreen` is read rather than pushed, so the version the app's data arrived with has one
 * home and this cannot hold a second copy that has fallen behind it. Until it returns something,
 * nothing is asked at all: there is no data to be stale yet, and a version adopted before the
 * payload it belongs to would be a change that silently never arrives.
 */
export function startFreshnessPoll({
  view,
  versionOnScreen,
  readVersion,
  onStale,
  environment = browserEnvironment,
}) {
  if (!VIEWS_THAT_GO_STALE.has(view)) return NOT_WATCHING;

  let busy = false;
  let stopPolling = null;

  const check = async () => {
    const shown = versionOnScreen();
    // One at a time, and that covers the refetch as well as the poll. A reload slower than the
    // interval would otherwise have a second one started on top of it, and then a third, stacking
    // requests on exactly the connection least able to carry them.
    if (shown === null || busy) return;

    busy = true;
    try {
      const version = await readVersion();
      // Awaited so that what the refetch arrives with is on screen before the next poll compares
      // against it. A refetch that fails leaves the version where it was, and the next poll asks
      // again rather than treating the change as delivered.
      if (version !== shown) await onStale();
    } catch {
      // A poll that cannot reach the API is not worth telling the cook about. The next one either
      // works, or their next tick fails loudly on its own.
    } finally {
      busy = false;
    }
  };

  const resume = () => {
    stopPolling ??= environment.every(POLL_INTERVAL_MS, check);
  };

  const pause = () => {
    stopPolling?.();
    stopPolling = null;
  };

  const onVisibilityChange = () => {
    if (environment.isHidden()) {
      pause();
      return;
    }
    resume();
    // A phone coming out of a pocket has the most catching up to do, so it does not wait out an
    // interval first.
    check();
  };

  const unwatch = environment.watchVisibility(onVisibilityChange);
  if (!environment.isHidden()) resume();

  return {
    stop() {
      pause();
      unwatch();
    },
  };
}
