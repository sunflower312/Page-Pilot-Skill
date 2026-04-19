import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SiteIntelligenceStore } from '../../scripts/lib/site-intelligence-store.js';
import {
  buildSiteProfile,
  recordFailureRun,
  recordStateModel,
  recordStateTransition,
  recordSuccessfulRun,
} from '../../scripts/lib/workflow-intelligence.js';

function createStateModel(url = 'https://learn.example.com/login') {
  return {
    fingerprint: 'https://learn.example.com/login|auth|sign in',
    pageType: 'auth',
    readiness: 'awaiting_input',
    url,
    normalizedUrl: 'https://learn.example.com/login',
    summaryLabel: 'Sign in',
    primaryAction: {
      label: 'Sign in',
      locator: { strategy: 'role', value: { role: 'button', name: 'Sign in' } },
    },
  };
}

test('SiteIntelligenceStore persists sanitized workflow templates across sessions', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'page-pilot-skill-site-store-'));
  const store = new SiteIntelligenceStore({ rootDir });
  const session = {
    url: 'https://learn.example.com/login',
    page: { url: () => 'https://learn.example.com/login' },
  };

  try {
    recordSuccessfulRun(session, {
      goal: '登录并进入学习模块',
      stateModel: createStateModel(),
      finalUrl: 'https://learn.example.com/dashboard?token=secret',
      steps: [
        { type: 'navigate', url: 'https://learn.example.com/login?otp=123456' },
        { type: 'fill', locator: { strategy: 'label', value: 'Email' }, value: 'qa@example.com' },
        { type: 'fill', locator: { strategy: 'label', value: 'Password' }, value: 'correct-horse' },
        {
          type: 'click',
          locator: { strategy: 'role', value: { role: 'button', name: 'Sign in' } },
          stability: { settled: true, trigger: 'url_change' },
        },
        { type: 'assert_text', locator: { strategy: 'css', value: '#status' }, value: 'Thanks qa@example.com' },
        { type: 'assert_url', value: 'https://learn.example.com/dashboard?token=secret' },
      ],
    });
    recordFailureRun(session, {
      error: { message: 'Expected Thanks qa@example.com but saw different text', code: 'ASSERTION_FAILED' },
      action: { type: 'assert_text', locator: { strategy: 'css', value: '#status' } },
      stateModel: createStateModel('https://learn.example.com/dashboard?token=secret'),
    });

    await store.persistSession(session);

    const persisted = await store.loadForUrl('https://learn.example.com/login');
    const serialized = JSON.stringify(persisted);
    assert.equal(serialized.includes('qa@example.com'), false);
    assert.equal(serialized.includes('correct-horse'), false);
    assert.equal(serialized.includes('token=secret'), false);
    assert.equal(serialized.includes('otp=123456'), false);
    assert.deepEqual(
      persisted.workflows[0].template.map((step) => [step.type, step.valueKey ?? null]),
      [
        ['navigate', null],
        ['fill', 'email'],
        ['fill', 'password'],
        ['click', null],
        ['assert_text', null],
        ['assert_url', null],
      ]
    );
    assert.equal(persisted.workflows[0].finalUrl.includes('?'), false);
    assert.equal(persisted.failures[0].message.includes('qa@example.com'), false);

    const resumedSession = {
      url: 'https://learn.example.com/login',
      page: { url: () => 'https://learn.example.com/login' },
    };
    await store.hydrateSession(resumedSession);
    const siteProfile = buildSiteProfile(resumedSession);

    assert.equal(siteProfile.workflowTemplates.length, 1);
    assert.equal(siteProfile.workflowTemplates[0].template.some((step) => step.valueKey === 'password'), true);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('SiteIntelligenceStore merges concurrent session writes for the same site instead of overwriting knowledge', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'page-pilot-skill-site-store-concurrent-'));
  const store = new SiteIntelligenceStore({ rootDir });
  const sessionA = {
    url: 'https://learn.example.com/login',
    page: { url: () => 'https://learn.example.com/login' },
  };
  const sessionB = {
    url: 'https://learn.example.com/login',
    page: { url: () => 'https://learn.example.com/login' },
  };

  try {
    await store.hydrateSession(sessionA);
    await store.hydrateSession(sessionB);

    recordStateModel(sessionA, { ...createStateModel(), fingerprint: 'state-a', summaryLabel: 'State A' });
    await store.persistSession(sessionA);

    recordStateModel(sessionB, { ...createStateModel(), fingerprint: 'state-b', summaryLabel: 'State B' });
    await store.persistSession(sessionB);

    const persisted = await store.loadForUrl('https://learn.example.com/login');
    assert.equal(Object.keys(persisted.states).includes('state-a'), true);
    assert.equal(Object.keys(persisted.states).includes('state-b'), true);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('SiteIntelligenceStore only persists incremental state observations after hydrate', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'page-pilot-skill-site-store-delta-'));
  const store = new SiteIntelligenceStore({ rootDir });
  const initialSession = {
    url: 'https://learn.example.com/login',
    page: { url: () => 'https://learn.example.com/login' },
  };

  try {
    await store.hydrateSession(initialSession);
    recordStateModel(initialSession, { ...createStateModel(), fingerprint: 'state-a', summaryLabel: 'State A' });
    await store.persistSession(initialSession);

    const resumedSession = {
      url: 'https://learn.example.com/login',
      page: { url: () => 'https://learn.example.com/login' },
    };
    await store.hydrateSession(resumedSession);
    recordStateModel(resumedSession, { ...createStateModel(), fingerprint: 'state-a', summaryLabel: 'State A' });
    await store.persistSession(resumedSession);

    const persisted = await store.loadForUrl('https://learn.example.com/login');
    assert.equal(persisted.states['state-a'].seenCount, 2);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('SiteIntelligenceStore accumulates concurrent increments for the same learned transition', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'page-pilot-skill-site-store-transition-'));
  const store = new SiteIntelligenceStore({ rootDir });
  const fromState = { ...createStateModel(), fingerprint: 'catalog-state', pageType: 'listing', summaryLabel: 'Catalog' };
  const toState = { ...createStateModel('https://learn.example.com/course/react'), fingerprint: 'lesson-state', pageType: 'learning' };

  try {
    const seedSession = {
      url: 'https://learn.example.com/login',
      page: { url: () => 'https://learn.example.com/login' },
    };
    await store.hydrateSession(seedSession);
    recordStateTransition(seedSession, {
      fromState,
      toState,
      phaseId: 'navigate_to_target',
      actions: [{ type: 'click', locator: { strategy: 'role', value: { role: 'link', name: 'React Basics' } } }],
      goal: '进入 React Basics 模块',
    });
    await store.persistSession(seedSession);

    const sessionA = {
      url: 'https://learn.example.com/login',
      page: { url: () => 'https://learn.example.com/login' },
    };
    const sessionB = {
      url: 'https://learn.example.com/login',
      page: { url: () => 'https://learn.example.com/login' },
    };
    await store.hydrateSession(sessionA);
    await store.hydrateSession(sessionB);

    recordStateTransition(sessionA, {
      fromState,
      toState,
      phaseId: 'navigate_to_target',
      actions: [{ type: 'click', locator: { strategy: 'role', value: { role: 'link', name: 'React Basics' } } }],
      goal: '进入 React Basics 模块',
    });
    await store.persistSession(sessionA);

    recordStateTransition(sessionB, {
      fromState,
      toState,
      phaseId: 'navigate_to_target',
      actions: [{ type: 'click', locator: { strategy: 'role', value: { role: 'link', name: 'React Basics' } } }],
      goal: '进入 React Basics 模块',
    });
    await store.persistSession(sessionB);

    const persisted = await store.loadForUrl('https://learn.example.com/login');
    assert.equal(persisted.transitions['catalog-state'][0].count, 3);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('SiteIntelligenceStore keeps site intelligence isolated per site key', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'page-pilot-skill-site-store-isolation-'));
  const store = new SiteIntelligenceStore({ rootDir });
  const session = {
    url: 'https://a.example/login',
    page: { url: () => 'https://b.example/dashboard' },
  };

  try {
    await store.hydrateSession(session);
    recordStateModel(session, {
      ...createStateModel('https://a.example/login'),
      fingerprint: 'a-state',
      summaryLabel: 'State A',
    });
    recordStateModel(session, {
      ...createStateModel('https://b.example/dashboard'),
      fingerprint: 'b-state',
      summaryLabel: 'State B',
      pageType: 'listing',
    });

    await store.persistSession(session);

    const persistedA = await store.loadForUrl('https://a.example/login');
    const persistedB = await store.loadForUrl('https://b.example/dashboard');
    assert.equal(Object.keys(persistedA.states).includes('a-state'), true);
    assert.equal(Object.keys(persistedA.states).includes('b-state'), false);
    assert.equal(persistedA.lastStateModel.url, 'https://a.example/login');
    assert.equal(Object.keys(persistedB.states).includes('a-state'), false);
    assert.equal(Object.keys(persistedB.states).includes('b-state'), true);
    assert.equal(persistedB.lastStateModel.url, 'https://b.example/dashboard');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('SiteIntelligenceStore redacts sensitive primary action details from persisted last state models', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'page-pilot-skill-site-store-state-redaction-'));
  const store = new SiteIntelligenceStore({ rootDir });
  const session = {
    url: 'https://learn.example.com/login',
    page: { url: () => 'https://learn.example.com/login' },
  };

  try {
    await store.hydrateSession(session);
    recordStateModel(session, {
      ...createStateModel('https://learn.example.com/dashboard?token=secret'),
      fingerprint: 'dashboard-state',
      summaryLabel: 'Continue as qa@example.com',
      primaryAction: {
        label: 'Continue as qa@example.com token=secret',
        locator: {
          strategy: 'role',
          value: { role: 'button', name: 'Continue as qa@example.com token=secret' },
        },
      },
    });

    await store.persistSession(session);

    const persisted = await store.loadForUrl('https://learn.example.com/login');
    const serialized = JSON.stringify(persisted.lastStateModel);
    assert.equal(serialized.includes('qa@example.com'), false);
    assert.equal(serialized.includes('token=secret'), false);
    assert.equal(persisted.lastStateModel.primaryAction.label.includes('[redacted-email]'), true);
    assert.equal(persisted.lastStateModel.primaryAction.locator, null);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('SiteIntelligenceStore redacts transition summaries and failure locators before persisting', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'page-pilot-skill-site-store-redaction-'));
  const store = new SiteIntelligenceStore({ rootDir });
  const session = {
    url: 'https://learn.example.com/login',
    page: { url: () => 'https://learn.example.com/login' },
  };
  const fromState = { ...createStateModel(), fingerprint: 'catalog-state', pageType: 'listing', summaryLabel: 'Catalog' };
  const toState = {
    ...createStateModel('https://learn.example.com/invoice'),
    fingerprint: 'invoice-state',
    pageType: 'detail',
    summaryLabel: 'Invoice for qa@example.com token=secret',
  };

  try {
    await store.hydrateSession(session);
    recordStateTransition(session, {
      fromState,
      toState,
      phaseId: 'navigate_to_target',
      actions: [{ type: 'click', locator: { strategy: 'role', value: { role: 'link', name: 'Open invoice' } } }],
      goal: '打开发票页面',
    });
    recordFailureRun(session, {
      error: { message: 'Click failed' },
      action: { type: 'click', locator: { strategy: 'text', value: 'qa@example.com token=secret' } },
      stateModel: toState,
    });

    await store.persistSession(session);

    const persisted = await store.loadForUrl('https://learn.example.com/login');
    const serialized = JSON.stringify(persisted);
    assert.equal(serialized.includes('qa@example.com'), false);
    assert.equal(serialized.includes('token=secret'), false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('SiteIntelligenceStore records cross-origin successful workflows under the starting origin', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'page-pilot-skill-site-store-cross-origin-'));
  const store = new SiteIntelligenceStore({ rootDir });
  const session = {
    url: 'https://auth.example.com/login',
    page: { url: () => 'https://app.example.com/dashboard' },
  };

  try {
    recordSuccessfulRun(session, {
      goal: '登录后进入应用',
      initialUrl: 'https://auth.example.com/login',
      stateModel: {
        ...createStateModel('https://app.example.com/dashboard'),
        fingerprint: 'https://app.example.com/dashboard|content|dashboard',
        normalizedUrl: 'https://app.example.com/dashboard',
        pageType: 'content',
        readiness: 'content_ready',
        summaryLabel: 'Dashboard',
      },
      finalUrl: 'https://app.example.com/dashboard',
      steps: [
        { type: 'fill', locator: { strategy: 'label', value: 'Email' }, value: 'qa@example.com' },
        { type: 'fill', locator: { strategy: 'label', value: 'Password' }, value: 'correct-horse' },
        {
          type: 'click',
          locator: { strategy: 'role', value: { role: 'button', name: 'Sign in' } },
          stability: { settled: true, trigger: 'url_change' },
        },
      ],
    });

    await store.persistSession(session);

    const authProfile = await store.loadForUrl('https://auth.example.com/login');
    const appProfile = await store.loadForUrl('https://app.example.com/dashboard');
    assert.equal(authProfile.workflows.length, 1);
    assert.equal(Object.keys(authProfile.locatorStats).length > 0, true);
    assert.equal(appProfile.workflows.length, 0);
    assert.equal(appProfile.states['https://app.example.com/dashboard|content|dashboard'].siteKey, 'https://app.example.com');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('SiteIntelligenceStore keeps identical workflow templates for different origins separated', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'page-pilot-skill-site-store-workflows-'));
  const store = new SiteIntelligenceStore({ rootDir });
  const session = {
    url: 'https://tenant-a.example/login',
    page: { url: () => 'https://app.example.com/dashboard' },
  };

  try {
    recordSuccessfulRun(session, {
      goal: '登录后进入应用',
      initialUrl: 'https://tenant-a.example/login',
      stateModel: {
        ...createStateModel('https://app.example.com/dashboard'),
        fingerprint: 'https://app.example.com/dashboard|content|dashboard',
        normalizedUrl: 'https://app.example.com/dashboard',
        pageType: 'content',
        readiness: 'content_ready',
        summaryLabel: 'Dashboard',
      },
      finalUrl: 'https://app.example.com/dashboard',
      steps: [{ type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Continue' } } }],
    });
    recordSuccessfulRun(session, {
      goal: '登录后进入应用',
      initialUrl: 'https://tenant-b.example/login',
      stateModel: {
        ...createStateModel('https://app.example.com/dashboard'),
        fingerprint: 'https://app.example.com/dashboard|content|dashboard',
        normalizedUrl: 'https://app.example.com/dashboard',
        pageType: 'content',
        readiness: 'content_ready',
        summaryLabel: 'Dashboard',
      },
      finalUrl: 'https://app.example.com/dashboard',
      steps: [{ type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Continue' } } }],
    });

    await store.persistSession(session);

    const tenantA = await store.loadForUrl('https://tenant-a.example/login');
    const tenantB = await store.loadForUrl('https://tenant-b.example/login');
    assert.equal(tenantA.workflows.length, 1);
    assert.equal(tenantB.workflows.length, 1);
    assert.equal(tenantA.workflows[0].siteKey, 'https://tenant-a.example');
    assert.equal(tenantB.workflows[0].siteKey, 'https://tenant-b.example');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('SiteIntelligenceStore separates site intelligence by origin, not just host', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'page-pilot-skill-site-store-origin-'));
  const store = new SiteIntelligenceStore({ rootDir });
  const session = {
    url: 'http://example.com/login',
    page: { url: () => 'https://example.com/login' },
  };

  try {
    await store.hydrateSession(session);
    recordStateModel(session, {
      ...createStateModel('http://example.com/login'),
      fingerprint: 'http://example.com/login|auth|sign in',
      normalizedUrl: 'http://example.com/login',
      summaryLabel: 'HTTP Login',
    });
    recordStateModel(session, {
      ...createStateModel('https://example.com/login'),
      fingerprint: 'https://example.com/login|auth|sign in',
      normalizedUrl: 'https://example.com/login',
      summaryLabel: 'HTTPS Login',
    });

    await store.persistSession(session);

    const httpProfile = await store.loadForUrl('http://example.com/login');
    const httpsProfile = await store.loadForUrl('https://example.com/login');
    assert.equal(Object.keys(httpProfile.states).includes('http://example.com/login|auth|sign in'), true);
    assert.equal(Object.keys(httpProfile.states).includes('https://example.com/login|auth|sign in'), false);
    assert.equal(Object.keys(httpsProfile.states).includes('https://example.com/login|auth|sign in'), true);
    assert.equal(Object.keys(httpsProfile.states).includes('http://example.com/login|auth|sign in'), false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('SiteIntelligenceStore keeps identical locators isolated per origin', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'page-pilot-skill-site-store-locators-'));
  const store = new SiteIntelligenceStore({ rootDir });
  const session = {
    url: 'https://a.example/login',
    page: { url: () => 'https://b.example/dashboard' },
  };

  try {
    recordSuccessfulRun(session, {
      goal: '在 A 站点继续',
      initialUrl: 'https://a.example/login',
      stateModel: {
        ...createStateModel('https://a.example/dashboard'),
        fingerprint: 'https://a.example/dashboard|content|dashboard',
        normalizedUrl: 'https://a.example/dashboard',
        pageType: 'content',
        readiness: 'content_ready',
        summaryLabel: 'Dashboard A',
      },
      finalUrl: 'https://a.example/dashboard',
      steps: [{ type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Continue' } } }],
    });
    recordSuccessfulRun(session, {
      goal: '在 B 站点继续',
      initialUrl: 'https://b.example/login',
      stateModel: {
        ...createStateModel('https://b.example/dashboard'),
        fingerprint: 'https://b.example/dashboard|content|dashboard',
        normalizedUrl: 'https://b.example/dashboard',
        pageType: 'content',
        readiness: 'content_ready',
        summaryLabel: 'Dashboard B',
      },
      finalUrl: 'https://b.example/dashboard',
      steps: [{ type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Continue' } } }],
    });

    await store.persistSession(session);

    const profileA = await store.loadForUrl('https://a.example/login');
    const profileB = await store.loadForUrl('https://b.example/login');
    assert.equal(Object.keys(profileA.locatorStats).length, 1);
    assert.equal(Object.keys(profileB.locatorStats).length, 1);
    assert.equal(Object.values(profileA.locatorStats)[0].siteKey, 'https://a.example');
    assert.equal(Object.values(profileA.locatorStats)[0].count, 1);
    assert.equal(Object.values(profileB.locatorStats)[0].siteKey, 'https://b.example');
    assert.equal(Object.values(profileB.locatorStats)[0].count, 1);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('SiteIntelligenceStore redacts opaque URL payloads from persisted state', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'page-pilot-skill-site-store-opaque-'));
  const store = new SiteIntelligenceStore({ rootDir });
  const session = {
    url: 'data:text/html,<h1>secret@example.com token=abc</h1>',
    page: { url: () => 'data:text/html,<h1>secret@example.com token=abc</h1>' },
  };

  try {
    await store.hydrateSession(session);
    recordStateModel(session, {
      fingerprint: 'data://opaque|content|payload',
      pageType: 'content',
      readiness: 'content_ready',
      url: 'data:text/html,<h1>secret@example.com token=abc</h1>',
      normalizedUrl: 'data:text/html,<h1>secret@example.com token=abc</h1>',
      summaryLabel: 'Opaque payload',
      primaryAction: null,
    });

    await store.persistSession(session);

    const persisted = await store.loadForUrl('data:text/html,<h1>secret@example.com token=abc</h1>');
    const serialized = JSON.stringify(persisted);
    assert.equal(serialized.includes('secret@example.com'), false);
    assert.equal(serialized.includes('token=abc'), false);
    assert.equal(persisted.lastStateModel.url, 'data://opaque');
    assert.equal(persisted.lastStateModel.normalizedUrl, 'data://opaque');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
