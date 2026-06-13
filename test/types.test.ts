import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SignatureScheme,
  SCHEME_FOR_PARAMS,
  AGENT_SCHEMES,
  ImputeError,
} from '../src/index.js';

test('signature_scheme byte values match the wire spec (0x00 human .. agent schemes)', () => {
  assert.equal(SignatureScheme.HumanMayo, 0x00);
  assert.equal(SignatureScheme.AgentMlDsa65, 0x01);
  assert.equal(SignatureScheme.AgentMlDsa44, 0x02);
  assert.equal(SignatureScheme.AgentMlDsa87, 0x03);
});

test('parameter set maps to the correct agent scheme byte', () => {
  assert.equal(SCHEME_FOR_PARAMS['ml-dsa-65'], SignatureScheme.AgentMlDsa65);
  assert.equal(SCHEME_FOR_PARAMS['ml-dsa-44'], SignatureScheme.AgentMlDsa44);
  assert.equal(SCHEME_FOR_PARAMS['ml-dsa-87'], SignatureScheme.AgentMlDsa87);
});

test('the human scheme is NOT an agent scheme (Tier-0 / Tier-1 boundary)', () => {
  assert.ok(AGENT_SCHEMES.has(SignatureScheme.AgentMlDsa65));
  assert.ok(!AGENT_SCHEMES.has(SignatureScheme.HumanMayo));
});

test('ImputeError carries a machine-readable code', () => {
  const e = new ImputeError('expired', 'token past exp');
  assert.equal(e.code, 'expired');
  assert.equal(e.name, 'ImputeError');
  assert.ok(e instanceof Error);
});
