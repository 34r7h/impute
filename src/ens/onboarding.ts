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

    return { ensName, erc8004Tx };
  }

  /**
   * E2: Port-in an existing ENS name. Associates an ERC-8004 identity with an 
   * existing ENS name the agent controls.
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
   */
  async registerProjectRoutingName(
    projectId: string,
    agentName: string,
    metadata: EnsAgentMetadata
  ): Promise<{ ensName: string; erc8004Tx?: string }> {
    const agentParent = `${agentName}.socnet.eth`;
    const ensName = await this.ensRegistry.register(projectId, agentParent, metadata);
    
    return { ensName };
  }
}
