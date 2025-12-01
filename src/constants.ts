/**
 * RPC methods that read data from the blockchain
 * These can be safely redirected to a public/custom RPC URL
 */
export const READ_METHODS = [
    // Block methods
    "eth_blockNumber",
    "eth_getBlockByHash",
    "eth_getBlockByNumber",
    "eth_getBlockTransactionCountByHash",
    "eth_getBlockTransactionCountByNumber",
    "eth_getUncleByBlockHashAndIndex",
    "eth_getUncleByBlockNumberAndIndex",
    "eth_getUncleCountByBlockHash",
    "eth_getUncleCountByBlockNumber",

    // Transaction methods (read-only)
    "eth_getTransactionByHash",
    "eth_getTransactionByBlockHashAndIndex",
    "eth_getTransactionByBlockNumberAndIndex",
    "eth_getTransactionReceipt",
    "eth_getTransactionCount",

    // Account/State methods
    "eth_getBalance",
    "eth_getCode",
    "eth_getStorageAt",
    "eth_call",

    // Filter methods
    "eth_newFilter",
    "eth_newBlockFilter",
    "eth_newPendingTransactionFilter",
    "eth_uninstallFilter",
    "eth_getFilterChanges",
    "eth_getFilterLogs",
    "eth_getLogs",

    // Gas methods
    "eth_gasPrice",
    "eth_estimateGas",
    "eth_feeHistory",
    "eth_maxPriorityFeePerGas",

    // Chain methods
    "eth_chainId",
    "net_version",
    "net_listening",
    "net_peerCount",
    "web3_clientVersion",

    // Misc
    "eth_syncing",
    "eth_protocolVersion",
] as const;

/**
 * RPC methods that require wallet interaction
 * These should be sent to the interceptor URL for e2e tests
 */
export const WALLET_METHODS = [
    // Account methods
    "eth_requestAccounts",
    "eth_accounts",
    "wallet_requestPermissions",
    "wallet_getPermissions",
    "wallet_revokePermissions",

    // Signing methods
    "eth_sign",
    "eth_signTypedData",
    "eth_signTypedData_v3",
    "eth_signTypedData_v4",
    "personal_sign",

    // Transaction methods
    "eth_sendTransaction",
    "eth_sendRawTransaction",

    // Chain/Network methods
    "wallet_switchEthereumChain",
    "wallet_addEthereumChain",

    // Asset methods
    "wallet_watchAsset",

    // Misc wallet methods
    "wallet_scanQRCode",
    "wallet_registerOnboarding",
] as const;

export type ReadMethod = (typeof READ_METHODS)[number];
export type WalletMethod = (typeof WALLET_METHODS)[number];

/**
 * Check if a method is a read-only blockchain method
 */
export function isReadMethod(method: string): method is ReadMethod {
    return READ_METHODS.includes(method as ReadMethod);
}

/**
 * Check if a method is a wallet interaction method
 */
export function isWalletMethod(method: string): method is WalletMethod {
    return WALLET_METHODS.includes(method as WalletMethod);
}
