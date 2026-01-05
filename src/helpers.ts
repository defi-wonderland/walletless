import type { Address, Hex } from "viem";

import type { E2EProvider, E2EProviderConfig } from "./types.js";
import { WalletlessProvider } from "./provider.js";

/**
 * Creates an EIP-1193 compatible provider for E2E testing.
 *
 * This is a convenience function that returns a new WalletlessProvider instance.
 *
 * @example
 * ```ts
 * const provider = createE2EProvider({
 *   rpcUrl: 'http://127.0.0.1:8545', // Anvil
 *   chain: mainnet,
 *   account: '0x...privateKey', // or impersonated account
 *   debug: true,
 * })
 *
 * // Use with wagmi or directly
 * const accounts = await provider.request({ method: 'eth_requestAccounts' })
 * ```
 */
export function createE2EProvider(config: E2EProviderConfig = {}): WalletlessProvider {
    return new WalletlessProvider(config);
}

/**
 * Updates the provider state with new accounts
 */
export function setAccounts(provider: E2EProvider, accounts: Address[]): void {
    provider.emit("accountsChanged", accounts);
}

/**
 * Updates the provider state with a new chain
 */
export function setChain(provider: E2EProvider, chainId: number): void {
    const chainIdHex = `0x${chainId.toString(16)}` as Hex;
    provider.emit("chainChanged", chainIdHex);
}

/**
 * Triggers a disconnect event on the provider
 */
export function disconnect(provider: E2EProvider): void {
    provider.emit("disconnect", { code: 4900, message: "Disconnected" });
}
