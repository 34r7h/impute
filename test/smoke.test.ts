import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VERSION, TIERS } from '../src/index.js';

test('package exposes a semver VERSION', () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
});

test('the four identity tiers are defined 0..3', () => {
  assert.deepEqual(Object.keys(TIERS).sort(), ['0', '1', '2', '3']);
  assert.equal(TIERS[0].key, 'human');
  assert.equal(TIERS[1].key, 'agent');
  assert.equal(TIERS[2].key, 'capability');
  assert.equal(TIERS[3].key, 'execution');
});

test('the tiers table is frozen (no runtime mutation of the trust model)', () => {
  assert.ok(Object.isFrozen(TIERS));
  assert.ok(Object.isFrozen(TIERS[1]));
});
