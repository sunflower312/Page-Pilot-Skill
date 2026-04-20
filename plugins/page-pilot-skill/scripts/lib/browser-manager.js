import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { chromium } from 'playwright';

export class BrowserManager {
  constructor({ artifactRoot, idleMs = 300000, sweepMs } = {}) {
    this.artifactRoot = artifactRoot;
    this.idleMs = idleMs;
    this.sweepMs = sweepMs ?? Math.max(1000, Math.min(30000, Math.floor(idleMs / 2) || 30000));
    this.browser = null;
    this.sessions = new Map();
    this.cleanupTimer = null;
  }

  async ensureBrowser() {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: true });
      this.startCleanupLoop();
    }
    return this.browser;
  }

  startCleanupLoop() {
    if (this.cleanupTimer || this.idleMs <= 0) {
      return;
    }

    this.cleanupTimer = setInterval(() => {
      void this.sweepExpiredSessions();
    }, this.sweepMs);
    this.cleanupTimer.unref?.();
  }

  stopCleanupLoop() {
    if (!this.cleanupTimer) {
      return;
    }
    clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  touchSession(session) {
    const now = Date.now();
    session.lastTouchedAt = now;
    session.expiresAt = now + this.idleMs;
    try {
      session.url = session.page?.url?.() ?? session.url;
    } catch {
      session.url = session.url ?? null;
    }
  }

  hasActiveWork(session) {
    return (session.activeOperations ?? 0) > 0;
  }

  isExpired(session) {
    return this.idleMs > 0 && !this.hasActiveWork(session) && session.expiresAt <= Date.now();
  }

  isUnavailable(session) {
    return session.page?.isClosed?.() === true;
  }

  async openSession({
    url,
    viewport = { width: 1440, height: 900 },
    storageStatePath,
    waitUntil = 'load',
    timeoutMs = 15000,
  } = {}) {
    const browser = await this.ensureBrowser();
    const contextOptions = { viewport };
    if (storageStatePath) {
      contextOptions.storageState = storageStatePath;
    }

    let context;
    try {
      context = await browser.newContext(contextOptions);
      const page = await context.newPage();
      await page.goto(url, { waitUntil, timeout: timeoutMs });

      const id = randomUUID();
      const sessionDir = this.artifactRoot ? join(this.artifactRoot, id) : null;
      if (sessionDir) {
        await mkdir(sessionDir, { recursive: true });
      }

      const now = Date.now();
      const session = {
        id,
        url: page.url(),
        title: await page.title(),
        context,
        page,
        sessionDir,
        createdAt: now,
        lastTouchedAt: now,
        expiresAt: now + this.idleMs,
        activeOperations: 0,
        validationHistory: [],
        strategyMemory: null,
        lastActionFailure: null,
        lastWorkflowSummary: null,
      };
      this.sessions.set(id, session);
      return session;
    } catch (error) {
      if (context) {
        await context.close().catch(() => {});
      }
      if (this.sessions.size === 0) {
        await this.closeBrowser().catch(() => {});
      }
      throw error;
    }
  }

  getSession(sessionId) {
    const session = this.sessions.get(sessionId) ?? null;
    if (!session) {
      return null;
    }

    if (this.isExpired(session) || this.isUnavailable(session)) {
      void this.closeSession(sessionId);
      return null;
    }

    this.touchSession(session);
    return session;
  }

  beginSessionActivity(sessionId) {
    const session = this.sessions.get(sessionId) ?? null;
    if (!session) {
      return null;
    }

    if (this.isExpired(session) || this.isUnavailable(session)) {
      void this.closeSession(sessionId);
      return null;
    }

    session.activeOperations = (session.activeOperations ?? 0) + 1;
    this.touchSession(session);
    return session;
  }

  endSessionActivity(sessionId) {
    const session = this.sessions.get(sessionId) ?? null;
    if (!session) {
      return false;
    }

    session.activeOperations = Math.max(0, (session.activeOperations ?? 1) - 1);
    this.touchSession(session);
    return true;
  }

  async withSession(sessionId, callback) {
    const session = this.beginSessionActivity(sessionId);
    if (!session) {
      return null;
    }

    try {
      return await callback(session);
    } finally {
      this.endSessionActivity(sessionId);
    }
  }

  async closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    this.sessions.delete(sessionId);
    await session.context.close().catch(() => {});
    if (this.sessions.size === 0) {
      await this.closeBrowser();
    }
    return true;
  }

  async sweepExpiredSessions() {
    const expiredIds = [];
    for (const [sessionId, session] of this.sessions.entries()) {
      if (this.isExpired(session)) {
        expiredIds.push(sessionId);
      }
    }

    for (const sessionId of expiredIds) {
      await this.closeSession(sessionId);
    }
  }

  async closeBrowser() {
    this.stopCleanupLoop();
    if (!this.browser) {
      return;
    }
    await this.browser.close();
    this.browser = null;
  }

  async closeAll() {
    this.stopCleanupLoop();
    for (const session of this.sessions.values()) {
      await session.context.close().catch(() => {});
    }
    this.sessions.clear();
    await this.closeBrowser();
  }
}
