import type { E2EProviderWithInternal, SigningAccountInput } from "./provider.js";
import type { E2EProvider } from "./types.js";

/**
 * Changes the active chain used by the provider.
 * This updates the internal wallet client, RPC URL, and emits a chainChanged event.
 *
 * @param provider - The E2E provider instance (must be created with createE2EProvider)
 * @param chainId - The chain ID to switch to. Must be in the provider's supported chains.
 *
 * @throws Error if the chain is not in the provider's supported chains list
 *
 * @example
 * ```ts
 * import { arbitrum, mainnet } from 'viem/chains';
 *
 * const provider = createE2EProvider({
 *   chains: [mainnet, arbitrum],
 *   rpcUrls: {
 *     1: 'http://mainnet-anvil:8545',
 *     42161: 'http://arbitrum-anvil:8546',
 *   },
 * });
 *
 * // Switch to Arbitrum (provider now uses arbitrum RPC)
 * setChain(provider, arbitrum.id);
 *
 * // Verify the switch
 * const chainId = await provider.request({ method: 'eth_chainId' });
 * console.log(chainId); // '0xa4b1' (42161 in hex)
 * ```
 */
export function setChain(provider: E2EProvider, chainId: number): void {
    const p = provider as E2EProviderWithInternal;
    if (typeof p.setChain !== "function") {
        throw new Error(
            "Provider does not support setChain. Make sure you're using a provider created with createE2EProvider.",
        );
    }
    p.setChain(chainId);
}

/**
 * Triggers a disconnect event on the provider
 */
export function disconnect(provider: E2EProvider): void {
    const p = provider as E2EProviderWithInternal;
    if (typeof p.disconnect !== "function") {
        throw new Error(
            "Provider does not support disconnect. Make sure you're using a provider created with createE2EProvider.",
        );
    }
    p.disconnect();
}

/**
 * Changes the signing account used by the provider.
 * This updates both the internal wallet client and emits an accountsChanged event.
 *
 * @param provider - The E2E provider instance (must be created with createE2EProvider)
 * @param account - The account to switch to. Can be:
 *   - A number (0-9): Index of the default Anvil account
 *   - An address string (42 chars): Looks up the matching Anvil account's private key
 *   - A private key string (66 chars): Uses the raw private key directly
 *   - A viem Account object: Uses the account directly (for impersonation or custom accounts)
 *
 * @example
 * ```ts
 * const provider = createE2EProvider();
 *
 * // Switch by index (0-9)
 * setSigningAccount(provider, 0);  // First Anvil account
 * setSigningAccount(provider, 5);  // Sixth Anvil account
 *
 * // Switch by address (looks up matching Anvil private key)
 * setSigningAccount(provider, '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
 *
 * // Switch by raw private key
 * setSigningAccount(provider, '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
 *
 * // Switch by viem Account object
 * setSigningAccount(provider, privateKeyToAccount('0x...'));
 * ```
 */
export function setSigningAccount(provider: E2EProvider, account: SigningAccountInput): void {
    const p = provider as E2EProviderWithInternal;
    if (typeof p.setSigningAccount !== "function") {
        throw new Error(
            "Provider does not support setSigningAccount. Make sure you're using a provider created with createE2EProvider.",
        );
    }
    p.setSigningAccount(account);
}

/**
 * Sets whether the provider should reject signature requests.
 * When enabled, signing attempts will throw a 4001 "User Rejected Request" error.
 *
 * Affects: personal_sign, eth_sign, eth_signTypedData, eth_signTypedData_v3, eth_signTypedData_v4
 *
 * @param provider - The E2E provider instance
 * @param reject - Whether to reject signature requests
 *
 * @example
 * ```ts
 * const provider = createE2EProvider();
 *
 * // Enable rejection
 * setRejectSignature(provider, true);
 *
 * // This will throw: ProviderRpcError { code: 4001, message: "User rejected the signature request." }
 * await provider.request({ method: 'personal_sign', params: ['0x...', '0x...'] });
 *
 * // Disable rejection
 * setRejectSignature(provider, false);
 * ```
 */
export function setRejectSignature(provider: E2EProvider, reject: boolean): void {
    const p = provider as E2EProviderWithInternal;
    if (typeof p.setRejectSignature !== "function") {
        throw new Error(
            "Provider does not support setRejectSignature. Make sure you're using a provider created with createE2EProvider.",
        );
    }
    p.setRejectSignature(reject);
}

/**
 * Sets whether the provider should reject transaction requests (eth_sendTransaction).
 * When enabled, transaction attempts will throw a 4001 "User Rejected Request" error.
 *
 * @param provider - The E2E provider instance
 * @param reject - Whether to reject transaction requests
 *
 * @example
 * ```ts
 * const provider = createE2EProvider();
 *
 * // Enable rejection
 * setRejectTransaction(provider, true);
 *
 * // This will throw: ProviderRpcError { code: 4001, message: "User rejected the transaction request." }
 * await provider.request({ method: 'eth_sendTransaction', params: [{ to: '0x...', value: '0x1' }] });
 *
 * // Disable rejection
 * setRejectTransaction(provider, false);
 * ```
 */
export function setRejectTransaction(provider: E2EProvider, reject: boolean): void {
    const p = provider as E2EProviderWithInternal;
    if (typeof p.setRejectTransaction !== "function") {
        throw new Error(
            "Provider does not support setRejectTransaction. Make sure you're using a provider created with createE2EProvider.",
        );
    }
    p.setRejectTransaction(reject);
}
