import type { Account, Address, Chain, Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import type {
    CompatibleChain,
    E2EProvider,
    E2EProviderConfig,
    JsonRpcRequest,
    JsonRpcResponse,
    ProviderEvents,
    ProviderState,
    TransactionRequest,
    TypedData,
} from "./types.js";
import {
    ANVIL_ACCOUNTS,
    DEFAULT_ANVIL_PRIVATE_KEY,
    DEFAULT_ANVIL_RPC_URL,
    DEFAULT_CHAIN,
    isReadMethod,
    isWalletMethod,
    isWriteMethod,
} from "./constants.js";

type EventListeners = {
    [K in keyof ProviderEvents]: Set<ProviderEvents[K]>;
};

/**
 * Input types for setSigningAccount:
 * - number (0-9): Index into ANVIL_ACCOUNTS array
 * - Address (42 chars): Ethereum address to lookup in ANVIL_ACCOUNTS
 * - Hex (66 chars): Raw private key
 * - Account: viem Account object (for impersonation or custom accounts)
 */
export type SigningAccountInput = number | Address | Hex | Account;

/**
 * Type guard: check if input is a viem Account object
 */
function isAccount(input: SigningAccountInput): input is Account {
    return typeof input === "object" && input !== null && "address" in input;
}

/**
 * Resolve various account input formats to an Account object
 */
function resolveAccount(input: SigningAccountInput): PrivateKeyAccount | Account {
    // Case 1: viem Account object — use directly (for impersonation/custom accounts)
    if (isAccount(input)) {
        return input;
    }

    // Case 2: Numeric index (0-9)
    if (typeof input === "number") {
        if (input < 0 || input > 9 || !Number.isInteger(input)) {
            throw new Error(`Invalid Anvil account index: ${input}. Must be 0-9.`);
        }
        // Safe to use ! since we validated index is 0-9 and ANVIL_ACCOUNTS has exactly 10 elements
        const anvilAccount = ANVIL_ACCOUNTS[input]!;
        return privateKeyToAccount(anvilAccount.privateKey);
    }

    // Case 3: String — distinguish by length (address=42, privateKey=66)
    const inputStr = input as string;

    if (inputStr.length === 66) {
        return privateKeyToAccount(inputStr as Hex);
    }

    if (inputStr.length === 42) {
        const match = ANVIL_ACCOUNTS.find(
            (a) => a.address.toLowerCase() === inputStr.toLowerCase(),
        );
        if (!match) {
            throw new Error(`Address ${inputStr} is not a default Anvil account.`);
        }
        return privateKeyToAccount(match.privateKey);
    }

    throw new Error(
        `Invalid input: expected index (0-9), address (42 chars), private key (66 chars), or Account object.`,
    );
}

/**
 * Internal state that can be mutated by helper functions like setSigningAccount
 */
interface InternalState {
    account: PrivateKeyAccount | Account;
    walletClient: ReturnType<typeof createWalletClient>;
    chains: CompatibleChain[];
    currentChain: CompatibleChain;
    rpcUrl: string;
    rpcUrls: Record<number, string>;
}

/**
 * Extended provider type that includes internal state for account and chain switching
 */
export interface E2EProviderWithInternal extends E2EProvider {
    __internal: {
        account: PrivateKeyAccount | Account;
        walletClient: ReturnType<typeof createWalletClient>;
        chains: CompatibleChain[];
        currentChain: CompatibleChain;
        rpcUrl: string;
        state: ProviderState;
    };
}

/**
 * Creates an EIP-1193 compatible provider for E2E testing.
 *
 * This provider implements a "Man-in-the-Middle" pattern:
 * - READ operations (eth_call, eth_getBalance, etc.) → Forwarded directly to Anvil RPC
 * - WRITE operations (eth_sendTransaction, eth_sign, etc.) → Handled locally with signing logic
 *
 * This keeps 100% chain realism while maintaining full control in tests.
 *
 * @example
 * ```ts
 * const provider = createE2EProvider({
 *   chains: [mainnet, arbitrum],
 *   rpcUrls: {
 *     1: 'http://mainnet-anvil:8545',
 *     42161: 'http://arbitrum-anvil:8546',
 *   },
 *   account: '0x...privateKey',
 *   debug: true,
 * })
 *
 * // Use with wagmi or directly
 * const accounts = await provider.request({ method: 'eth_requestAccounts' })
 * ```
 */
export function createE2EProvider(config: E2EProviderConfig = {}): E2EProviderWithInternal {
    const {
        chains: chainsConfig,
        rpcUrls: rpcUrlsConfig = {},
        account: accountConfig = DEFAULT_ANVIL_PRIVATE_KEY,
        debug = false,
    } = config;

    // Build supported chains array (default to mainnet if not provided)
    const supportedChains: CompatibleChain[] = (chainsConfig as CompatibleChain[] | undefined) ?? [
        DEFAULT_CHAIN,
    ];

    // First chain is the default
    const initialChain = supportedChains[0] ?? DEFAULT_CHAIN;

    /**
     * Get RPC URL for a chain, falling back to default Anvil URL
     */
    function getRpcUrl(chainId: number): string {
        return rpcUrlsConfig[chainId] ?? DEFAULT_ANVIL_RPC_URL;
    }

    // Get initial RPC URL for the first chain
    const initialRpcUrl = getRpcUrl(initialChain.id);

    let requestId = 0;

    // Create account from private key or use provided account
    const initialAccount: PrivateKeyAccount | Account =
        typeof accountConfig === "string"
            ? privateKeyToAccount(accountConfig as Hex)
            : accountConfig;

    // Create wallet client for signing operations with explicit account
    const initialWalletClient = createWalletClient({
        account: initialAccount,
        chain: initialChain as Chain,
        transport: http(initialRpcUrl),
    });

    // Internal state that can be mutated by setSigningAccount and setChain
    const internal: InternalState = {
        account: initialAccount,
        walletClient: initialWalletClient,
        chains: supportedChains,
        currentChain: initialChain,
        rpcUrl: initialRpcUrl,
        rpcUrls: rpcUrlsConfig,
    };

    const state: ProviderState = {
        accounts: [initialAccount.address],
        chainId: initialChain.id,
        isConnected: false,
        supportedChainIds: supportedChains.map((c) => c.id),
    };

    const listeners: EventListeners = {
        accountsChanged: new Set(),
        chainChanged: new Set(),
        connect: new Set(),
        disconnect: new Set(),
        message: new Set(),
    };

    function log(message: string, data?: unknown, id?: number): void {
        if (!debug) return;
        const idSuffix = id !== undefined ? `${id}` : "";
        const prefix = `[ Walletless ] request: ${idSuffix}`;
        if (data !== undefined) {
            console.log(`${prefix} `, { internal }, `\n${message.toUpperCase()}`, data);
        } else {
            console.log(prefix, message);
        }
    }

    function emit<K extends keyof ProviderEvents>(
        event: K,
        ...args: Parameters<ProviderEvents[K]>
    ): void {
        listeners[event].forEach((listener) => {
            // @ts-expect-error - TypeScript can't properly infer the listener type here
            listener(...args);
        });
    }

    /**
     * Send a JSON-RPC request to the current chain's RPC URL
     */
    async function sendJsonRpc<T>(method: string, params?: unknown[], logId?: number): Promise<T> {
        const id = ++requestId;
        const rpcRequest: JsonRpcRequest = {
            jsonrpc: "2.0",
            method,
            params,
            id,
        };

        log(`${method} -> ${internal.rpcUrl}`, rpcRequest, logId ?? id);

        const response = await fetch(internal.rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(rpcRequest),
        });

        const data: JsonRpcResponse<T> = (await response.json()) as JsonRpcResponse<T>;

        log(`${method} <- ${internal.rpcUrl}`, data, logId ?? id);

        if (data.error) {
            const error = new Error(data.error.message);
            // @ts-expect-error - Adding code property to error
            error.code = data.error.code;
            throw error;
        }

        return data.result as T;
    }

    /**
     * Handle read methods by sending to Anvil RPC
     */
    async function handleReadMethod<T>(
        method: string,
        params?: unknown[],
        logId?: number,
    ): Promise<T> {
        return sendJsonRpc<T>(method, params, logId);
    }

    /**
     * Handle write operations with local signing
     */
    async function handleWriteMethod<T>(
        method: string,
        params?: unknown[],
        logId?: number,
    ): Promise<T> {
        log("incoming", { method, params }, logId);

        let result: T;

        switch (method) {
            case "eth_sendTransaction": {
                const txParams = params?.[0] as TransactionRequest;

                // Build transaction request with proper typing
                const txRequest = {
                    chain: internal.currentChain as Chain,
                    to: txParams.to,
                    value: txParams.value ? BigInt(txParams.value) : undefined,
                    data: txParams.data,
                    gas: txParams.gas ? BigInt(txParams.gas) : undefined,
                    nonce: txParams.nonce ? parseInt(txParams.nonce, 16) : undefined,
                    // Gas pricing - only one strategy should be used
                    ...(txParams.maxFeePerGas
                        ? {
                              maxFeePerGas: BigInt(txParams.maxFeePerGas),
                              maxPriorityFeePerGas: txParams.maxPriorityFeePerGas
                                  ? BigInt(txParams.maxPriorityFeePerGas)
                                  : undefined,
                          }
                        : txParams.gasPrice
                          ? { gasPrice: BigInt(txParams.gasPrice) }
                          : {}),
                };

                const hash = await internal.walletClient.sendTransaction({
                    ...txRequest,
                    account: internal.account,
                });
                result = hash as T;
                break;
            }

            case "personal_sign": {
                // personal_sign params: [message, address]
                const message = params?.[0] as Hex;
                const signature = await internal.walletClient.signMessage({
                    account: internal.account,
                    message: { raw: message },
                });
                result = signature as T;
                break;
            }

            case "eth_sign": {
                // eth_sign params: [address, message]
                const ethSignMessage = params?.[1] as Hex;
                const ethSignature = await internal.walletClient.signMessage({
                    account: internal.account,
                    message: { raw: ethSignMessage },
                });
                result = ethSignature as T;
                break;
            }

            case "eth_signTypedData":
            case "eth_signTypedData_v3":
            case "eth_signTypedData_v4": {
                // params: [address, typedData]
                const typedDataJson = params?.[1] as string | TypedData;
                const typedData: TypedData =
                    typeof typedDataJson === "string"
                        ? (JSON.parse(typedDataJson) as TypedData)
                        : typedDataJson;

                const typedDataSignature = await internal.walletClient.signTypedData({
                    account: internal.account,
                    domain: typedData.domain,
                    types: typedData.types,
                    primaryType: typedData.primaryType,
                    message: typedData.message,
                });
                result = typedDataSignature as T;
                break;
            }

            case "eth_sendRawTransaction": {
                // Forward raw transaction to Anvil (already logs via sendJsonRpc)
                result = await sendJsonRpc<T>(method, params, logId);
                break;
            }

            default:
                throw new Error(`Unsupported write method: ${method}`);
        }

        log("outgoing", { method, result }, logId);
        return result;
    }

    /**
     * Handle wallet/account methods
     */
    async function handleWalletMethod<T>(
        method: string,
        params?: unknown[],
        logId?: number,
    ): Promise<T> {
        log("incoming", { method, params }, logId);

        let result: T;

        switch (method) {
            case "eth_accounts":
                result = state.accounts as T;
                break;

            case "eth_chainId":
                result = `0x${state.chainId.toString(16)}` as T;
                break;

            case "net_version":
                result = state.chainId.toString() as T;
                break;

            case "eth_requestAccounts": {
                if (!state.isConnected) {
                    state.isConnected = true;
                    emit("connect", { chainId: `0x${state.chainId.toString(16)}` as Hex });
                }
                result = state.accounts as T;
                break;
            }

            case "wallet_switchEthereumChain": {
                const [{ chainId }] = params as [{ chainId: Hex }];
                const newChainId = parseInt(chainId, 16);

                // Validate chain is supported
                if (!state.supportedChainIds.includes(newChainId)) {
                    const error = new Error(
                        `Chain ${newChainId} is not supported. Supported chains: ${state.supportedChainIds.join(", ")}`,
                    );
                    // @ts-expect-error - Adding code property to error (EIP-1193 error code)
                    error.code = 4902; // Chain not added
                    throw error;
                }

                // Find chain config and update internal state
                const newChain = internal.chains.find((c: CompatibleChain) => c.id === newChainId);
                if (newChain) {
                    const newRpcUrl = getRpcUrl(newChainId);
                    internal.currentChain = newChain;
                    internal.rpcUrl = newRpcUrl;
                    internal.walletClient = createWalletClient({
                        account: internal.account,
                        chain: newChain as Chain,
                        transport: http(newRpcUrl),
                    }) as ReturnType<typeof createWalletClient>;
                }

                state.chainId = newChainId;
                emit("chainChanged", chainId);
                result = null as T;
                break;
            }

            case "wallet_addEthereumChain": {
                // In E2E testing, we just accept the chain addition
                result = null as T;
                break;
            }

            case "wallet_requestPermissions":
            case "wallet_getPermissions": {
                // Return mock permissions
                result = [{ parentCapability: "eth_accounts" }] as T;
                break;
            }

            default:
                throw new Error(`Unsupported wallet method: ${method}`);
        }

        log("outgoing", { method, result }, logId);
        return result;
    }

    /**
     * Main request handler implementing EIP-1193
     */
    async function request<T>({
        method,
        params,
    }: {
        method: string;
        params?: unknown[];
    }): Promise<T> {
        const logId = ++requestId;

        // Route to appropriate handler based on method type
        // Wallet methods first (they handle local state like chainId, accounts)
        if (isWalletMethod(method)) {
            return handleWalletMethod<T>(method, params, logId);
        }

        // Write/signing methods
        if (isWriteMethod(method)) {
            return handleWriteMethod<T>(method, params, logId);
        }

        // Read methods go to RPC
        if (isReadMethod(method)) {
            return handleReadMethod<T>(method, params, logId);
        }

        // Fallback: try as read method (for any unknown methods)
        log(`Unknown method ${method}, forwarding to RPC`, undefined, logId);
        return sendJsonRpc<T>(method, params, logId);
    }

    /**
     * Subscribe to provider events
     */
    function on<K extends keyof ProviderEvents>(event: K, listener: ProviderEvents[K]): void {
        listeners[event].add(listener);
    }

    /**
     * Unsubscribe from provider events
     */
    function removeListener<K extends keyof ProviderEvents>(
        event: K,
        listener: ProviderEvents[K],
    ): void {
        listeners[event].delete(listener);
    }

    /**
     * Update internal state when signing account changes
     */
    function updateSigningAccount(newAccount: PrivateKeyAccount | Account): void {
        internal.account = newAccount;
        internal.walletClient = createWalletClient({
            account: newAccount,
            chain: internal.currentChain as Chain,
            transport: http(internal.rpcUrl),
        }) as ReturnType<typeof createWalletClient>;
        state.accounts = [newAccount.address];
    }

    /**
     * Update internal state when chain changes
     */
    function updateChain(newChain: CompatibleChain): void {
        const newRpcUrl = getRpcUrl(newChain.id);
        internal.currentChain = newChain;
        internal.rpcUrl = newRpcUrl;
        internal.walletClient = createWalletClient({
            account: internal.account,
            chain: newChain as Chain,
            transport: http(newRpcUrl),
        }) as ReturnType<typeof createWalletClient>;
        state.chainId = newChain.id;
    }

    return {
        request,
        on,
        removeListener,
        emit,
        __internal: {
            get account(): PrivateKeyAccount | Account {
                return internal.account;
            },
            get walletClient(): ReturnType<typeof createWalletClient> {
                return internal.walletClient;
            },
            get chains(): CompatibleChain[] {
                return internal.chains;
            },
            get currentChain(): CompatibleChain {
                return internal.currentChain;
            },
            get rpcUrl(): string {
                return internal.rpcUrl;
            },
            get state(): ProviderState {
                return state;
            },
            set account(newAccount: PrivateKeyAccount | Account) {
                updateSigningAccount(newAccount);
            },
            set walletClient(_) {
                // walletClient is derived from account, so we don't allow direct setting
                throw new Error("Cannot set walletClient directly. Use setSigningAccount instead.");
            },
            set currentChain(newChain: CompatibleChain) {
                updateChain(newChain);
            },
        },
    };
}

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
    const providerWithInternal = provider as E2EProviderWithInternal;

    if (!providerWithInternal.__internal) {
        throw new Error(
            "Provider does not support setChain. Make sure you're using a provider created with createE2EProvider.",
        );
    }

    const { chains, state } = providerWithInternal.__internal;

    // Validate chain is supported
    if (!state.supportedChainIds.includes(chainId)) {
        throw new Error(
            `Chain ${chainId} is not supported. Supported chains: ${state.supportedChainIds.join(", ")}`,
        );
    }

    // Find chain config
    const newChain = chains.find((c) => c.id === chainId);
    if (!newChain) {
        throw new Error(`Chain config not found for chain ID ${chainId}`);
    }

    // Update internal state (this recreates the wallet client)
    providerWithInternal.__internal.currentChain = newChain;

    // Emit chainChanged event
    const chainIdHex = `0x${chainId.toString(16)}` as Hex;
    provider.emit("chainChanged", chainIdHex);
}

/**
 * Triggers a disconnect event on the provider
 */
export function disconnect(provider: E2EProvider): void {
    provider.emit("disconnect", { code: 4900, message: "Disconnected" });
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
    const providerWithInternal = provider as E2EProviderWithInternal;

    if (!providerWithInternal.__internal) {
        throw new Error(
            "Provider does not support setSigningAccount. Make sure you're using a provider created with createE2EProvider.",
        );
    }

    const newAccount = resolveAccount(account);
    providerWithInternal.__internal.account = newAccount;

    // Emit accountsChanged event to notify listeners
    provider.emit("accountsChanged", [newAccount.address]);
}
