import type { Account, Address, Chain, Hex } from "viem";

/**
 * Compatible chain type to work with viem and wagmi providers
 */
export type CompatibleChain = {
    id: number;
    name?: string;
    nativeCurrency: Chain["nativeCurrency"];
    rpcUrls: Chain["rpcUrls"];
} & Record<string, unknown>;

/**
 * Configuration options for the E2E Provider
 *
 * This provider implements a "Man-in-the-Middle" pattern:
 * - Read operations (eth_call, eth_getBalance) → forwarded to Anvil RPC
 * - Write operations (eth_sendTransaction, eth_sign) → handled locally with signing logic
 */
export type E2EProviderConfig = {
    /** Supported chains. First chain is the default. (default: [mainnet]) */
    chains?: readonly CompatibleChain[];
    /**
     * Per-chain RPC URLs mapping chainId to URL.
     * When switching chains, the provider uses the corresponding RPC URL.
     * If a chain is not in the map, falls back to DEFAULT_ANVIL_RPC_URL.
     * @example { 1: 'http://mainnet:8545', 42161: 'http://arbitrum:8546' }
     */
    rpcUrls?: Record<number, string>;
    /**
     * Account for signing transactions. Can be:
     * - A private key hex string (default: Anvil's first test account)
     * - A viem Account object (for impersonation or custom accounts)
     */
    account?: Hex | Account;
    /** Enable debug logging (default: false) */
    debug?: boolean;
};

/**
 * JSON-RPC request structure
 */
export type JsonRpcRequest = {
    jsonrpc: "2.0";
    method: string;
    params?: unknown[];
    id: number;
};

/**
 * JSON-RPC response structure
 */
export type JsonRpcResponse<T = unknown> = {
    jsonrpc: "2.0";
    id: number;
    result?: T;
    error?: JsonRpcError;
};

/**
 * JSON-RPC error structure
 */
export type JsonRpcError = {
    code: number;
    message: string;
    data?: unknown;
};

/**
 * EIP-1193 Provider events
 */
export type ProviderEvents = {
    accountsChanged: (accounts: Address[]) => void;
    chainChanged: (chainId: Hex) => void;
    connect: (info: { chainId: Hex }) => void;
    disconnect: (error: { code: number; message: string }) => void;
    message: (message: { type: string; data: unknown }) => void;
};

/**
 * Simple EIP-1193 request function type for E2E testing
 */
export type E2ERequestFn = <T = unknown>(args: {
    method: string;
    params?: unknown[];
}) => Promise<T>;

/**
 * EIP-1193 compatible provider interface for E2E testing
 */
export type E2EProvider = {
    request: E2ERequestFn;
    on: <K extends keyof ProviderEvents>(event: K, listener: ProviderEvents[K]) => void;
    removeListener: <K extends keyof ProviderEvents>(event: K, listener: ProviderEvents[K]) => void;
    emit: <K extends keyof ProviderEvents>(
        event: K,
        ...args: Parameters<ProviderEvents[K]>
    ) => void;
};

/**
 * Internal provider state
 */
export type ProviderState = {
    accounts: Address[];
    chainId: number;
    isConnected: boolean;
    supportedChainIds: number[];
};

/**
 * Transaction request parameters for eth_sendTransaction
 */
export type TransactionRequest = {
    from?: Address;
    to?: Address;
    gas?: Hex;
    gasPrice?: Hex;
    maxFeePerGas?: Hex;
    maxPriorityFeePerGas?: Hex;
    value?: Hex;
    data?: Hex;
    nonce?: Hex;
};

/**
 * Typed data domain for EIP-712 signing
 */
export type TypedDataDomain = {
    name?: string;
    version?: string;
    chainId?: number;
    verifyingContract?: Address;
    salt?: Hex;
};

/**
 * Typed data structure for EIP-712 signing
 */
export type TypedData = {
    domain: TypedDataDomain;
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
};

/**
 * Addresses with optional capabilities
 */
export type AddressesWithCapabilities<withCapabilities extends boolean = false> =
    withCapabilities extends true
        ? readonly { address: `0x${string}`; capabilities: Record<string, unknown> }[]
        : readonly `0x${string}`[];
