// Main connector export
export { e2eConnector } from "./connector.js";
export type { E2EConnectorParameters } from "./connector.js";

// Provider class
export { WalletlessProvider } from "./provider.js";

// Provider utilities for test control
export { createE2EProvider, disconnect, setAccounts, setChain } from "./helpers.js";

// Type exports
export type {
    E2EProvider,
    E2EProviderConfig,
    JsonRpcError,
    JsonRpcRequest,
    JsonRpcResponse,
    ProviderEvents,
    ProviderState,
    TransactionRequest,
    TypedData,
    TypedDataDomain,
} from "./types.js";

// Constants and utilities
export {
    DEFAULT_ANVIL_PRIVATE_KEY,
    DEFAULT_ANVIL_RPC_URL,
    DEFAULT_CHAIN,
    isReadMethod,
    isWalletMethod,
    isWriteMethod,
    READ_METHODS,
    WALLET_METHODS,
    WRITE_METHODS,
} from "./constants.js";
export type { ReadMethod, WalletMethod, WriteMethod } from "./constants.js";
