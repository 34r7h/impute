import { EnsSubnameRegistry } from './index.js';
import { Erc8004RegistryClient } from '../erc8004/index.js';
import { type EnsAgentMetadata, SOCNET_PERMANENCE_WARNING } from './types.js';

/**
 * Orchestrates the combined ENS and ERC-8004 onboarding flow for agents.
 */
export class AgentOnboarding {
  constructor(
    private ensRegistry: EnsSubnameRegistry,
    private erc8004Registry: Erc8004RegistryClient
  ) {}

  /**
   * E1: Agent self-service registration. Registers a fresh identity on ERC-8004 
   * and a new ENS subname that points to it.
   */
  async onboard(
    label: string, 
    parentName: string, 
    metadata: EnsAgentMetadata
  ): Promise<{ ensName: string; erc8004Tx?: string }> {
    let erc8004Tx;
    try {
      erc8004Tx = await this.erc8004Registry.register(metadata.fingerprint);
    } catch (e: any) {
      console.warn(`ERC-8004 registration skipped or failed for ${metadata.fingerprint}: ${e.message}`);
    }
    
    const ensName = await this.ensRegistry.register(label, parentName, metadata);

    // E5: ensure 8004 identity + reputation are associated on the new name
    await this.associateIdentityAndReputation(ensName, metadata);

    return { ensName, erc8004Tx };
  }

  /**
   * E2: Port-in an existing ENS name. Associates an ERC-8004 identity with an 
   * existing ENS name the agent controls. If no ERC-8004 identity exists yet,
   * registers one. Then writes all metadata (including 8004 link + reputation)
   * into the ENS text records.
   */
  async portIn(
    ensName: string,
    metadata: EnsAgentMetadata
  ): Promise<{ erc8004Tx?: string }> {
    let erc8004Tx;
    
    try {
      const existingOwner = await this.erc8004Registry.getOwner(metadata.fingerprint);
      if (!existingOwner) {
        erc8004Tx = await this.erc8004Registry.register(metadata.fingerprint);
      }
    } catch (e: any) {
       console.warn(`ERC-8004 association skipped for ${metadata.fingerprint}: ${e.message}`);
    }

    await this.ensRegistry.updateMetadata(ensName, metadata);

    // E5: ensure 8004 identity + reputation are associated on the ported name
    await this.associateIdentityAndReputation(ensName, metadata);

    return { erc8004Tx };
  }

  /**
   * E3: socnet.eth subdomain with PERMANENCE notice.
   *
   * The caller MUST display `SOCNET_PERMANENCE_WARNING` to the user and obtain
   * explicit confirmation (acknowledgedPermanence = true) BEFORE calling this.
   * Passing false (or omitting) will throw — no on-chain write occurs.
   */
  async registerSocnetSubdomain(
    label: string,
    metadata: EnsAgentMetadata,
    acknowledgedPermanence: boolean
  ): Promise<{ ensName: string; erc8004Tx?: string }> {
    if (!acknowledgedPermanence) {
      throw new Error(SOCNET_PERMANENCE_WARNING);
    }
    return this.onboard(label, "socnet.eth", metadata);
  }

  /**
   * Returns the canonical permanence warning copy that UIs must display.
   */
  static get permanenceWarning(): string {
    return SOCNET_PERMANENCE_WARNING;
  }

  /**
   * E4: Project routing names [project_id].[agent_name].socnet.eth
   * 
   * Registers a project-scoped subdomain at accept-time. Since these are
   * subdomains of socnet.eth, the same PERMANENCE warning applies. The caller
   * MUST have already displayed the warning and obtained confirmation.
   *
   * The ERC-8004 identity is bound to the project routing name via E5.
   */
  async registerProjectRoutingName(
    projectId: string,
    agentName: string,
    metadata: EnsAgentMetadata,
    acknowledgedPermanence: boolean = false
  ): Promise<{ ensName: string; erc8004Tx?: string }> {
    if (!acknowledgedPermanence) {
      throw new Error(SOCNET_PERMANENCE_WARNING);
    }

    const agentParent = `${agentName}.socnet.eth`;
    let erc8004Tx;

    // Ensure 8004 identity exists
    try {
      const existingOwner = await this.erc8004Registry.getOwner(metadata.fingerprint);
      if (!existingOwner) {
        erc8004Tx = await this.erc8004Registry.register(metadata.fingerprint);
      }
    } catch (e: any) {
      console.warn(`ERC-8004 registration skipped for project routing: ${e.message}`);
    }

    const ensName = await this.ensRegistry.register(projectId, agentParent, metadata);

    // E5: associate identity + reputation on the project routing name
    await this.associateIdentityAndReputation(ensName, metadata);

    return { ensName, erc8004Tx };
  }

  /**
   * E5: Associate ERC-8004 identity AND reputation on an ENS name.
   *
   * Ensures the ENS text records for the given name include:
   *  - impute.erc8004: the tokenId linking to the on-chain identity NFT
   *  - impute.reputation: the current reputation score
   *
   * This is called automatically by onboard(), portIn(), and
   * registerProjectRoutingName() — callers do not need to invoke it separately
   * unless they want to update an existing name's 8004/reputation records.
   */
  async associateIdentityAndReputation(
    ensName: string,
    metadata: Partial<EnsAgentMetadata>
  ): Promise<void> {
    const updates: Partial<EnsAgentMetadata> = {};

    if (metadata.erc8004TokenId) {
      updates.erc8004TokenId = metadata.erc8004TokenId;
    }
    if (metadata.reputationScore !== undefined) {
      updates.reputationScore = metadata.reputationScore;
    }

    // Only write if there's something to associate
    if (Object.keys(updates).length > 0) {
      await this.ensRegistry.updateMetadata(ensName, updates);
    }
  }
}
