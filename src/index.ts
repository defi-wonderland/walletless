// Main connector export
export { e2eConnector } from "./connector.js";
export type { E2EConnectorParameters } from "./connector.js";

// Provider utilities for test control
export { createE2EProvider, setAccounts, setChain, disconnect } from "./provider.js";

// Type exports
export type {
    E2EProvider,
    E2EProviderConfig,
    InterceptedRequest,
    InterceptorResponse,
    JsonRpcError,
    JsonRpcRequest,
    JsonRpcResponse,
    ProviderEvents,
    ProviderState,
} from "./types.js";

// Constants and utilities
export { isReadMethod, isWalletMethod, READ_METHODS, WALLET_METHODS } from "./constants.js";
export type { ReadMethod, WalletMethod } from "./constants.js";
