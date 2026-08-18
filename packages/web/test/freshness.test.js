// Two people shopping from one list. The poll is what puts a Got It mark made on one phone onto the
// other, so what matters is that it notices a change, that it costs nothing when there isn't one,
// and that a phone in a pocket goes quiet.
//
// The browser is injected rather than mocked away: these tests hand the module a clock and a
// visibility flag they drive by hand, so nothing here waits on real time.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NO_BASELINE, startFreshnessPoll } from '../src/freshness.js';

/** A document and a clock the test drives, standing in for the browser's. */
function testBrowser({ hidden = false } = {}) {
  const visibilityListeners = new Set();
  let scheduled = null;

  return {
    hidden,
    isHidden() {
      return this.hidden;
    },
    watchVisibility(listener) {
      visibilityListeners.add(listener);
      return () => visibilityListeners.delete(listener);
    },
    every(intervalMs, run) {
      scheduled = run;
      return () => {
        scheduled = null;
      };
    },
    get polling() {
      return scheduled !== null;
    },
    /** One interval's worth of time. */
    async elapse() {
      await scheduled?.();
    },
    /** Backgrounds or foregrounds the document, the way locking a phone does. */
    async setHidden(value) {
      this.hidden = value;
      for (const listener of visibilityListeners) await listener();
    },
  };
}

/** Lets whatever is already in flight run as far as it can, without moving the poll's clock on. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/** A server whose version the test moves when it wants the poll to notice something. */
function testServer(version = 'v1') {
  const server = {
    version,
    asked: 0,
    readVersion() {
      server.asked += 1;
      return Promise.resolve(server.version);
    },
  };
  return server;
}

describe('the freshness poll', () => {
  it('refetches when the version moves', async () => {
    const browser = testBrowser();
    const server = testServer();
    let refetches = 0;
    startFreshnessPoll({
      view: 'shopping',
      versionOnScreen: () => 'v1',
      readVersion: server.readVersion,
      onStale: () => (refetches += 1),
      environment: browser,
    });

    server.version = 'v2';
    await browser.elapse();

    assert.equal(refetches, 1);
  });

  it('refetches nothing while the version holds still', async () => {
    const browser = testBrowser();
    const server = testServer();
    let refetches = 0;
    startFreshnessPoll({
      view: 'shopping',
      versionOnScreen: () => 'v1',
      readVersion: server.readVersion,
      onStale: () => (refetches += 1),
      environment: browser,
    });

    await browser.elapse();
    await browser.elapse();

    assert.equal(server.asked, 2);
    assert.equal(refetches, 0);
  });

  it('asks nothing until the app has data to be stale', async () => {
    const browser = testBrowser();
    const server = testServer();
    startFreshnessPoll({
      view: 'shopping',
      versionOnScreen: () => null,
      readVersion: server.readVersion,
      onStale: () => {},
      environment: browser,
    });

    await browser.elapse();

    assert.equal(server.asked, 0);
  });

  it('compares against what the last refetch arrived with, not what it asked about', async () => {
    const browser = testBrowser();
    const server = testServer();
    let onScreen = 'v1';
    let refetches = 0;
    startFreshnessPoll({
      view: 'shopping',
      versionOnScreen: () => onScreen,
      readVersion: server.readVersion,
      onStale: () => {
        refetches += 1;
        onScreen = server.version;
      },
      environment: browser,
    });

    server.version = 'v2';
    await browser.elapse();
    await browser.elapse();

    assert.equal(refetches, 1);
  });

  // Degraded mode is the case where there is nothing on screen worth comparing against: the app is
  // rendering the recording the bundle ships, which carries a version of its own. Adopting that
  // version would make recovery depend on it differing from the live one, so the app hands over
  // NO_BASELINE instead and the first version the API manages to answer with forces a refetch,
  // whatever it says (ADR-0009). The version below is the one the recording actually carries.
  it('refetches once out of degraded mode, whatever version the API comes back with', async () => {
    const browser = testBrowser();
    const server = testServer('recorded');
    let onScreen = NO_BASELINE;
    let refetches = 0;
    startFreshnessPoll({
      view: 'shopping',
      versionOnScreen: () => onScreen,
      readVersion: server.readVersion,
      onStale: () => {
        refetches += 1;
        onScreen = server.version;
      },
      environment: browser,
    });

    await browser.elapse();
    await browser.elapse();

    assert.equal(refetches, 1, 'the recorded version became the baseline it is compared against');
  });

  // What the poll does for the whole of an outage. It cannot tell a recovered API from an unchanged
  // one until one of them answers, so it keeps asking and the recording stays on screen until one
  // does.
  it('holds degraded mode while the API is still unreachable', async () => {
    const browser = testBrowser();
    let refetches = 0;
    startFreshnessPoll({
      view: 'shopping',
      versionOnScreen: () => NO_BASELINE,
      readVersion: () => Promise.reject(new Error('GET /api/version returned 502')),
      onStale: () => (refetches += 1),
      environment: browser,
    });

    await browser.elapse();
    await browser.elapse();

    assert.equal(refetches, 0);
    assert.equal(browser.polling, true, 'the poll gave up, so recovery would need a page reload');
  });

  // The way back cannot depend on which view happens to be open. Nothing on the Add form goes stale,
  // so nothing polls there normally, and a visitor reading the line degraded mode puts in place of
  // the form would otherwise sit in front of it long after the backend came back.
  it('watches a view that cannot go stale while the recording is on screen', async () => {
    const browser = testBrowser();
    const server = testServer('recorded');
    let onScreen = NO_BASELINE;
    let refetches = 0;
    startFreshnessPoll({
      view: 'add',
      versionOnScreen: () => onScreen,
      readVersion: server.readVersion,
      onStale: () => {
        refetches += 1;
        onScreen = server.version;
      },
      environment: browser,
    });

    await browser.elapse();
    await browser.elapse();

    assert.equal(refetches, 1);
    assert.equal(browser.polling, false, 'it kept polling a view with nothing left to watch for');
  });

  it('does not pile a second refetch on top of a slow one', async () => {
    const browser = testBrowser();
    const server = testServer();
    let refetches = 0;
    let finishRefetch;
    const refetching = new Promise((resolve) => {
      finishRefetch = resolve;
    });
    startFreshnessPoll({
      view: 'shopping',
      versionOnScreen: () => 'v1',
      readVersion: server.readVersion,
      onStale: () => {
        refetches += 1;
        return refetching;
      },
      environment: browser,
    });

    server.version = 'v2';
    const slowRefetch = browser.elapse();
    // The version reply lands and the reload starts, and there it sits.
    await settle();
    // The interval that arrives while that reload is still in flight, which is the one that would
    // otherwise start a second reload on top of it.
    await browser.elapse();
    finishRefetch();
    await slowRefetch;

    assert.equal(refetches, 1);
    assert.equal(server.asked, 1);
  });

  it('goes quiet when the phone goes into a pocket', async () => {
    const browser = testBrowser();
    const server = testServer();
    startFreshnessPoll({
      view: 'shopping',
      versionOnScreen: () => 'v1',
      readVersion: server.readVersion,
      onStale: () => {},
      environment: browser,
    });

    await browser.setHidden(true);
    await browser.elapse();

    assert.equal(browser.polling, false);
    assert.equal(server.asked, 0);
  });

  it('catches up the moment the phone comes back out', async () => {
    const browser = testBrowser({ hidden: true });
    const server = testServer();
    let refetches = 0;
    startFreshnessPoll({
      view: 'shopping',
      versionOnScreen: () => 'v1',
      readVersion: server.readVersion,
      onStale: () => (refetches += 1),
      environment: browser,
    });
    server.version = 'v2';

    await browser.setHidden(false);

    assert.equal(browser.polling, true);
    assert.equal(refetches, 1, 'a phone coming back should not wait out an interval first');
  });

  it('asks nothing while the document is hidden', async () => {
    const browser = testBrowser({ hidden: true });
    const server = testServer();
    startFreshnessPoll({
      view: 'shopping',
      versionOnScreen: () => 'v1',
      readVersion: server.readVersion,
      onStale: () => {},
      environment: browser,
    });

    assert.equal(browser.polling, false);
    assert.equal(server.asked, 0);
  });

  it('never asks at all on a view that cannot go stale', async () => {
    const browser = testBrowser();
    const server = testServer();
    startFreshnessPoll({
      view: 'add',
      versionOnScreen: () => 'v1',
      readVersion: server.readVersion,
      onStale: () => {},
      environment: browser,
    });

    server.version = 'v2';
    await browser.elapse();

    assert.equal(browser.polling, false);
    assert.equal(server.asked, 0);
  });

  it('stops for good once the view is left', async () => {
    const browser = testBrowser();
    const server = testServer();
    const poll = startFreshnessPoll({
      view: 'shopping',
      versionOnScreen: () => 'v1',
      readVersion: server.readVersion,
      onStale: () => {},
      environment: browser,
    });

    poll.stop();
    await browser.setHidden(false);
    await browser.elapse();

    assert.equal(server.asked, 0);
  });
});
