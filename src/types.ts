import type { Address, Chain, Hex } from "viem";

/**
 * Configuration options for the E2E Provider
 */
export type E2EProviderConfig = {
    /** URL where wallet requests will be forwarded for e2e test interception */
    interceptorUrl: string;
    /** RPC URL for blockchain read operations (e.g., eth_call, eth_getBalance) */
    rpcUrl?: string;
    /** Chain configuration */
    chain: Chain;
    /** Initial account address for the mock wallet */
    mockAddress?: Address;
    /** Enable debug logging */
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
 * Wallet request payload sent to the interceptor URL
 */
export type InterceptedRequest = {
    id: number;
    method: string;
    params?: unknown[];
    timestamp: number;
    chainId: number;
};

/**
 * Response from the interceptor URL
 */
export type InterceptorResponse<T = unknown> = {
    success: boolean;
    result?: T;
    error?: JsonRpcError;
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
};
