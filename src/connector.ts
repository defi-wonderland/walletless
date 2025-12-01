import type { Account, Address, Chain, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
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
    /** RPC URL for blockchain operations (typically Anvil at http://127.0.0.1:8545) */
    rpcUrl: string;
    /**
     * Account for signing transactions. Can be:
     * - A private key hex string (e.g., '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')
     * - A viem Account object (for impersonation or custom accounts)
     */
    account: Hex | Account;
    /** Chain configuration (e.g., mainnet fork) */
    chain: Chain;
    /** Enable debug logging */
    debug?: boolean;
};

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
 * import { e2eConnector } from '@defi-wonderland/e2e-provider'
 * import { createConfig, http } from 'wagmi'
 * import { mainnet } from 'wagmi/chains'
 *
 * // Using a private key (Anvil's default test account)
 * const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
 *
 * const config = createConfig({
 *   chains: [mainnet],
 *   connectors: [
 *     e2eConnector({
 *       rpcUrl: 'http://127.0.0.1:8545', // Anvil
 *       account: TEST_PRIVATE_KEY,
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
export function e2eConnector(
    parameters: E2EConnectorParameters,
): ReturnType<typeof createConnector<E2EProvider>> {
    const { rpcUrl, account: accountConfig, chain, debug = false } = parameters;

    // Resolve account from private key or use provided account
    const account: Account =
        typeof accountConfig === "string"
            ? privateKeyToAccount(accountConfig as Hex)
            : accountConfig;

    let provider: E2EProvider | undefined;

    return createConnector<E2EProvider>((config) => {
        return {
            id: "e2e-connector",
            name: "E2E Connector",
            type: "e2e",

            async setup(): Promise<void> {
                // No setup needed
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
