import type { Address, Hex } from "viem";

import type {
    E2EProvider,
    E2EProviderConfig,
    InterceptedRequest,
    InterceptorResponse,
    JsonRpcRequest,
    JsonRpcResponse,
    ProviderEvents,
    ProviderState,
} from "./types.js";
import { isReadMethod } from "./constants.js";

type EventListeners = {
    [K in keyof ProviderEvents]: Set<ProviderEvents[K]>;
};

/**
 * Creates an EIP-1193 compatible provider that intercepts wallet requests
 * and redirects read operations to a specified RPC URL.
 *
 * This provider enables E2E testing by:
 * - Forwarding wallet operations (signing, transactions) to an interceptor URL
 * - Routing read-only operations (eth_call, eth_getBalance) to an RPC endpoint
 * - Maintaining local state for accounts and chain ID
 *
 * @example
 * ```ts
 * const provider = createE2EProvider({
 *   interceptorUrl: 'http://localhost:3001/intercept',
 *   rpcUrl: 'http://localhost:8545',
 *   chain: mainnet,
 *   mockAddress: '0x1234...',
 *   debug: true,
 * });
 *
 * // Use with wagmi or directly
 * const accounts = await provider.request({ method: 'eth_requestAccounts' });
 * ```
 */
export function createE2EProvider(config: E2EProviderConfig): E2EProvider {
    const { interceptorUrl, rpcUrl, chain, mockAddress, debug = false } = config;

    let requestId = 0;

    const state: ProviderState = {
        accounts: mockAddress ? [mockAddress] : [],
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
     * Send a JSON-RPC request to a URL
     */
    async function sendJsonRpc<T>(url: string, method: string, params?: unknown[]): Promise<T> {
        const id = ++requestId;
        const request: JsonRpcRequest = {
            jsonrpc: "2.0",
            method,
            params,
            id,
        };

        log("Sending RPC request to", url, request);

        const response = await fetch(url, {
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
     * Send a request to the interceptor URL for e2e test handling
     */
    async function sendToInterceptor<T>(method: string, params?: unknown[]): Promise<T> {
        const id = ++requestId;
        const payload: InterceptedRequest = {
            id,
            method,
            params,
            timestamp: Date.now(),
            chainId: state.chainId,
        };

        log("Sending to interceptor", payload);

        const response = await fetch(interceptorUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        const data: InterceptorResponse<T> = (await response.json()) as InterceptorResponse<T>;

        if (!data.success || data.error) {
            const error = new Error(data.error?.message || "Interceptor request failed");
            // @ts-expect-error - Adding code property to error
            error.code = data.error?.code || 4001;
            throw error;
        }

        return data.result as T;
    }

    /**
     * Handle read methods by sending to RPC URL
     */
    async function handleReadMethod<T>(method: string, params?: unknown[]): Promise<T> {
        const url = rpcUrl || chain.rpcUrls.default.http[0];

        if (!url) {
            throw new Error("No RPC URL configured for read methods");
        }

        return sendJsonRpc<T>(url, method, params);
    }

    /**
     * Handle wallet methods locally or via interceptor
     */
    async function handleWalletMethod<T>(method: string, params?: unknown[]): Promise<T> {
        log("Handling wallet method", method, params);

        switch (method) {
            case "eth_accounts":
                return state.accounts as T;

            case "eth_chainId":
                return `0x${state.chainId.toString(16)}` as T;

            case "net_version":
                return state.chainId.toString() as T;

            case "eth_requestAccounts": {
                if (state.accounts.length > 0) {
                    if (!state.isConnected) {
                        state.isConnected = true;
                        emit("connect", { chainId: `0x${state.chainId.toString(16)}` as Hex });
                    }
                    return state.accounts as T;
                }
                // Request accounts from interceptor
                const accounts = await sendToInterceptor<Address[]>(method, params);
                state.accounts = accounts;
                state.isConnected = true;
                emit("connect", { chainId: `0x${state.chainId.toString(16)}` as Hex });
                emit("accountsChanged", accounts);
                return accounts as T;
            }

            case "wallet_switchEthereumChain": {
                const [{ chainId }] = params as [{ chainId: Hex }];
                const newChainId = parseInt(chainId, 16);

                // Notify interceptor about chain switch
                await sendToInterceptor(method, params);

                state.chainId = newChainId;
                emit("chainChanged", chainId);
                return null as T;
            }

            // Forward all other wallet methods to interceptor
            default:
                return sendToInterceptor<T>(method, params);
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

        // Route to appropriate handler
        if (isReadMethod(method)) {
            return handleReadMethod<T>(method, params);
        }

        return handleWalletMethod<T>(method, params);
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
