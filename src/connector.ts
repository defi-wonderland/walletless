import type { Account, Address, Chain, Hex } from "viem";
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
export function e2eConnector(
    parameters: E2EConnectorParameters = {},
): ReturnType<typeof createConnector> {
    const {
        rpcUrl = DEFAULT_ANVIL_RPC_URL,
        account: accountConfig = DEFAULT_ANVIL_PRIVATE_KEY,
        chain = DEFAULT_CHAIN,
        debug = false,
    } = parameters;

    // Resolve account from private key or use provided account
    const account: Account =
        typeof accountConfig === "string"
            ? privateKeyToAccount(accountConfig as Hex)
            : accountConfig;

    let provider: E2EProvider | undefined;

    return createConnector((config) => ({
        id: "walletless-connector",
        name: "Walletless Connector",
        type: "walletless",

        async setup(): Promise<void> {
            // No setup needed
        },

        // @ts-expect-error - wagmi's withCapabilities conditional type is not satisfiable without runtime checks
        async connect({ chainId }: { chainId?: number } = {}): Promise<{
            accounts: readonly Address[];
            chainId: number;
        }> {
            const targetChainId = chainId ?? chain.id;

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

        async switchChain({ chainId }: { chainId: number }): Promise<Chain> {
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

        onAccountsChanged(accounts: Address[]): void {
            if (provider && accounts.length > 0) {
                setAccounts(provider, [...accounts]);
            }
            config.emitter.emit("change", { accounts });
        },

        onChainChanged(chainId: string): void {
            const id = parseInt(chainId, 16);
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
    }));
}
