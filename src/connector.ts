import type { Account, Address, Chain, Hex } from "viem";
import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createConnector } from "wagmi";

import type { CompatibleChain, E2EProvider, E2EProviderConfig } from "./types.js";
import { DEFAULT_ANVIL_PRIVATE_KEY, DEFAULT_CHAIN } from "./constants.js";
import { createE2EProvider, disconnect as disconnectProvider } from "./provider.js";

/**
 * Configuration for creating a new provider internally
 */
export type E2EConnectorConfigParams = {
    /** Supported chains. First chain is the default. (default: [mainnet]) */
    chains?: readonly CompatibleChain[];
    /**
     * Per-chain RPC URLs mapping chainId to URL.
     * When switching chains, the provider uses the corresponding RPC URL.
     * @example { 1: 'http://mainnet:8545', 42161: 'http://arbitrum:8546' }
     */
    rpcUrls?: Record<number, string>;
    /**
     * Account for signing transactions. Can be:
     * - A private key hex string (default: Anvil's first test account)
     * - A viem Account object (for impersonation or custom accounts)
     */
    account?: Hex | Account;
    /** Enable debug logging */
    debug?: boolean;
};

/**
 * Configuration when providing a pre-constructed provider
 */
export type E2EConnectorProviderParams = {
    /**
     * Pre-constructed E2E provider instance.
     * When provided, the connector will use this provider instead of creating a new one.
     * This allows the consuming application to hold a reference to the provider
     * for calling setSigningAccount during tests.
     */
    provider: E2EProvider;
};

/**
 * Parameters for creating an E2E test connector.
 * Either pass a pre-constructed provider OR configuration options (not both).
 */
export type E2EConnectorParameters = E2EConnectorConfigParams | E2EConnectorProviderParams;

/**
 * Type guard: check if parameters include a pre-constructed provider
 */
function hasProvider(params: E2EConnectorParameters): params is E2EConnectorProviderParams {
    return "provider" in params && params.provider !== undefined;
}

/**
 * Creates a custom Wagmi connector for e2e testing.
 *
 * This connector implements a "Virtual Wallet" pattern that:
 * - Routes READ operations (eth_call, eth_getBalance) directly to Anvil RPC
 * - Handles WRITE operations (eth_sendTransaction, eth_sign) with local signing
 *
 * This keeps 100% chain realism while providing testing-level control.
 *
 * @example
 * ```ts
 * import { e2eConnector } from '@wonderland/walletless'
 * import { createConfig, http } from 'wagmi'
 * import { mainnet } from 'wagmi/chains'
 *
 * // Zero-config usage with Anvil defaults (mainnet fork, first test account)
 * const config = createConfig({
 *   chains: [mainnet],
 *   connectors: [e2eConnector()],
 *   transports: {
 *     [mainnet.id]: http('http://127.0.0.1:8545'),
 *   },
 * })
 *
 * // Or with custom configuration (multichain with per-chain RPCs)
 * const customConfig = createConfig({
 *   chains: [mainnet, arbitrum],
 *   connectors: [
 *     e2eConnector({
 *       chains: [mainnet, arbitrum],
 *       rpcUrls: {
 *         1: 'http://mainnet-anvil:8545',
 *         42161: 'http://arbitrum-anvil:8546',
 *       },
 *       account: '0xYourPrivateKey...',
 *       debug: true,
 *     }),
 *   ],
 *   transports: {
 *     [mainnet.id]: http('http://mainnet-anvil:8545'),
 *     [arbitrum.id]: http('http://arbitrum-anvil:8546'),
 *   },
 * })
 * ```
 */
export function e2eConnector(
    parameters: E2EConnectorParameters = {},
): ReturnType<typeof createConnector<E2EProvider>> {
    // Resolve configuration based on whether a provider was passed
    const externalProvider = hasProvider(parameters) ? parameters.provider : undefined;

    // Only used when creating provider internally
    const chains = hasProvider(parameters) ? undefined : parameters.chains;
    const rpcUrls = hasProvider(parameters) ? undefined : parameters.rpcUrls;
    const accountConfig = hasProvider(parameters)
        ? DEFAULT_ANVIL_PRIVATE_KEY
        : (parameters.account ?? DEFAULT_ANVIL_PRIVATE_KEY);
    const defaultChain = chains?.[0] ?? DEFAULT_CHAIN;
    const debug = hasProvider(parameters) ? false : (parameters.debug ?? false);

    // Use external provider if provided, otherwise we'll create one on connect
    let provider: E2EProvider | undefined = externalProvider;

    return createConnector<E2EProvider>((config) => {
        return {
            id: "e2e-connector",
            name: "E2E Connector",
            type: "e2e",

            async setup(): Promise<void> {
                // If we have an external provider, listen to its events and forward to wagmi
                if (externalProvider) {
                    externalProvider.on("accountsChanged", (accounts: Address[]) => {
                        // Match wagmi's injected connector: checksum addresses with getAddress
                        config.emitter.emit("change", {
                            accounts: accounts.map((x) => getAddress(x)),
                        });
                    });
                    externalProvider.on("chainChanged", (chainIdHex: string) => {
                        const chainId = parseInt(chainIdHex, 16);
                        config.emitter.emit("change", { chainId });
                    });
                    externalProvider.on("disconnect", () => {
                        config.emitter.emit("disconnect");
                    });
                }
            },

            async connect({ chainId } = {}): Promise<{
                accounts: readonly Address[];
                chainId: number;
            }> {
                // Ensure provider exists
                if (!provider) {
                    const connectorConfig: E2EProviderConfig = {
                        chains,
                        rpcUrls,
                        account: accountConfig,
                        debug,
                    };
                    provider = createE2EProvider(connectorConfig);
                }

                // Query accounts from the provider
                const accounts = await provider.request<Address[]>({
                    method: "eth_accounts",
                });

                // Get chain ID from provider or use override
                const providerChainId = await provider.request<string>({
                    method: "eth_chainId",
                });
                const targetChainId = chainId ?? parseInt(providerChainId, 16);

                return {
                    accounts,
                    chainId: targetChainId,
                };
            },

            async disconnect(): Promise<void> {
                if (provider) {
                    disconnectProvider(provider);
                }
                // Only clear provider if it was created internally
                if (!externalProvider) {
                    provider = undefined;
                }
            },

            async getAccounts(): Promise<readonly Address[]> {
                if (!provider) {
                    // Fallback: derive from config if provider not yet created
                    const account: Account =
                        typeof accountConfig === "string"
                            ? privateKeyToAccount(accountConfig as Hex)
                            : accountConfig;
                    return [account.address];
                }

                // Query accounts from the provider
                return provider.request<Address[]>({
                    method: "eth_accounts",
                });
            },

            async getChainId(): Promise<number> {
                if (!provider) return defaultChain.id;

                const chainIdHex = await provider.request<string>({
                    method: "eth_chainId",
                });

                return parseInt(chainIdHex, 16);
            },

            async getProvider(): Promise<E2EProvider> {
                if (!provider) {
                    const connectorConfig: E2EProviderConfig = {
                        chains,
                        rpcUrls,
                        account: accountConfig,
                        debug,
                    };
                    provider = createE2EProvider(connectorConfig);
                }

                return provider;
            },

            async isAuthorized(): Promise<boolean> {
                // Always authorized in E2E mode
                return true;
            },

            async switchChain({ chainId }): Promise<Chain> {
                if (provider) {
                    // This validates the chain is supported and updates internal state
                    await provider.request({
                        method: "wallet_switchEthereumChain",
                        params: [{ chainId: `0x${chainId.toString(16)}` }],
                    });
                }

                config.emitter.emit("change", { chainId });

                // Try to return the actual chain config if available
                const targetChain = chains?.find((c) => c.id === chainId) as Chain | undefined;
                if (targetChain) return targetChain;

                // Fallback for when chains array is not provided
                return {
                    id: chainId,
                    name: defaultChain.name ?? `Chain ${chainId}`,
                    nativeCurrency: defaultChain.nativeCurrency,
                    rpcUrls: defaultChain.rpcUrls,
                } as Chain;
            },

            onAccountsChanged(accounts): void {
                if (provider) {
                    provider.emit("accountsChanged", accounts as Address[]);
                }
                config.emitter.emit("change", { accounts: accounts as readonly Address[] });
            },

            onChainChanged(chainId): void {
                const id = typeof chainId === "string" ? parseInt(chainId, 16) : chainId;
                // Note: We don't call setChain here because this callback is triggered
                // by the provider's chainChanged event, which means the provider already
                // updated its internal state. We just need to forward to wagmi.
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
