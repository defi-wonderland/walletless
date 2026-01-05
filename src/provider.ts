import type { Account, Chain, Hex, HttpTransport, WalletClient } from "viem";
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
 * EIP-1193 compatible provider for E2E testing.
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
export class WalletlessProvider implements E2EProvider {
    private readonly rpcUrl: string;
    private readonly chain: Chain;
    private readonly account: PrivateKeyAccount | Account;
    private readonly walletClient: WalletClient<HttpTransport, Chain, PrivateKeyAccount | Account>;
    private readonly debug: boolean;
    private readonly state: ProviderState;
    private readonly listeners: EventListeners;
    private requestId = 0;

    constructor(config: E2EProviderConfig = {}) {
        const {
            rpcUrl = DEFAULT_ANVIL_RPC_URL,
            chain = DEFAULT_CHAIN,
            account: accountConfig = DEFAULT_ANVIL_PRIVATE_KEY,
            debug = false,
        } = config;

        this.rpcUrl = rpcUrl;
        this.chain = chain;
        this.debug = debug;

        // Create account from private key or use provided account
        this.account =
            typeof accountConfig === "string"
                ? privateKeyToAccount(accountConfig as Hex)
                : accountConfig;

        // Create wallet client for signing operations with explicit account
        this.walletClient = createWalletClient({
            account: this.account,
            chain,
            transport: http(rpcUrl),
        });

        this.state = {
            accounts: [this.account.address],
            chainId: chain.id,
            isConnected: false,
        };

        this.listeners = {
            accountsChanged: new Set(),
            chainChanged: new Set(),
            connect: new Set(),
            disconnect: new Set(),
            message: new Set(),
        };
    }

    private log(...args: unknown[]): void {
        if (this.debug) console.log("[Walletless-Provider]", ...args);
    }

    /**
     * Emit an event to all registered listeners
     */
    emit<K extends keyof ProviderEvents>(event: K, ...args: Parameters<ProviderEvents[K]>): void {
        this.listeners[event].forEach((listener) => {
            // @ts-expect-error - TypeScript can't properly infer the listener type here
            listener(...args);
        });
    }

    /**
     * Send a JSON-RPC request to Anvil
     */
    private async sendJsonRpc<T>(method: string, params?: unknown[]): Promise<T> {
        const id = ++this.requestId;
        const request: JsonRpcRequest = {
            jsonrpc: "2.0",
            method,
            params,
            id,
        };

        this.log("Sending RPC request:", method, params);

        const response = await fetch(this.rpcUrl, {
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
    private async handleReadMethod<T>(method: string, params?: unknown[]): Promise<T> {
        return this.sendJsonRpc<T>(method, params);
    }

    /**
     * Handle write operations with local signing
     */
    private async handleWriteMethod<T>(method: string, params?: unknown[]): Promise<T> {
        this.log("Handling write method:", method, params);

        switch (method) {
            case "eth_sendTransaction": {
                const txParams = params?.[0] as TransactionRequest;

                // Build transaction request with proper typing
                const txRequest = {
                    chain: this.chain,
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

                const hash = await this.walletClient.sendTransaction(txRequest);
                return hash as T;
            }

            case "personal_sign": {
                // personal_sign params: [message, address]
                const message = params?.[0] as Hex;
                const signature = await this.walletClient.signMessage({
                    message: { raw: message },
                });
                return signature as T;
            }

            case "eth_sign": {
                // eth_sign params: [address, message]
                const ethSignMessage = params?.[1] as Hex;
                const ethSignature = await this.walletClient.signMessage({
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

                const typedDataSignature = await this.walletClient.signTypedData({
                    domain: typedData.domain,
                    types: typedData.types,
                    primaryType: typedData.primaryType,
                    message: typedData.message,
                });
                return typedDataSignature as T;
            }

            case "eth_sendRawTransaction": {
                // Forward raw transaction to Anvil
                return this.sendJsonRpc<T>(method, params);
            }

            default:
                throw new Error(`Unsupported write method: ${method}`);
        }
    }

    /**
     * Handle wallet/account methods
     */
    private async handleWalletMethod<T>(method: string, params?: unknown[]): Promise<T> {
        this.log("Handling wallet method:", method, params);

        switch (method) {
            case "eth_accounts":
                return this.state.accounts as T;

            case "eth_chainId":
                return `0x${this.state.chainId.toString(16)}` as T;

            case "net_version":
                return this.state.chainId.toString() as T;

            case "eth_requestAccounts": {
                if (!this.state.isConnected) {
                    this.state.isConnected = true;
                    this.emit("connect", {
                        chainId: `0x${this.state.chainId.toString(16)}` as Hex,
                    });
                }
                return this.state.accounts as T;
            }

            case "wallet_switchEthereumChain": {
                const [{ chainId }] = params as [{ chainId: Hex }];
                const newChainId = parseInt(chainId, 16);
                this.state.chainId = newChainId;
                this.emit("chainChanged", chainId);
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
    async request<T>({ method, params }: { method: string; params?: unknown[] }): Promise<T> {
        this.log("Request:", method, params);

        // Route to appropriate handler based on method type
        // Wallet methods first (they handle local state like chainId, accounts)
        if (isWalletMethod(method)) {
            return this.handleWalletMethod<T>(method, params);
        }

        // Write/signing methods
        if (isWriteMethod(method)) {
            return this.handleWriteMethod<T>(method, params);
        }

        // Read methods go to RPC
        if (isReadMethod(method)) {
            return this.handleReadMethod<T>(method, params);
        }

        // Fallback: try as read method (for any unknown methods)
        this.log("Unknown method, forwarding to RPC:", method);
        return this.sendJsonRpc<T>(method, params);
    }

    /**
     * Subscribe to provider events
     */
    on<K extends keyof ProviderEvents>(event: K, listener: ProviderEvents[K]): void {
        this.listeners[event].add(listener);
    }

    /**
     * Unsubscribe from provider events
     */
    removeListener<K extends keyof ProviderEvents>(event: K, listener: ProviderEvents[K]): void {
        this.listeners[event].delete(listener);
    }
}
