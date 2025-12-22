// viem-first helpers and connector builder
export { createE2EClient } from "./client.js";
export { createE2EConnectorBuilder } from "./connector.js";
export type { E2EConnectorParameters } from "./connector.js";
export type {
    ConnectorEmitter,
    ConnectorConfig,
    ConnectorInstance,
    CreateConnectorFn,
} from "./types.js";

// Adapters
export { e2eConnector } from "./connectors/wagmi.js";

// Provider utilities for test control
export { createE2EProvider, setAccounts, setChain, disconnect } from "./provider.js";

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
