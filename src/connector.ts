import type { Account, Address, Chain, Hex } from "viem";
import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createConnector } from "wagmi";

import type { E2EProvider, E2EProviderConfig } from "./types.js";
import { DEFAULT_ANVIL_PRIVATE_KEY, DEFAULT_ANVIL_RPC_URL, DEFAULT_CHAIN } from "./constants.js";
import {
    createE2EProvider,
    disconnect as disconnectProvider,
    setAccounts,
    setChain,
} from "./provider.js";

/**
 * Configuration for creating a new provider internally
 */
export type E2EConnectorConfigParams = {
    /** RPC URL for blockchain operations (default: http://127.0.0.1:8545) */
    rpcUrl?: string;
    /**
     * Account for signing transactions. Can be:
     * - A private key hex string (default: Anvil's first test account)
     * - A viem Account object (for impersonation or custom accounts)
     */
    account?: Hex | Account;
    /** Chain configuration (default: mainnet) */
    chain?: Chain;
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
 * // Or with custom configuration
 * const customConfig = createConfig({
 *   chains: [mainnet],
 *   connectors: [
 *     e2eConnector({
 *       rpcUrl: 'http://127.0.0.1:8545',
 *       account: '0xYourPrivateKey...',
 *       chain: mainnet,
 *       debug: true,
 *     }),
 *   ],
 *   transports: {
 *     [mainnet.id]: http('http://127.0.0.1:8545'),
 *   },
 * })
 * ```
 */
/**
 * Type guard: check if parameters include a pre-constructed provider
 */
function hasProvider(params: E2EConnectorParameters): params is E2EConnectorProviderParams {
    return "provider" in params && params.provider !== undefined;
}

export function e2eConnector(
    parameters: E2EConnectorParameters = {},
): ReturnType<typeof createConnector<E2EProvider>> {
    // Resolve configuration based on whether a provider was passed
    const externalProvider = hasProvider(parameters) ? parameters.provider : undefined;

    // Only used when creating provider internally
    const rpcUrl = hasProvider(parameters)
        ? DEFAULT_ANVIL_RPC_URL
        : (parameters.rpcUrl ?? DEFAULT_ANVIL_RPC_URL);
    const accountConfig = hasProvider(parameters)
        ? DEFAULT_ANVIL_PRIVATE_KEY
        : (parameters.account ?? DEFAULT_ANVIL_PRIVATE_KEY);
    const chain = hasProvider(parameters) ? DEFAULT_CHAIN : (parameters.chain ?? DEFAULT_CHAIN);
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
                        rpcUrl,
                        chain,
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
                if (!provider) return chain.id;

                const chainIdHex = await provider.request<string>({
                    method: "eth_chainId",
                });

                return parseInt(chainIdHex, 16);
            },

            async getProvider(): Promise<E2EProvider> {
                if (!provider) {
                    const connectorConfig: E2EProviderConfig = {
                        rpcUrl,
                        chain,
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
                    await provider.request({
                        method: "wallet_switchEthereumChain",
                        params: [{ chainId: `0x${chainId.toString(16)}` }],
                    });
                    setChain(provider, chainId);
                }

                config.emitter.emit("change", { chainId });

                // Return the chain config - in E2E mode we accept any chain
                return {
                    id: chainId,
                    name: `Chain ${chainId}`,
                    nativeCurrency: chain.nativeCurrency,
                    rpcUrls: chain.rpcUrls,
                };
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
