import test from 'node:test';
import assert from 'node:assert/strict';

import { executeGeneratedPlaywrightCode } from '../../scripts/lib/playwright-code-execution.js';

test('executeGeneratedPlaywrightCode retries expect.poll until the produced value matches', async () => {
  const page = {
    pollAttempts: 0,
    async status() {
      this.pollAttempts += 1;
      return this.pollAttempts >= 3 ? 'ready-state' : 'loading';
    },
    async title() {
      return 'Fixture';
    },
  };

  await executeGeneratedPlaywrightCode(
    page,
    `
      await expect.poll(async () => {
        return await page.status();
      }, { timeout: 500, interval: 5 }).toContain('ready');
    `
  );

  assert.equal(page.pollAttempts, 3);
});

test('executeGeneratedPlaywrightCode retries locator visibility checks before failing', async () => {
  let calls = 0;
  const locator = {
    async isVisible() {
      calls += 1;
      return calls >= 2;
    },
  };
  const page = {
    locator() {
      return locator;
    },
  };

  await executeGeneratedPlaywrightCode(
    page,
    `
      await expect(page.locator('#status')).toBeVisible();
    `
  );

  assert.equal(calls, 2);
});

test('executeGeneratedPlaywrightCode accepts generator-style imports and test wrapper', async () => {
  let filled = '';
  const page = {
    getByRole(role, options = {}) {
      return {
        async isVisible() {
          return true;
        },
        async fill(value) {
          filled = `${role}:${options.name}:${value}`;
        },
      };
    },
  };

  await executeGeneratedPlaywrightCode(
    page,
    `
      import { test, expect } from '@playwright/test';

      test('generated flow', async ({ page }) => {
        await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toBeVisible();
        await page.getByRole('textbox', { name: 'Email', exact: true }).fill('qa@example.com');
      });
    `
  );

  assert.equal(filled, 'textbox:Email:qa@example.com');
});
