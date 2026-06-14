import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AgentResolver } from '../src/ens/index.js';
import type { EnsAgentMetadata } from '../src/ens/types.js';
import type { PublicClient } from 'viem';

test('ENS Agent Metadata formatting', async (t) => {
  const mockClient = {} as PublicClient;
  const resolver = new AgentResolver(mockClient);
  
  const mockMetadata: EnsAgentMetadata = {
    fingerprint: 'f1a2b3c4d5e6f7a8b9c0',
    capabilities: ['code.implement', 'crypto.sign'],
    webhookUrl: 'https://tunnel.socnet.lol/t/handoff-gemini/',
    x402Payable: true,
    erc8004TokenId: '6568'
  };

  await t.test('formats metadata into ENS text records correctly', () => {
    const records = resolver.formatRecords(mockMetadata);
    assert.equal(records['impute.fingerprint'], 'f1a2b3c4d5e6f7a8b9c0');
    assert.equal(records['impute.caps'], 'code.implement,crypto.sign');
    assert.equal(records['impute.webhook'], 'https://tunnel.socnet.lol/t/handoff-gemini/');
    assert.equal(records['impute.x402'], 'true');
    assert.equal(records['impute.erc8004'], '6568');
  });

  await t.test('resolves and parses metadata from hierarchical ENS name correctly', async () => {
    // resolve() reads the resolver from the ENS registry, then text() on it directly (robust against custom
    // resolvers the viem UniversalResolver path mishandles) — so the mock answers readContract, not getEnsText.
    const RES = '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD';
    const recs: Record<string, string> = {
      'impute.fingerprint': 'f1a2b3c4d5e6f7a8b9c0',
      'impute.caps': 'code.implement, crypto.sign',
      'impute.webhook': 'https://tunnel.socnet.lol/t/handoff-gemini/',
      'impute.x402': 'true',
      'impute.erc8004': '6568',
    };
    const resolverWithMock = new AgentResolver({
      readContract: async ({ functionName, args }: any) => {
        if (functionName === 'resolver') return RES;            // registry.resolver(node)
        if (functionName === 'text') return recs[args[1]] ?? '';  // resolver.text(node, key)
        return '';
      }
    } as any);

    const resolved = await resolverWithMock.resolve('gemini.handoff.socnet.eth');
    assert.ok(resolved);
    assert.equal(resolved!.fingerprint, 'f1a2b3c4d5e6f7a8b9c0');
    assert.deepEqual(resolved!.capabilities, ['code.implement', 'crypto.sign']);
    assert.equal(resolved!.webhookUrl, 'https://tunnel.socnet.lol/t/handoff-gemini/');
    assert.equal(resolved!.x402Payable, true);
    assert.equal(resolved!.erc8004TokenId, '6568');
  });
});

test('E3 — socnet.eth subdomain PERMANENCE guard', async (t) => {
  const { AgentOnboarding } = await import('../src/ens/onboarding.js');
  const { SOCNET_PERMANENCE_WARNING } = await import('../src/ens/types.js');

  // Mock registries that should NEVER be called when permanence is not acknowledged
  const mockEnsRegistry = {
    register: async () => { throw new Error('ENS register should not be called'); },
    updateMetadata: async () => {}
  } as any;
  const mockErc8004 = {
    register: async () => { throw new Error('ERC-8004 register should not be called'); },
    getOwner: async () => null
  } as any;

  const onboarding = new AgentOnboarding(mockEnsRegistry, mockErc8004);

  const metadata = {
    fingerprint: 'e3test1234567890',
    capabilities: ['test'],
    x402Payable: false,
  } as any;

  await t.test('rejects when acknowledgedPermanence is false', async () => {
    await assert.rejects(
      () => onboarding.registerSocnetSubdomain('test-label', metadata, false),
      (err: Error) => {
        assert.ok(err.message.includes('PERMANENT'), 'Error must mention PERMANENT');
        assert.ok(err.message.includes('IRREVERSIBLE'), 'Error must mention IRREVERSIBLE');
        assert.ok(err.message.includes('CANNOT be changed'), 'Error must say CANNOT be changed');
        return true;
      }
    );
  });

  await t.test('warning text matches canonical constant', () => {
    assert.ok(SOCNET_PERMANENCE_WARNING.includes('PERMANENT'));
    assert.ok(SOCNET_PERMANENCE_WARNING.includes('IRREVERSIBLE'));
    assert.ok(SOCNET_PERMANENCE_WARNING.includes('CANNOT be changed'));
    assert.ok(SOCNET_PERMANENCE_WARNING.includes('CANNOT be changed, transferred, or deleted'));
  });

  await t.test('static accessor returns the canonical warning', () => {
    assert.equal(AgentOnboarding.permanenceWarning, SOCNET_PERMANENCE_WARNING);
  });
});

test('E2 — port-in an existing ENS name', async (t) => {
  const { AgentOnboarding } = await import('../src/ens/onboarding.js');

  const updatedKeys: Record<string, any>[] = [];

  const mockEnsRegistry = {
    register: async () => { throw new Error('should not register new'); },
    updateMetadata: async (name: string, meta: any) => {
      updatedKeys.push({ name, meta });
    }
  } as any;

  await t.test('registers 8004 identity when none exists, then writes metadata', async () => {
    let registered = false;
    const mockErc8004 = {
      register: async (_fp: string) => { registered = true; return '0xfake_register_tx'; },
      getOwner: async () => null  // no existing owner
    } as any;

    const onboarding = new AgentOnboarding(mockEnsRegistry, mockErc8004);
    const metadata = {
      fingerprint: 'e2porttest1234',
      capabilities: ['test.port'],
      x402Payable: true,
      erc8004TokenId: '9999',
      reputationScore: 85
    } as any;

    const result = await onboarding.portIn('myname.eth', metadata);
    assert.equal(result.erc8004Tx, '0xfake_register_tx');
    assert.ok(registered, 'should have registered 8004 identity');
    // updateMetadata should have been called (once for portIn, once for E5 association)
    assert.ok(updatedKeys.length >= 1, 'should update metadata on ENS');
  });

  await t.test('skips 8004 registration when identity already exists', async () => {
    let registered = false;
    const mockErc8004 = {
      register: async () => { registered = true; return '0x'; },
      getOwner: async () => '0xExistingOwner'  // already registered
    } as any;

    updatedKeys.length = 0;
    const onboarding = new AgentOnboarding(mockEnsRegistry, mockErc8004);
    const metadata = {
      fingerprint: 'e2existing1234',
      capabilities: ['test'],
      x402Payable: false,
      erc8004TokenId: '1234'
    } as any;

    const result = await onboarding.portIn('existing.eth', metadata);
    assert.equal(result.erc8004Tx, undefined, 'should not have a new tx');
    assert.ok(!registered, 'should not have called register');
  });
});

test('E4 — project routing names with permanence guard', async (t) => {
  const { AgentOnboarding } = await import('../src/ens/onboarding.js');

  await t.test('rejects without permanence acknowledgement', async () => {
    const mockEns = {
      register: async () => { throw new Error('should not be called'); },
      updateMetadata: async () => {}
    } as any;
    const mockErc = {
      register: async () => { throw new Error('should not be called'); },
      getOwner: async () => null
    } as any;

    const onboarding = new AgentOnboarding(mockEns, mockErc);
    const metadata = { fingerprint: 'e4test', capabilities: [], x402Payable: false } as any;

    await assert.rejects(
      () => onboarding.registerProjectRoutingName('proj-123', 'claude', metadata, false),
      (err: Error) => {
        assert.ok(err.message.includes('PERMANENT'));
        return true;
      }
    );
  });

  await t.test('rejects when acknowledgedPermanence is omitted (defaults to false)', async () => {
    const mockEns = {
      register: async () => { throw new Error('should not be called'); },
      updateMetadata: async () => {}
    } as any;
    const mockErc = {
      register: async () => { throw new Error('should not be called'); },
      getOwner: async () => null
    } as any;

    const onboarding = new AgentOnboarding(mockEns, mockErc);
    const metadata = { fingerprint: 'e4default', capabilities: [], x402Payable: false } as any;

    await assert.rejects(
      () => onboarding.registerProjectRoutingName('proj-456', 'gemini', metadata),
      (err: Error) => {
        assert.ok(err.message.includes('PERMANENT'));
        return true;
      }
    );
  });

  await t.test('registers [project_id].[agent_name].socnet.eth when acknowledged', async () => {
    let registeredLabel = '';
    let registeredParent = '';
    const mockEns = {
      register: async (label: string, parent: string) => {
        registeredLabel = label;
        registeredParent = parent;
        return `${label}.${parent}`;
      },
      updateMetadata: async () => {}
    } as any;
    const mockErc = {
      register: async () => '0xe4_tx',
      getOwner: async () => null
    } as any;

    const onboarding = new AgentOnboarding(mockEns, mockErc);
    const metadata = {
      fingerprint: 'e4live',
      capabilities: ['build'],
      x402Payable: true,
      erc8004TokenId: '7777',
      reputationScore: 95
    } as any;

    const result = await onboarding.registerProjectRoutingName('proj-abc', 'claude', metadata, true);
    assert.equal(registeredLabel, 'proj-abc');
    assert.equal(registeredParent, 'claude.socnet.eth');
    assert.equal(result.ensName, 'proj-abc.claude.socnet.eth');
    assert.equal(result.erc8004Tx, '0xe4_tx');
  });
});

test('E5 — 8004 identity + reputation association on every ENS name', async (t) => {
  const { AgentOnboarding } = await import('../src/ens/onboarding.js');

  await t.test('associateIdentityAndReputation writes erc8004 + reputation to ENS', async () => {
    const written: Record<string, any>[] = [];
    const mockEns = {
      register: async () => 'test.socnet.eth',
      updateMetadata: async (name: string, meta: any) => {
        written.push({ name, ...meta });
      }
    } as any;
    const mockErc = {
      register: async () => '0x',
      getOwner: async () => null
    } as any;

    const onboarding = new AgentOnboarding(mockEns, mockErc);
    await onboarding.associateIdentityAndReputation('agent.socnet.eth', {
      erc8004TokenId: '6558',
      reputationScore: 92
    });

    assert.ok(written.length === 1, 'should have written once');
    assert.equal(written[0]!.name, 'agent.socnet.eth');
    assert.equal(written[0]!.erc8004TokenId, '6558');
    assert.equal(written[0]!.reputationScore, 92);
  });

  await t.test('skips write when no 8004 or reputation data', async () => {
    const written: any[] = [];
    const mockEns = {
      register: async () => 'test.eth',
      updateMetadata: async (_: string, meta: any) => { written.push(meta); }
    } as any;
    const mockErc = { register: async () => '0x', getOwner: async () => null } as any;

    const onboarding = new AgentOnboarding(mockEns, mockErc);
    await onboarding.associateIdentityAndReputation('bare.eth', {});

    assert.equal(written.length, 0, 'should not write when nothing to associate');
  });

  await t.test('onboard() automatically calls E5 association', async () => {
    const metadataWrites: any[] = [];
    const mockEns = {
      register: async (label: string, parent: string) => `${label}.${parent}`,
      updateMetadata: async (_name: string, meta: any) => { metadataWrites.push(meta); }
    } as any;
    const mockErc = {
      register: async () => '0xe5_onboard',
      getOwner: async () => null
    } as any;

    const onboarding = new AgentOnboarding(mockEns, mockErc);
    await onboarding.onboard('agent-x', 'handoff.socnet.eth', {
      fingerprint: 'e5auto',
      capabilities: ['test'],
      x402Payable: true,
      erc8004TokenId: '1111',
      reputationScore: 77
    });

    // E5 should have written 8004+reputation via associateIdentityAndReputation
    const e5Write = metadataWrites.find((w: any) => w.erc8004TokenId === '1111');
    assert.ok(e5Write, 'E5 association should be called during onboard()');
    assert.equal(e5Write!.reputationScore, 77);
  });
});
