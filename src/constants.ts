import type { Hex } from "viem";
import { mainnet } from "viem/chains";

/** Anvil's default RPC URL */
export const DEFAULT_ANVIL_RPC_URL = "http://127.0.0.1:8545";

/** Anvil's first default test private key */
export const DEFAULT_ANVIL_PRIVATE_KEY: Hex =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

/** Default chain configuration */
export const DEFAULT_CHAIN = mainnet;

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
 * RPC methods that handle wallet state (accounts, chain, permissions)
 * These are handled locally by the provider
 */
export const WALLET_METHODS = [
    "eth_accounts",
    "eth_chainId",
    "net_version",
    "eth_requestAccounts",
    "wallet_switchEthereumChain",
    "wallet_addEthereumChain",
    "wallet_requestPermissions",
    "wallet_getPermissions",
    "wallet_revokePermissions",
    "wallet_watchAsset",
    "wallet_scanQRCode",
    "wallet_registerOnboarding",
] as const;

/**
 * RPC methods that require signing or write operations
 * These are handled locally with the wallet client
 */
export const WRITE_METHODS = [
    "eth_sendTransaction",
    "eth_sendRawTransaction",
    "eth_signTransaction",
    "eth_sign",
    "personal_sign",
    "eth_signTypedData",
    "eth_signTypedData_v3",
    "eth_signTypedData_v4",
] as const;

export type ReadMethod = (typeof READ_METHODS)[number];
export type WalletMethod = (typeof WALLET_METHODS)[number];
export type WriteMethod = (typeof WRITE_METHODS)[number];

/**
 * Check if a method is a read-only blockchain method
 */
export function isReadMethod(method: string): method is ReadMethod {
    return READ_METHODS.includes(method as ReadMethod);
}

/**
 * Check if a method is a wallet state method
 */
export function isWalletMethod(method: string): method is WalletMethod {
    return WALLET_METHODS.includes(method as WalletMethod);
}

/**
 * Check if a method is a write/signing operation
 */
export function isWriteMethod(method: string): method is WriteMethod {
    return WRITE_METHODS.includes(method as WriteMethod);
}
