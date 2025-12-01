import type { Address, Chain } from "viem";
import { createConnector } from "wagmi";

import type { E2EProvider, E2EProviderConfig } from "./types.js";
import {
    createE2EProvider,
    disconnect as disconnectProvider,
    setAccounts,
    setChain,
} from "./provider.js";

/**
 * Parameters for creating an E2E test connector
 */
export type E2EConnectorParameters = {
    /** URL where wallet requests will be forwarded for e2e test interception */
    interceptorUrl: string;
    /** RPC URL for blockchain read operations. Falls back to chain's default RPC */
    rpcUrl?: string;
    /** Supported chains */
    chains?: readonly Chain[];
    /** Initial mock address for the wallet */
    mockAddress?: Address;
    /** Enable debug logging */
    debug?: boolean;
};

/**
 * Creates a custom Wagmi connector for e2e testing.
 *
 * This connector intercepts all wallet requests and forwards them to a specified
 * interceptor URL, allowing e2e tests to mock wallet responses. Read operations
 * can be optionally redirected to a custom RPC URL or fork.
 *
 * @example
 * ```ts
 * import { e2eConnector } from '@defi-wonderland/e2e-provider'
 * import { createConfig, http } from 'wagmi'
 * import { sepolia } from 'wagmi/chains'
 *
 * const config = createConfig({
 *   chains: [sepolia],
 *   connectors: [
 *     e2eConnector({
 *       interceptorUrl: 'http://localhost:3001/wallet-intercept',
 *       rpcUrl: 'http://localhost:8545', // anvil fork
 *       mockAddress: '0x1234...',
 *       debug: true,
 *     }),
 *   ],
 *   transports: {
 *     [sepolia.id]: http('http://localhost:8545'),
 *   },
 * })
 * ```
 */
export function e2eConnector(
    parameters: E2EConnectorParameters,
): ReturnType<typeof createConnector<E2EProvider>> {
    const { interceptorUrl, rpcUrl, chains: paramChains, mockAddress, debug = false } = parameters;

    let provider: E2EProvider | undefined;
    let currentChain: Chain | undefined;

    return createConnector<E2EProvider>((config) => {
        const chains = paramChains || config.chains;

        return {
            id: "e2e-test-connector",
            name: "E2E Test Connector",
            type: "e2e-test",

            async setup(): Promise<void> {
                currentChain = chains[0];
            },

            async connect({ chainId } = {}): Promise<{
                accounts: readonly Address[];
                chainId: number;
            }> {
                const targetChainId = chainId || chains[0]?.id;
                const chain = chains.find((c) => c.id === targetChainId) || chains[0];

                if (!chain) {
                    throw new Error("No chains configured");
                }

                currentChain = chain;

                const connectorConfig: E2EProviderConfig = {
                    interceptorUrl,
                    rpcUrl,
                    chain,
                    mockAddress,
                    debug,
                };

                provider = createE2EProvider(connectorConfig);

                const accounts = mockAddress ? [mockAddress] : [];

                return {
                    accounts,
                    chainId: chain.id,
                };
            },

            async disconnect(): Promise<void> {
                if (provider) {
                    disconnectProvider(provider);
                }
                provider = undefined;
            },

            async getAccounts(): Promise<readonly Address[]> {
                if (!provider) return [];

                return provider.request<Address[]>({
                    method: "eth_accounts",
                });
            },

            async getChainId(): Promise<number> {
                if (!provider) return chains[0]?.id || 1;

                const chainIdHex = await provider.request<string>({
                    method: "eth_chainId",
                });

                return parseInt(chainIdHex, 16);
            },

            async getProvider(): Promise<E2EProvider> {
                if (!provider && currentChain) {
                    const connectorConfig: E2EProviderConfig = {
                        interceptorUrl,
                        rpcUrl,
                        chain: currentChain,
                        mockAddress,
                        debug,
                    };
                    provider = createE2EProvider(connectorConfig);
                }

                return provider!;
            },

            async isAuthorized(): Promise<boolean> {
                if (!provider) return false;

                const accounts = await this.getAccounts();
                return accounts.length > 0;
            },

            async switchChain({ chainId }): Promise<Chain> {
                const chain = chains.find((c) => c.id === chainId);

                if (!chain) {
                    throw new Error(`Chain ${chainId} not found`);
                }

                if (provider) {
                    await provider.request({
                        method: "wallet_switchEthereumChain",
                        params: [{ chainId: `0x${chainId.toString(16)}` }],
                    });
                    setChain(provider, chainId);
                }

                currentChain = chain;

                return chain;
            },

            onAccountsChanged(accounts): void {
                if (provider && accounts.length > 0) {
                    setAccounts(provider, accounts as Address[]);
                }
                config.emitter.emit("change", { accounts: accounts as readonly Address[] });
            },

            onChainChanged(chainId): void {
                const id = typeof chainId === "string" ? parseInt(chainId, 16) : chainId;
                if (provider) {
                    setChain(provider, id);
                }
                config.emitter.emit("change", { chainId: id });
            },

            onDisconnect(): void {
                if (provider) {
                    disconnectProvider(provider);
                }
                config.emitter.emit("disconnect");
            },
        };
    });
}
