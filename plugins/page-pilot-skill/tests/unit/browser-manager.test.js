import test from 'node:test';
import assert from 'node:assert/strict';

import { BrowserManager } from '../../scripts/lib/browser-manager.js';

test('openSession closes context when navigation fails before session registration', async () => {
  let closed = 0;
  const manager = new BrowserManager({ idleMs: 1000 });
  manager.ensureBrowser = async () => ({
    async newContext() {
      return {
        async newPage() {
          return {
            async goto() {
              throw new Error('navigation failed');
            },
          };
        },
        async close() {
          closed += 1;
        },
      };
    },
  });

  await assert.rejects(() => manager.openSession({ url: 'http://fixture.local/' }), /navigation failed/);
  assert.equal(closed, 1);
  assert.equal(manager.sessions.size, 0);
});

test('openSession closes browser when context creation fails and no sessions exist', async () => {
  let browserClosed = 0;
  const manager = new BrowserManager({ idleMs: 1000 });
  manager.ensureBrowser = async () => ({
    async newContext() {
      throw new Error('context failed');
    },
  });
  manager.closeBrowser = async () => {
    browserClosed += 1;
  };

  await assert.rejects(() => manager.openSession({ url: 'http://fixture.local/' }), /context failed/);
  assert.equal(browserClosed, 1);
  assert.equal(manager.sessions.size, 0);
});

test('touchSession refreshes expiry and current URL', () => {
  const manager = new BrowserManager({ idleMs: 5000 });
  const session = {
    page: {
      url() {
        return 'http://fixture.local/updated';
      },
    },
    expiresAt: 0,
    lastTouchedAt: 0,
    url: 'http://fixture.local/original',
  };

  manager.touchSession(session);

  assert.equal(session.url, 'http://fixture.local/updated');
  assert.equal(session.expiresAt > session.lastTouchedAt, true);
});

test('sweepExpiredSessions closes expired sessions', async () => {
  let closed = 0;
  const manager = new BrowserManager({ idleMs: 1000 });
  manager.browser = {
    async close() {},
  };

  manager.sessions.set('expired', {
    expiresAt: Date.now() - 10,
    context: {
      async close() {
        closed += 1;
      },
    },
  });

  await manager.sweepExpiredSessions();

  assert.equal(closed, 1);
  assert.equal(manager.sessions.size, 0);
});

test('getSession closes stale sessions whose page is already closed', async () => {
  let closed = 0;
  const manager = new BrowserManager({ idleMs: 5000 });
  manager.browser = {
    async close() {},
  };
  manager.sessions.set('stale', {
    expiresAt: Date.now() + 5000,
    page: {
      isClosed() {
        return true;
      },
      url() {
        return 'http://fixture.local/stale';
      },
    },
    context: {
      async close() {
        closed += 1;
      },
    },
  });

  const session = manager.getSession('stale');
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(session, null);
  assert.equal(closed, 1);
  assert.equal(manager.sessions.size, 0);
});

test('withSession keeps in-flight sessions alive while the sweeper runs', async () => {
  let closed = 0;
  let releaseWork;
  const manager = new BrowserManager({ idleMs: 50 });
  manager.browser = {
    async close() {},
  };

  manager.sessions.set('active', {
    id: 'active',
    expiresAt: Date.now() + 50,
    lastTouchedAt: Date.now(),
    page: {
      isClosed() {
        return false;
      },
      url() {
        return 'http://fixture.local/active';
      },
    },
    context: {
      async close() {
        closed += 1;
      },
    },
  });

  const work = manager.withSession('active', async () => {
    const activeSession = manager.sessions.get('active');
    activeSession.expiresAt = Date.now() - 1;
    await new Promise((resolve) => {
      releaseWork = resolve;
    });
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  await manager.sweepExpiredSessions();

  assert.equal(closed, 0);
  assert.equal(manager.sessions.has('active'), true);

  releaseWork();
  await work;

  const session = manager.sessions.get('active');
  assert.equal(session.expiresAt > Date.now(), true);
});
