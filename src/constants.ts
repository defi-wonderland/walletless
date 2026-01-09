import type { Address, Hex } from "viem";
import { mainnet } from "viem/chains";

/** Anvil's default RPC URL */
export const DEFAULT_ANVIL_RPC_URL = "http://127.0.0.1:8545";

/** Anvil account with address and private key */
export type AnvilAccount = {
    address: Address;
    privateKey: Hex;
};

/**
 * All 10 default Anvil test accounts.
 * These are deterministically generated from the default Anvil mnemonic:
 * "test test test test test test test test test test test junk"
 */
export const ANVIL_ACCOUNTS: readonly AnvilAccount[] = [
    {
        address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    },
    {
        address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    },
    {
        address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
        privateKey: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
    },
    {
        address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
        privateKey: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
    },
    {
        address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
        privateKey: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
    },
    {
        address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
        privateKey: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
    },
    {
        address: "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
        privateKey: "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
    },
    {
        address: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
        privateKey: "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
    },
    {
        address: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
        privateKey: "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97",
    },
    {
        address: "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720",
        privateKey: "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6",
    },
];

/** Convenience: just the addresses */
export const ANVIL_ADDRESSES: readonly Address[] = ANVIL_ACCOUNTS.map((a) => a.address);

/** Convenience: just the private keys */
export const ANVIL_PRIVATE_KEYS: readonly Hex[] = ANVIL_ACCOUNTS.map((a) => a.privateKey);

/** Valid Anvil account indices (0-9) */
export type AnvilAccountIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** Anvil's first default test private key (account 0) */
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
