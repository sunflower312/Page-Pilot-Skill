import test from 'node:test';
import assert from 'node:assert/strict';

import { BenchmarkClient } from '../../benchmarks/lib/benchmark-client.js';

test('BenchmarkClient preserves the current environment while enabling internal probes', () => {
  const client = new BenchmarkClient();

  assert.equal(client.env.PAGE_PILOT_INTERNAL_PROBE, '1');
  assert.equal(client.env.HOME, process.env.HOME);
  assert.equal(client.env.PATH, process.env.PATH);
});

test('BenchmarkClient respects an explicit env override', () => {
  const client = new BenchmarkClient({
    env: { CUSTOM_ENV: 'yes', PAGE_PILOT_INTERNAL_PROBE: '0' },
  });

  assert.deepEqual(client.env, { CUSTOM_ENV: 'yes', PAGE_PILOT_INTERNAL_PROBE: '0' });
});
