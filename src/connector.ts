import type { Account, Address, Chain, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import type {
    ConnectorInstance,
    CreateConnectorFn,
    E2EProvider,
    E2EProviderConfig,
} from "./types.js";
import { DEFAULT_ANVIL_PRIVATE_KEY, DEFAULT_ANVIL_RPC_URL, DEFAULT_CHAIN } from "./constants.js";
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
 * Creates a custom connector for e2e testing.
 *
 * This connector implements a "Virtual Wallet" pattern that:
 * - Routes READ operations (eth_call, eth_getBalance) directly to Anvil RPC
 * - Handles WRITE operations (eth_sendTransaction, eth_sign) with local signing
 *
 * This keeps 100% chain realism while providing testing-level control.
 *
 * @example
 * ```ts
 * const builder = createE2EConnectorBuilder(hostCreateConnector);
 * const connector = builder({ rpcUrl, account, chain });
 * ```
 */

/**
 * Build the E2E connector using a host `createConnector` implementation.
 * This keeps the core builder framework-agnostic.
 */
export const createE2EConnectorBuilder = (createConnectorFn: CreateConnectorFn) => {
    return (parameters: E2EConnectorParameters = {}): ConnectorInstance => {
        const {
            rpcUrl = DEFAULT_ANVIL_RPC_URL,
            account: accountConfig = DEFAULT_ANVIL_PRIVATE_KEY,
            chain = DEFAULT_CHAIN,
            debug = false,
        } = parameters;

        const account: Account =
            typeof accountConfig === "string"
                ? privateKeyToAccount(accountConfig as Hex)
                : accountConfig;

        let provider: E2EProvider | undefined;

        return createConnectorFn((config) => {
            return {
                id: "e2e-connector",
                name: "E2E Connector",
                type: "e2e",

                async setup(): Promise<void> {
                    return;
                },

                async connect({ chainId } = {}): Promise<{
                    accounts: readonly Address[];
                    chainId: number;
                }> {
                    const targetChainId = chainId || chain.id;

                    const connectorConfig: E2EProviderConfig = {
                        rpcUrl,
                        chain,
                        account: accountConfig,
                        debug,
                    };

                    provider = createE2EProvider(connectorConfig);

                    return {
                        accounts: [account.address],
                        chainId: targetChainId,
                    };
                },

                async disconnect(): Promise<void> {
                    if (provider) {
                        disconnectProvider(provider);
                    }
                    provider = undefined;
                },

                async getAccounts(): Promise<readonly Address[]> {
                    return [account.address];
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

                    // Return the chain config; in E2E mode we accept any chain
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
    };
};
