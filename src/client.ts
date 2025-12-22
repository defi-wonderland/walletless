import type { Account, Chain, Transport, WalletClient } from "viem";
import { createWalletClient, custom } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import type { E2EProvider, E2EProviderConfig } from "./types.js";
import { DEFAULT_ANVIL_PRIVATE_KEY, DEFAULT_ANVIL_RPC_URL, DEFAULT_CHAIN } from "./constants.js";
import { createE2EProvider } from "./provider.js";

export type E2EClient = {
    provider: E2EProvider;
    walletClient: WalletClient<Transport, Chain, Account>;
};

/**
 * Creates an E2E viem wallet client backed by the Walletless provider.
 * Provides a ready-to-use viem client plus the underlying EIP-1193 provider.
 */
export function createE2EClient(config: E2EProviderConfig = {}): E2EClient {
    const {
        rpcUrl = DEFAULT_ANVIL_RPC_URL,
        chain = DEFAULT_CHAIN,
        account: accountConfig = DEFAULT_ANVIL_PRIVATE_KEY,
        debug,
    } = config;

    const account: Account =
        typeof accountConfig === "string" ? privateKeyToAccount(accountConfig) : accountConfig;

    const provider = createE2EProvider({ rpcUrl, chain, account, debug });
    const walletClient = createWalletClient({
        account,
        chain,
        transport: custom(provider),
    });

    return { provider, walletClient };
}
