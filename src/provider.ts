import type { Account, Address, Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import type {
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
export function createE2EProvider(config: E2EProviderConfig = {}): E2EProvider {
    const {
        rpcUrl = DEFAULT_ANVIL_RPC_URL,
        chain = DEFAULT_CHAIN,
        account: accountConfig = DEFAULT_ANVIL_PRIVATE_KEY,
        debug = false,
    } = config;

    let requestId = 0;

    // Create account from private key or use provided account
    const account: PrivateKeyAccount | Account =
        typeof accountConfig === "string"
            ? privateKeyToAccount(accountConfig as Hex)
            : accountConfig;

    // Create wallet client for signing operations with explicit account
    const walletClient = createWalletClient({
        account,
        chain,
        transport: http(rpcUrl),
    });

    const state: ProviderState = {
        accounts: [account.address],
        chainId: chain.id,
        isConnected: false,
    };

    const listeners: EventListeners = {
        accountsChanged: new Set(),
        chainChanged: new Set(),
        connect: new Set(),
        disconnect: new Set(),
        message: new Set(),
    };

    function log(...args: unknown[]): void {
        if (debug) console.log("[E2E-Provider]", ...args);
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
     * Send a JSON-RPC request to Anvil
     */
    async function sendJsonRpc<T>(method: string, params?: unknown[]): Promise<T> {
        const id = ++requestId;
        const request: JsonRpcRequest = {
            jsonrpc: "2.0",
            method,
            params,
            id,
        };

        log("Sending RPC request:", method, params);

        const response = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
        });

        const data: JsonRpcResponse<T> = (await response.json()) as JsonRpcResponse<T>;

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
    async function handleReadMethod<T>(method: string, params?: unknown[]): Promise<T> {
        return sendJsonRpc<T>(method, params);
    }

    /**
     * Handle write operations with local signing
     */
    async function handleWriteMethod<T>(method: string, params?: unknown[]): Promise<T> {
        log("Handling write method:", method, params);

        switch (method) {
            case "eth_sendTransaction": {
                const txParams = params?.[0] as TransactionRequest;

                // Build transaction request with proper typing
                const txRequest = {
                    chain,
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

                const hash = await walletClient.sendTransaction(txRequest);
                return hash as T;
            }

            case "personal_sign": {
                // personal_sign params: [message, address]
                const message = params?.[0] as Hex;
                const signature = await walletClient.signMessage({
                    message: { raw: message },
                });
                return signature as T;
            }

            case "eth_sign": {
                // eth_sign params: [address, message]
                const ethSignMessage = params?.[1] as Hex;
                const ethSignature = await walletClient.signMessage({
                    message: { raw: ethSignMessage },
                });
                return ethSignature as T;
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

                const typedDataSignature = await walletClient.signTypedData({
                    domain: typedData.domain,
                    types: typedData.types,
                    primaryType: typedData.primaryType,
                    message: typedData.message,
                });
                return typedDataSignature as T;
            }

            case "eth_sendRawTransaction": {
                // Forward raw transaction to Anvil
                return sendJsonRpc<T>(method, params);
            }

            default:
                throw new Error(`Unsupported write method: ${method}`);
        }
    }

    /**
     * Handle wallet/account methods
     */
    async function handleWalletMethod<T>(method: string, params?: unknown[]): Promise<T> {
        log("Handling wallet method:", method, params);

        switch (method) {
            case "eth_accounts":
                return state.accounts as T;

            case "eth_chainId":
                return `0x${state.chainId.toString(16)}` as T;

            case "net_version":
                return state.chainId.toString() as T;

            case "eth_requestAccounts": {
                if (!state.isConnected) {
                    state.isConnected = true;
                    emit("connect", { chainId: `0x${state.chainId.toString(16)}` as Hex });
                }
                return state.accounts as T;
            }

            case "wallet_switchEthereumChain": {
                const [{ chainId }] = params as [{ chainId: Hex }];
                const newChainId = parseInt(chainId, 16);
                state.chainId = newChainId;
                emit("chainChanged", chainId);
                return null as T;
            }

            case "wallet_addEthereumChain": {
                // In E2E testing, we just accept the chain addition
                return null as T;
            }

            case "wallet_requestPermissions":
            case "wallet_getPermissions": {
                // Return mock permissions
                return [{ parentCapability: "eth_accounts" }] as T;
            }

            default:
                throw new Error(`Unsupported wallet method: ${method}`);
        }
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
        log("Request:", method, params);

        // Route to appropriate handler based on method type
        // Wallet methods first (they handle local state like chainId, accounts)
        if (isWalletMethod(method)) {
            return handleWalletMethod<T>(method, params);
        }

        // Write/signing methods
        if (isWriteMethod(method)) {
            return handleWriteMethod<T>(method, params);
        }

        // Read methods go to RPC
        if (isReadMethod(method)) {
            return handleReadMethod<T>(method, params);
        }

        // Fallback: try as read method (for any unknown methods)
        log("Unknown method, forwarding to RPC:", method);
        return sendJsonRpc<T>(method, params);
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

    return {
        request,
        on,
        removeListener,
        emit,
    };
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
