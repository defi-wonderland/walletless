// Main connector export
export { e2eConnector } from "./connector.js";
export type {
    E2EConnectorConfigParams,
    E2EConnectorParameters,
    E2EConnectorProviderParams,
} from "./connector.js";

// Provider utilities for test control
export {
    createE2EProvider,
    setChain,
    disconnect,
    setSigningAccount,
    setRejectSignature,
    setRejectTransaction,
} from "./provider.js";
export type { E2EProviderWithInternal, SigningAccountInput } from "./provider.js";
export { ProviderErrorCode, ProviderRpcError } from "./types.js";

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
    ANVIL_ACCOUNTS,
    ANVIL_ADDRESSES,
    ANVIL_PRIVATE_KEYS,
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
export type {
    AnvilAccount,
    AnvilAccountIndex,
    ReadMethod,
    WalletMethod,
    WriteMethod,
} from "./constants.js";
