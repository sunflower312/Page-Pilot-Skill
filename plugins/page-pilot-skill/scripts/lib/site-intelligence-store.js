import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  buildPersistedStrategyMemory,
  buildSiteScopedStrategyMemory,
  ensureStrategyMemory,
  mergeStrategyMemory,
  siteKeyFromUrl,
} from './workflow-intelligence.js';

function fileNameForSiteKey(siteKey = '') {
  return `${siteKey.replace(/[^a-zA-Z0-9._-]+/g, '_') || 'unknown-site'}.json`;
}

function workflowEntryKey(entry = {}) {
  return JSON.stringify([entry.siteKey ?? '', entry.goal ?? '', entry.finalUrl ?? '', entry.phases ?? [], entry.template ?? []]);
}

function goalRunKey(entry = {}) {
  return JSON.stringify([entry.goal ?? '', entry.status ?? '', entry.finalUrl ?? '', entry.stepCount ?? 0]);
}

function failureKey(entry = {}) {
  return JSON.stringify([entry.message ?? '', entry.code ?? '', JSON.stringify(entry.locator ?? null)]);
}

function transitionEntryKey(entry = {}) {
  return JSON.stringify([entry.phaseId ?? '', entry.actions ?? [], entry.targetFingerprint ?? '', entry.targetPageType ?? '']);
}

function diffCount(currentCount = 0, baseCount = 0) {
  return Math.max(0, currentCount - baseCount);
}

function diffEntries(currentEntries = [], baseEntries = [], getKey) {
  const baseKeys = new Set(baseEntries.map((entry) => getKey(entry)));
  return currentEntries.filter((entry) => !baseKeys.has(getKey(entry)));
}

function diffStrategyMemory(currentMemory = {}, baseMemory = {}) {
  const delta = {
    version: currentMemory.version ?? 2,
    siteKey: currentMemory.siteKey,
    states: {},
    locatorStats: {},
    workflows: diffEntries(currentMemory.workflows ?? [], baseMemory.workflows ?? [], workflowEntryKey),
    goalRuns: diffEntries(currentMemory.goalRuns ?? [], baseMemory.goalRuns ?? [], goalRunKey),
    failures: diffEntries(currentMemory.failures ?? [], baseMemory.failures ?? [], failureKey),
    transitions: {},
    lastStateModel: currentMemory.lastStateModel ?? null,
  };

  for (const [fingerprint, state] of Object.entries(currentMemory.states ?? {})) {
    const baseState = baseMemory.states?.[fingerprint];
    const seenCount = diffCount(state.seenCount ?? 0, baseState?.seenCount ?? 0);
    if (seenCount > 0 || !baseState) {
      delta.states[fingerprint] = {
        ...state,
        seenCount: seenCount || state.seenCount || 0,
      };
    }
  }

  for (const [key, locator] of Object.entries(currentMemory.locatorStats ?? {})) {
    const baseLocator = baseMemory.locatorStats?.[key];
    const count = diffCount(locator.count ?? 0, baseLocator?.count ?? 0);
    if (count > 0 || !baseLocator) {
      delta.locatorStats[key] = {
        ...locator,
        count: count || locator.count || 0,
      };
    }
  }

  for (const [fingerprint, entries] of Object.entries(currentMemory.transitions ?? {})) {
    const baseEntriesForFingerprint = baseMemory.transitions?.[fingerprint] ?? [];
    const baseByKey = new Map(baseEntriesForFingerprint.map((entry) => [transitionEntryKey(entry), entry]));
    const deltaEntries = [];

    for (const entry of entries ?? []) {
      const baseEntry = baseByKey.get(transitionEntryKey(entry));
      const count = diffCount(entry.count ?? 0, baseEntry?.count ?? 0);
      if (count > 0 || !baseEntry) {
        deltaEntries.push({
          ...entry,
          count: count || entry.count || 0,
        });
      }
    }

    if (deltaEntries.length > 0) {
      delta.transitions[fingerprint] = deltaEntries;
    }
  }

  return delta;
}

function createEmptySiteMemory(siteKey = '') {
  return {
    version: 2,
    siteKey,
    states: {},
    locatorStats: {},
    workflows: [],
    goalRuns: [],
    failures: [],
    transitions: {},
    lastStateModel: null,
  };
}

function collectSiteKeys(memory = {}, fallbackSiteKey = '') {
  const siteKeys = new Set();
  if (fallbackSiteKey) {
    siteKeys.add(fallbackSiteKey);
  }
  if (memory.siteKey) {
    siteKeys.add(memory.siteKey);
  }
  for (const state of Object.values(memory.states ?? {})) {
    if (state.siteKey) {
      siteKeys.add(state.siteKey);
    }
  }
  for (const locator of Object.values(memory.locatorStats ?? {})) {
    if (locator.siteKey) {
      siteKeys.add(locator.siteKey);
    }
  }
  for (const entry of [...(memory.workflows ?? []), ...(memory.goalRuns ?? []), ...(memory.failures ?? [])]) {
    if (entry.siteKey) {
      siteKeys.add(entry.siteKey);
    }
  }
  for (const entries of Object.values(memory.transitions ?? {})) {
    for (const entry of entries ?? []) {
      if (entry.siteKey) {
        siteKeys.add(entry.siteKey);
      }
    }
  }
  for (const siteKey of Object.keys(memory.lastStateModelBySite ?? {})) {
    siteKeys.add(siteKey);
  }
  const lastStateSiteKey = siteKeyFromUrl(memory.lastStateModel?.url ?? '');
  if (lastStateSiteKey) {
    siteKeys.add(lastStateSiteKey);
  }
  return [...siteKeys].filter(Boolean);
}

export class SiteIntelligenceStore {
  constructor({ rootDir } = {}) {
    this.rootDir = rootDir;
    this.pendingWrites = new Map();
  }

  async ensureRootDir() {
    if (!this.rootDir) {
      return null;
    }
    await mkdir(this.rootDir, { recursive: true });
    return this.rootDir;
  }

  pathForSiteKey(siteKey = '') {
    if (!this.rootDir) {
      return null;
    }
    return join(this.rootDir, fileNameForSiteKey(siteKey));
  }

  async load(siteKey = '') {
    const path = this.pathForSiteKey(siteKey);
    if (!path) {
      return null;
    }

    try {
      const raw = await readFile(path, 'utf8');
      const payload = JSON.parse(raw);
      return payload.memory ?? payload;
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async loadForUrl(url = '') {
    return await this.load(siteKeyFromUrl(url));
  }

  async hydrateSession(session = {}) {
    const siteKey = siteKeyFromUrl(session.url ?? session.page?.url?.());
    const loadedMemory = await this.loadForUrl(session.url ?? session.page?.url?.());
    if (loadedMemory) {
      mergeStrategyMemory(session, loadedMemory);
      session.persistedStrategyMemoryBaseBySite ??= {};
      session.persistedStrategyMemoryBaseBySite[siteKey] = buildSiteScopedStrategyMemory(session, siteKey);
      return session.strategyMemory;
    }
    const memory = ensureStrategyMemory(session);
    session.persistedStrategyMemoryBaseBySite ??= {};
    session.persistedStrategyMemoryBaseBySite[siteKey] = buildSiteScopedStrategyMemory(session, siteKey);
    return memory;
  }

  async persistSiteKey(session = {}, siteKey = '') {
    if (!siteKey) {
      return null;
    }

    const previousWrite = this.pendingWrites.get(siteKey) ?? Promise.resolve();
    const nextWrite = previousWrite.catch(() => {}).then(async () => {
      await this.ensureRootDir();
      const path = this.pathForSiteKey(siteKey);
      const existingMemory = await this.load(siteKey);
      session.persistedStrategyMemoryBaseBySite ??= {};
      const currentMemory = buildSiteScopedStrategyMemory(session, siteKey);
      const baseMemory = session.persistedStrategyMemoryBaseBySite[siteKey] ?? createEmptySiteMemory(siteKey);
      const deltaMemory = diffStrategyMemory(currentMemory, baseMemory);
      const mergedSession = {
        url: session.url,
        page: session.page,
        strategyMemory: existingMemory ? structuredClone(existingMemory) : undefined,
      };

      mergeStrategyMemory(mergedSession, deltaMemory);

      const payload = {
        version: 2,
        siteKey,
        updatedAt: new Date().toISOString(),
        memory: buildPersistedStrategyMemory(mergedSession, siteKey),
      };
      await writeFile(path, JSON.stringify(payload, null, 2));
      session.persistedStrategyMemoryBaseBySite[siteKey] = structuredClone(currentMemory);
      return path;
    });

    this.pendingWrites.set(siteKey, nextWrite);

    try {
      return await nextWrite;
    } finally {
      if (this.pendingWrites.get(siteKey) === nextWrite) {
        this.pendingWrites.delete(siteKey);
      }
    }
  }

  async persistSession(session = {}) {
    const memory = ensureStrategyMemory(session);
    const activeSiteKey = memory.siteKey || siteKeyFromUrl(session.url ?? session.page?.url?.());
    const siteKeys = collectSiteKeys(memory, activeSiteKey);
    if (siteKeys.length === 0) {
      return null;
    }

    const persistedPaths = new Map();
    for (const siteKey of siteKeys) {
      const path = await this.persistSiteKey(session, siteKey);
      if (path) {
        persistedPaths.set(siteKey, path);
      }
    }

    return persistedPaths.get(activeSiteKey) ?? [...persistedPaths.values()][0] ?? null;
  }
}
