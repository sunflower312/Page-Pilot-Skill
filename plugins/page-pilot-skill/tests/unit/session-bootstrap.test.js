import test from 'node:test';
import assert from 'node:assert/strict';

import { openHydratedSession } from '../../scripts/lib/session-bootstrap.js';

test('openHydratedSession closes the opened session when site intelligence hydrate fails', async () => {
  const session = { id: 'session-1', title: 'Example', url: 'https://learn.example.com' };
  const browserManager = {
    openSession: async () => session,
    closeSession: async (sessionId) => {
      assert.equal(sessionId, 'session-1');
      browserManager.closed = true;
      return true;
    },
    closed: false,
  };
  const siteIntelligenceStore = {
    hydrateSession: async () => {
      throw new Error('Corrupted site intelligence');
    },
  };

  await assert.rejects(
    openHydratedSession({
      browserManager,
      siteIntelligenceStore,
      openOptions: { url: 'https://learn.example.com' },
    }),
    /Corrupted site intelligence/
  );
  assert.equal(browserManager.closed, true);
});
