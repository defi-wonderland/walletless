import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum, mainnet, optimism } from "viem/chains";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ANVIL_ACCOUNTS } from "../src/constants.js";
import {
    createE2EProvider,
    disconnect,
    setChain,
    setRejectSignature,
    setRejectTransaction,
    setSigningAccount,
} from "../src/provider.js";
import { E2EProviderConfig, ProviderErrorCode, ProviderRpcError } from "../src/types.js";

// Anvil's first test private key
const TEST_PRIVATE_KEY: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TEST_ADDRESS: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const baseConfig: E2EProviderConfig = {
    chains: [mainnet],
    rpcUrls: { 1: "http://localhost:8545" },
    account: TEST_PRIVATE_KEY,
    debug: false,
};

describe("createE2EProvider", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("initialization", () => {
        it("should create a provider with the given config", () => {
            const provider = createE2EProvider(baseConfig);

            expect(provider).toBeDefined();
            expect(provider.request).toBeDefined();
            expect(provider.on).toBeDefined();
            expect(provider.removeListener).toBeDefined();
            expect(provider.emit).toBeDefined();
        });

        it("should initialize with account address derived from private key", async () => {
            const provider = createE2EProvider(baseConfig);

            const accounts = await provider.request<Address[]>({ method: "eth_accounts" });

            expect(accounts).toEqual([TEST_ADDRESS]);
        });

        it("should initialize with chains array when provided", () => {
            const provider = createE2EProvider({
                ...baseConfig,
                chains: [mainnet, arbitrum, optimism],
            });

            expect(provider.__internal.chains).toHaveLength(3);
            expect(provider.__internal.chains.map((c) => c.id)).toEqual([1, 42161, 10]);
        });

        it("should use first chain in array as default", async () => {
            const provider = createE2EProvider({
                ...baseConfig,
                chains: [arbitrum, optimism, mainnet],
            });

            const chainId = await provider.request<string>({ method: "eth_chainId" });
            expect(chainId).toBe("0xa4b1"); // Arbitrum (first in array)
            expect(provider.__internal.currentChain.id).toBe(42161);
        });

        it("should default to mainnet when chains array is empty or not provided", async () => {
            const provider = createE2EProvider({
                rpcUrls: { 1: "http://localhost:8545" },
                account: TEST_PRIVATE_KEY,
                // No chains provided
            });

            const chainId = await provider.request<string>({ method: "eth_chainId" });
            expect(chainId).toBe("0x1"); // mainnet (default)
        });
    });

    describe("eth_chainId", () => {
        it("should return the chain ID in hex format", async () => {
            const provider = createE2EProvider(baseConfig);

            const chainId = await provider.request<string>({ method: "eth_chainId" });

            expect(chainId).toBe("0x1");
        });
    });

    describe("net_version", () => {
        it("should return the chain ID as a string", async () => {
            const provider = createE2EProvider(baseConfig);

            const version = await provider.request<string>({ method: "net_version" });

            expect(version).toBe("1");
        });
    });

    describe("eth_requestAccounts", () => {
        it("should return account addresses", async () => {
            const provider = createE2EProvider(baseConfig);

            const accounts = await provider.request<Address[]>({ method: "eth_requestAccounts" });

            expect(accounts).toEqual([TEST_ADDRESS]);
        });

        it("should emit connect event on first request", async () => {
            const provider = createE2EProvider(baseConfig);
            const connectHandler = vi.fn();

            provider.on("connect", connectHandler);
            await provider.request<Address[]>({ method: "eth_requestAccounts" });

            expect(connectHandler).toHaveBeenCalledWith({ chainId: "0x1" });
        });

        it("should not emit connect event on subsequent requests", async () => {
            const provider = createE2EProvider(baseConfig);
            const connectHandler = vi.fn();

            provider.on("connect", connectHandler);
            await provider.request<Address[]>({ method: "eth_requestAccounts" });
            await provider.request<Address[]>({ method: "eth_requestAccounts" });

            expect(connectHandler).toHaveBeenCalledTimes(1);
        });
    });

    describe("wallet_switchEthereumChain", () => {
        it("should update chain ID and emit chainChanged event when chain is supported", async () => {
            const provider = createE2EProvider({
                ...baseConfig,
                chains: [mainnet, arbitrum],
            });
            const chainChangedHandler = vi.fn();

            provider.on("chainChanged", chainChangedHandler);
            await provider.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: "0xa4b1" }], // Arbitrum
            });

            expect(chainChangedHandler).toHaveBeenCalledWith("0xa4b1");

            // Verify the chain ID was updated
            const chainId = await provider.request<string>({ method: "eth_chainId" });
            expect(chainId).toBe("0xa4b1");
        });

        it("should throw error when switching to unsupported chain", async () => {
            const provider = createE2EProvider({
                ...baseConfig,
                chains: [mainnet], // Only mainnet supported
            });

            await expect(
                provider.request({
                    method: "wallet_switchEthereumChain",
                    params: [{ chainId: "0xa4b1" }], // Arbitrum - not supported
                }),
            ).rejects.toThrow("Chain 42161 is not supported");
        });

        it("should update internal wallet client when switching chains", async () => {
            const provider = createE2EProvider({
                ...baseConfig,
                chains: [mainnet, arbitrum],
            });

            // Verify initial chain
            expect(provider.__internal.currentChain.id).toBe(1);

            // Switch to Arbitrum
            await provider.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: "0xa4b1" }],
            });

            // Verify internal state was updated
            expect(provider.__internal.currentChain.id).toBe(42161);
            expect(provider.__internal.currentChain.name).toBe("Arbitrum One");
        });
    });

    describe("event handling", () => {
        it("should add and call event listeners", () => {
            const provider = createE2EProvider(baseConfig);
            const handler = vi.fn();

            provider.on("accountsChanged", handler);
            provider.emit("accountsChanged", [TEST_ADDRESS]);

            expect(handler).toHaveBeenCalledWith([TEST_ADDRESS]);
        });

        it("should remove event listeners", () => {
            const provider = createE2EProvider(baseConfig);
            const handler = vi.fn();

            provider.on("accountsChanged", handler);
            provider.removeListener("accountsChanged", handler);
            provider.emit("accountsChanged", [TEST_ADDRESS]);

            expect(handler).not.toHaveBeenCalled();
        });

        it("should support multiple listeners for the same event", () => {
            const provider = createE2EProvider(baseConfig);
            const handler1 = vi.fn();
            const handler2 = vi.fn();

            provider.on("chainChanged", handler1);
            provider.on("chainChanged", handler2);
            provider.emit("chainChanged", "0x1");

            expect(handler1).toHaveBeenCalledWith("0x1");
            expect(handler2).toHaveBeenCalledWith("0x1");
        });
    });

    describe("read methods routing", () => {
        it("should route eth_getBalance to RPC URL", async () => {
            const mockFetch = vi.spyOn(global, "fetch").mockResolvedValueOnce({
                json: vi.fn().mockResolvedValueOnce({
                    jsonrpc: "2.0",
                    id: 1,
                    result: "0x100",
                }),
            } as unknown as Response);

            const provider = createE2EProvider(baseConfig);
            const balance = await provider.request<string>({
                method: "eth_getBalance",
                params: [TEST_ADDRESS, "latest"],
            });

            expect(balance).toBe("0x100");
            expect(mockFetch).toHaveBeenCalledWith(
                "http://localhost:8545",
                expect.objectContaining({
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                }),
            );
        });

        it("should route eth_call to RPC URL", async () => {
            const mockFetch = vi.spyOn(global, "fetch").mockResolvedValueOnce({
                json: vi.fn().mockResolvedValueOnce({
                    jsonrpc: "2.0",
                    id: 1,
                    result: "0xabcdef",
                }),
            } as unknown as Response);

            const provider = createE2EProvider(baseConfig);
            const result = await provider.request<string>({
                method: "eth_call",
                params: [{ to: TEST_ADDRESS, data: "0x" }, "latest"],
            });

            expect(result).toBe("0xabcdef");
            expect(mockFetch).toHaveBeenCalled();
        });
    });

    describe("error handling", () => {
        it("should throw on RPC error", async () => {
            vi.spyOn(global, "fetch").mockResolvedValueOnce({
                json: vi.fn().mockResolvedValueOnce({
                    jsonrpc: "2.0",
                    id: 1,
                    error: { code: -32600, message: "Invalid Request" },
                }),
            } as unknown as Response);

            const provider = createE2EProvider(baseConfig);

            await expect(
                provider.request({ method: "eth_getBalance", params: [TEST_ADDRESS, "latest"] }),
            ).rejects.toThrow("Invalid Request");
        });

        it("should throw on unsupported write method", async () => {
            const provider = createE2EProvider(baseConfig);

            await expect(
                provider.request({ method: "eth_signTransaction", params: [] }),
            ).rejects.toThrow("Unsupported");
        });
    });
});

describe("setChain", () => {
    describe("with multichain config", () => {
        it("should emit chainChanged event with hex chain ID", () => {
            const provider = createE2EProvider({
                ...baseConfig,
                chains: [mainnet, arbitrum, optimism],
            });
            const handler = vi.fn();

            provider.on("chainChanged", handler);
            setChain(provider, 42161); // Arbitrum

            expect(handler).toHaveBeenCalledWith("0xa4b1");
        });

        it("should update eth_chainId response after switching", async () => {
            const provider = createE2EProvider({
                ...baseConfig,
                chains: [mainnet, arbitrum],
            });

            // Initial chain
            const initialChainId = await provider.request<string>({ method: "eth_chainId" });
            expect(initialChainId).toBe("0x1");

            // Switch to Arbitrum
            setChain(provider, 42161);

            // Verify chain ID was updated
            const newChainId = await provider.request<string>({ method: "eth_chainId" });
            expect(newChainId).toBe("0xa4b1");
        });

        it("should update net_version response after switching", async () => {
            const provider = createE2EProvider({
                ...baseConfig,
                chains: [mainnet, arbitrum],
            });

            setChain(provider, 42161);

            const version = await provider.request<string>({ method: "net_version" });
            expect(version).toBe("42161");
        });

        it("should update internal wallet client with new chain", () => {
            const provider = createE2EProvider({
                ...baseConfig,
                chains: [mainnet, arbitrum, optimism],
            });

            // Initial chain
            expect(provider.__internal.currentChain.id).toBe(1);

            // Switch to Optimism
            setChain(provider, 10);

            // Verify internal state
            expect(provider.__internal.currentChain.id).toBe(10);
            expect(provider.__internal.currentChain.name).toBe("OP Mainnet");
        });

        it("should throw error for unsupported chain", () => {
            const provider = createE2EProvider({
                ...baseConfig,
                chains: [mainnet, arbitrum],
            });

            expect(() => setChain(provider, 137)).toThrow(
                "Chain 137 is not supported. Supported chains: 1, 42161",
            );
        });

        it("should allow switching back to initial chain", async () => {
            const provider = createE2EProvider({
                ...baseConfig,
                chains: [mainnet, arbitrum],
            });

            // Switch to Arbitrum
            setChain(provider, 42161);
            expect(await provider.request<string>({ method: "eth_chainId" })).toBe("0xa4b1");

            // Switch back to mainnet
            setChain(provider, 1);
            expect(await provider.request<string>({ method: "eth_chainId" })).toBe("0x1");
        });
    });

    describe("backward compatibility (single chain)", () => {
        it("should work with single chain config", async () => {
            const provider = createE2EProvider(baseConfig);

            // Initial chain should work
            const chainId = await provider.request<string>({ method: "eth_chainId" });
            expect(chainId).toBe("0x1");
        });

        it("should throw when trying to switch to different chain with single chain config", () => {
            const provider = createE2EProvider(baseConfig);

            expect(() => setChain(provider, 42161)).toThrow("Chain 42161 is not supported");
        });

        it("should allow switching to same chain with single chain config", () => {
            const provider = createE2EProvider(baseConfig);
            const handler = vi.fn();

            provider.on("chainChanged", handler);
            setChain(provider, 1); // Same as initial chain

            expect(handler).toHaveBeenCalledWith("0x1");
        });
    });

    describe("error cases", () => {
        it("should throw for provider without __internal", () => {
            const fakeProvider = {
                emit: vi.fn(),
                on: vi.fn(),
                removeListener: vi.fn(),
                request: vi.fn(),
            };

            expect(() => setChain(fakeProvider, 1)).toThrow("Provider does not support setChain");
        });
    });

    describe("supportedChainIds in state", () => {
        it("should expose supported chain IDs in internal state", () => {
            const provider = createE2EProvider({
                ...baseConfig,
                chains: [mainnet, arbitrum, optimism],
            });

            expect(provider.__internal.state.supportedChainIds).toEqual([1, 42161, 10]);
        });

        it("should have single chain in supportedChainIds with single chain config", () => {
            const provider = createE2EProvider(baseConfig);

            expect(provider.__internal.state.supportedChainIds).toEqual([1]);
        });
    });

    describe("multi-RPC URL support", () => {
        it("should use correct RPC URL for initial chain", () => {
            const provider = createE2EProvider({
                chains: [mainnet, arbitrum],
                rpcUrls: {
                    1: "http://mainnet-rpc:8545",
                    42161: "http://arbitrum-rpc:8546",
                },
                account: TEST_PRIVATE_KEY,
            });

            expect(provider.__internal.rpcUrl).toBe("http://mainnet-rpc:8545");
        });

        it("should update RPC URL when switching chains", () => {
            const provider = createE2EProvider({
                chains: [mainnet, arbitrum],
                rpcUrls: {
                    1: "http://mainnet-rpc:8545",
                    42161: "http://arbitrum-rpc:8546",
                },
                account: TEST_PRIVATE_KEY,
            });

            // Initial RPC URL
            expect(provider.__internal.rpcUrl).toBe("http://mainnet-rpc:8545");

            // Switch to Arbitrum
            setChain(provider, 42161);

            // RPC URL should now be arbitrum
            expect(provider.__internal.rpcUrl).toBe("http://arbitrum-rpc:8546");
        });

        it("should fall back to default Anvil URL for chains not in rpcUrls", () => {
            const provider = createE2EProvider({
                chains: [mainnet, arbitrum],
                rpcUrls: {
                    1: "http://mainnet-rpc:8545",
                    // arbitrum not specified
                },
                account: TEST_PRIVATE_KEY,
            });

            // Switch to Arbitrum (not in rpcUrls)
            setChain(provider, 42161);

            // Should fall back to default
            expect(provider.__internal.rpcUrl).toBe("http://127.0.0.1:8545");
        });

        it("should use default Anvil URL when rpcUrls not provided", () => {
            const provider = createE2EProvider({
                chains: [mainnet],
                account: TEST_PRIVATE_KEY,
            });

            expect(provider.__internal.rpcUrl).toBe("http://127.0.0.1:8545");
        });

        it("should switch RPC URL via wallet_switchEthereumChain", async () => {
            const provider = createE2EProvider({
                chains: [mainnet, arbitrum],
                rpcUrls: {
                    1: "http://mainnet-rpc:8545",
                    42161: "http://arbitrum-rpc:8546",
                },
                account: TEST_PRIVATE_KEY,
            });

            // Switch via RPC method
            await provider.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: "0xa4b1" }],
            });

            expect(provider.__internal.rpcUrl).toBe("http://arbitrum-rpc:8546");
        });
    });
});

describe("disconnect", () => {
    it("should emit disconnect event", () => {
        const provider = createE2EProvider(baseConfig);
        const handler = vi.fn();

        provider.on("disconnect", handler);
        disconnect(provider);

        expect(handler).toHaveBeenCalledWith({ code: 4900, message: "Disconnected" });
    });
});

describe("setSigningAccount", () => {
    describe("by index", () => {
        it("should switch to account by index (0)", () => {
            const provider = createE2EProvider(baseConfig);
            const handler = vi.fn();

            provider.on("accountsChanged", handler);
            setSigningAccount(provider, 0);

            expect(handler).toHaveBeenCalledWith([ANVIL_ACCOUNTS[0]!.address]);
        });

        it("should switch to account by index (5)", () => {
            const provider = createE2EProvider(baseConfig);
            const handler = vi.fn();

            provider.on("accountsChanged", handler);
            setSigningAccount(provider, 5);

            expect(handler).toHaveBeenCalledWith([ANVIL_ACCOUNTS[5]!.address]);
        });

        it("should throw for invalid index (negative)", () => {
            const provider = createE2EProvider(baseConfig);

            expect(() => setSigningAccount(provider, -1 as 0)).toThrow(
                "Invalid Anvil account index",
            );
        });

        it("should throw for invalid index (> 9)", () => {
            const provider = createE2EProvider(baseConfig);

            expect(() => setSigningAccount(provider, 10 as 0)).toThrow(
                "Invalid Anvil account index",
            );
        });

        it("should switch to account by index (9) - boundary", () => {
            const provider = createE2EProvider(baseConfig);
            const handler = vi.fn();

            provider.on("accountsChanged", handler);
            setSigningAccount(provider, 9);

            expect(handler).toHaveBeenCalledWith([ANVIL_ACCOUNTS[9]!.address]);
        });

        it("should throw for non-integer index", () => {
            const provider = createE2EProvider(baseConfig);

            expect(() => setSigningAccount(provider, 1.5 as 0)).toThrow(
                "Invalid Anvil account index",
            );
        });
    });

    describe("by address", () => {
        it("should switch to account by address (checksummed)", () => {
            const provider = createE2EProvider(baseConfig);
            const handler = vi.fn();

            provider.on("accountsChanged", handler);
            setSigningAccount(provider, ANVIL_ACCOUNTS[1]!.address);

            expect(handler).toHaveBeenCalledWith([ANVIL_ACCOUNTS[1]!.address]);
        });

        it("should switch to account by address (lowercase)", () => {
            const provider = createE2EProvider(baseConfig);
            const handler = vi.fn();

            provider.on("accountsChanged", handler);
            setSigningAccount(provider, ANVIL_ACCOUNTS[1]!.address.toLowerCase() as Address);

            expect(handler).toHaveBeenCalledWith([ANVIL_ACCOUNTS[1]!.address]);
        });

        it("should throw for unknown address", () => {
            const provider = createE2EProvider(baseConfig);

            expect(() =>
                setSigningAccount(
                    provider,
                    "0x1234567890123456789012345678901234567890" as Address,
                ),
            ).toThrow("is not a default Anvil account");
        });
    });

    describe("by private key", () => {
        it("should switch to account by private key", () => {
            const provider = createE2EProvider(baseConfig);
            const handler = vi.fn();

            provider.on("accountsChanged", handler);
            setSigningAccount(provider, ANVIL_ACCOUNTS[2]!.privateKey);

            expect(handler).toHaveBeenCalledWith([ANVIL_ACCOUNTS[2]!.address]);
        });

        it("should accept any valid private key (not just Anvil defaults)", () => {
            const provider = createE2EProvider(baseConfig);
            const handler = vi.fn();
            const customKey: Hex =
                "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
            const expectedAddress = privateKeyToAccount(customKey).address;

            provider.on("accountsChanged", handler);
            setSigningAccount(provider, customKey);

            expect(handler).toHaveBeenCalledWith([expectedAddress]);
        });
    });

    describe("by viem Account object", () => {
        it("should switch to account by viem Account object", () => {
            const provider = createE2EProvider(baseConfig);
            const handler = vi.fn();
            const viemAccount = privateKeyToAccount(ANVIL_ACCOUNTS[3]!.privateKey);

            provider.on("accountsChanged", handler);
            setSigningAccount(provider, viemAccount);

            expect(handler).toHaveBeenCalledWith([ANVIL_ACCOUNTS[3]!.address]);
        });

        it("should accept custom Account objects", () => {
            const provider = createE2EProvider(baseConfig);
            const handler = vi.fn();
            // Create a different account from the default to verify switching works
            const customAccount = privateKeyToAccount(ANVIL_ACCOUNTS[7]!.privateKey);

            provider.on("accountsChanged", handler);
            setSigningAccount(provider, customAccount);

            expect(handler).toHaveBeenCalledWith([customAccount.address]);
        });
    });

    describe("error cases", () => {
        it("should throw for invalid string length", () => {
            const provider = createE2EProvider(baseConfig);

            expect(() => setSigningAccount(provider, "0x123" as Hex)).toThrow("Invalid input");
        });

        it("should throw for provider without __internal", () => {
            const fakeProvider = {
                emit: vi.fn(),
                on: vi.fn(),
                removeListener: vi.fn(),
                request: vi.fn(),
            };

            expect(() => setSigningAccount(fakeProvider, 0)).toThrow(
                "Provider does not support setSigningAccount",
            );
        });
    });

    describe("provider state integration", () => {
        it("should update eth_accounts after switching", async () => {
            const provider = createE2EProvider(baseConfig);

            // Initial account
            const initialAccounts = await provider.request<Address[]>({ method: "eth_accounts" });
            expect(initialAccounts).toEqual([ANVIL_ACCOUNTS[0]!.address]);

            // Switch to account 3
            setSigningAccount(provider, 3);

            // Verify eth_accounts returns the new address
            const newAccounts = await provider.request<Address[]>({ method: "eth_accounts" });
            expect(newAccounts).toEqual([ANVIL_ACCOUNTS[3]!.address]);
        });

        it("should update eth_requestAccounts after switching", async () => {
            const provider = createE2EProvider(baseConfig);

            // Switch to account 5
            setSigningAccount(provider, 5);

            // Verify eth_requestAccounts returns the new address
            const accounts = await provider.request<Address[]>({
                method: "eth_requestAccounts",
            });
            expect(accounts).toEqual([ANVIL_ACCOUNTS[5]!.address]);
        });
    });
});

describe("setRejectSignature", () => {
    it("should reject personal_sign with 4001 error when enabled", async () => {
        const provider = createE2EProvider(baseConfig);

        setRejectSignature(provider, true);

        await expect(
            provider.request({
                method: "personal_sign",
                params: ["0x48656c6c6f", TEST_ADDRESS],
            }),
        ).rejects.toMatchObject({
            code: ProviderErrorCode.UserRejectedRequest,
            message: "User rejected the signature request.",
        });
    });

    it("should reject eth_sign with 4001 error when enabled", async () => {
        const provider = createE2EProvider(baseConfig);

        setRejectSignature(provider, true);

        await expect(
            provider.request({
                method: "eth_sign",
                params: [TEST_ADDRESS, "0x48656c6c6f"],
            }),
        ).rejects.toMatchObject({
            code: ProviderErrorCode.UserRejectedRequest,
            message: "User rejected the signature request.",
        });
    });

    it("should reject eth_signTypedData_v4 with 4001 error when enabled", async () => {
        const provider = createE2EProvider(baseConfig);

        setRejectSignature(provider, true);

        const typedData = {
            domain: { name: "Test", version: "1", chainId: 1 },
            types: { Person: [{ name: "name", type: "string" }] },
            primaryType: "Person",
            message: { name: "Alice" },
        };

        await expect(
            provider.request({
                method: "eth_signTypedData_v4",
                params: [TEST_ADDRESS, JSON.stringify(typedData)],
            }),
        ).rejects.toMatchObject({
            code: ProviderErrorCode.UserRejectedRequest,
            message: "User rejected the signature request.",
        });
    });

    it("should allow signing when disabled", async () => {
        const provider = createE2EProvider(baseConfig);

        setRejectSignature(provider, true);
        setRejectSignature(provider, false);

        // Should work - personal_sign returns a signature
        const signature = await provider.request<Hex>({
            method: "personal_sign",
            params: ["0x48656c6c6f", TEST_ADDRESS],
        });
        expect(signature).toMatch(/^0x[a-f0-9]+$/i);
    });

    it("should throw for provider without __internal", () => {
        const fakeProvider = {
            emit: vi.fn(),
            on: vi.fn(),
            removeListener: vi.fn(),
            request: vi.fn(),
        };

        expect(() => setRejectSignature(fakeProvider, true)).toThrow(
            "Provider does not support setRejectSignature",
        );
    });

    it("should update internal state", () => {
        const provider = createE2EProvider(baseConfig);

        expect(provider.__internal.rejectSignature).toBe(false);

        setRejectSignature(provider, true);
        expect(provider.__internal.rejectSignature).toBe(true);

        setRejectSignature(provider, false);
        expect(provider.__internal.rejectSignature).toBe(false);
    });
});

describe("setRejectTransaction", () => {
    it("should reject eth_sendTransaction with 4001 error when enabled", async () => {
        const provider = createE2EProvider(baseConfig);

        setRejectTransaction(provider, true);

        await expect(
            provider.request({
                method: "eth_sendTransaction",
                params: [{ from: TEST_ADDRESS, to: TEST_ADDRESS, value: "0x1" }],
            }),
        ).rejects.toMatchObject({
            code: ProviderErrorCode.UserRejectedRequest,
            message: "User rejected the transaction request.",
        });
    });

    it("should allow transactions when disabled (verifies rejection is lifted)", () => {
        const provider = createE2EProvider(baseConfig);

        // Enable then disable rejection
        setRejectTransaction(provider, true);
        setRejectTransaction(provider, false);

        // Verify the internal state is correctly toggled
        expect(provider.__internal.rejectTransaction).toBe(false);
    });

    it("should throw for provider without __internal", () => {
        const fakeProvider = {
            emit: vi.fn(),
            on: vi.fn(),
            removeListener: vi.fn(),
            request: vi.fn(),
        };

        expect(() => setRejectTransaction(fakeProvider, true)).toThrow(
            "Provider does not support setRejectTransaction",
        );
    });

    it("should update internal state", () => {
        const provider = createE2EProvider(baseConfig);

        expect(provider.__internal.rejectTransaction).toBe(false);

        setRejectTransaction(provider, true);
        expect(provider.__internal.rejectTransaction).toBe(true);

        setRejectTransaction(provider, false);
        expect(provider.__internal.rejectTransaction).toBe(false);
    });

    it("should not affect signature methods", async () => {
        const provider = createE2EProvider(baseConfig);

        setRejectTransaction(provider, true);

        // Signing should still work
        const signature = await provider.request<Hex>({
            method: "personal_sign",
            params: ["0x48656c6c6f", TEST_ADDRESS],
        });
        expect(signature).toMatch(/^0x[a-f0-9]+$/i);
    });
});

describe("provider control methods (direct API)", () => {
    describe("provider.setRejectTransaction", () => {
        it("should reject eth_sendTransaction with 4001 error when enabled", async () => {
            const provider = createE2EProvider(baseConfig);

            provider.setRejectTransaction(true);

            await expect(
                provider.request({
                    method: "eth_sendTransaction",
                    params: [{ from: TEST_ADDRESS, to: TEST_ADDRESS, value: "0x1" }],
                }),
            ).rejects.toMatchObject({
                code: ProviderErrorCode.UserRejectedRequest,
                message: "User rejected the transaction request.",
            });
        });

        it("should allow transactions after disabling rejection", () => {
            const provider = createE2EProvider(baseConfig);

            provider.setRejectTransaction(true);
            provider.setRejectTransaction(false);

            expect(provider.__internal.rejectTransaction).toBe(false);
        });
    });

    describe("provider.setRejectSignature", () => {
        it("should reject personal_sign with 4001 error when enabled", async () => {
            const provider = createE2EProvider(baseConfig);

            provider.setRejectSignature(true);

            await expect(
                provider.request({
                    method: "personal_sign",
                    params: ["0x48656c6c6f", TEST_ADDRESS],
                }),
            ).rejects.toMatchObject({
                code: ProviderErrorCode.UserRejectedRequest,
                message: "User rejected the signature request.",
            });
        });

        it("should allow signing after disabling rejection", async () => {
            const provider = createE2EProvider(baseConfig);

            provider.setRejectSignature(true);
            provider.setRejectSignature(false);

            const signature = await provider.request<Hex>({
                method: "personal_sign",
                params: ["0x48656c6c6f", TEST_ADDRESS],
            });
            expect(signature).toMatch(/^0x[a-f0-9]+$/i);
        });
    });

    describe("provider.setSigningAccount", () => {
        it("should switch account by index and emit accountsChanged", () => {
            const provider = createE2EProvider(baseConfig);
            const handler = vi.fn();

            provider.on("accountsChanged", handler);
            provider.setSigningAccount(3);

            expect(handler).toHaveBeenCalledWith([ANVIL_ACCOUNTS[3]!.address]);
        });

        it("should update eth_accounts after switching", async () => {
            const provider = createE2EProvider(baseConfig);

            provider.setSigningAccount(5);

            const accounts = await provider.request<Address[]>({ method: "eth_accounts" });
            expect(accounts).toEqual([ANVIL_ACCOUNTS[5]!.address]);
        });

        it("should throw for invalid index", () => {
            const provider = createE2EProvider(baseConfig);

            expect(() => provider.setSigningAccount(-1 as 0)).toThrow(
                "Invalid Anvil account index",
            );
        });
    });

    describe("provider.setChain", () => {
        it("should emit chainChanged event with hex chain ID", () => {
            const provider = createE2EProvider({
                ...baseConfig,
                chains: [mainnet, arbitrum],
            });
            const handler = vi.fn();

            provider.on("chainChanged", handler);
            provider.setChain(42161);

            expect(handler).toHaveBeenCalledWith("0xa4b1");
        });

        it("should update eth_chainId response after switching", async () => {
            const provider = createE2EProvider({
                ...baseConfig,
                chains: [mainnet, arbitrum],
            });

            provider.setChain(42161);

            const chainId = await provider.request<string>({ method: "eth_chainId" });
            expect(chainId).toBe("0xa4b1");
        });

        it("should throw for unsupported chain", () => {
            const provider = createE2EProvider(baseConfig);

            expect(() => provider.setChain(137)).toThrow(
                "Chain 137 is not supported. Supported chains: 1",
            );
        });
    });

    describe("provider.disconnect", () => {
        it("should emit disconnect event", () => {
            const provider = createE2EProvider(baseConfig);
            const handler = vi.fn();

            provider.on("disconnect", handler);
            provider.disconnect();

            expect(handler).toHaveBeenCalledWith({ code: 4900, message: "Disconnected" });
        });
    });
});

describe("ProviderRpcError", () => {
    it("should have correct properties", () => {
        const error = new ProviderRpcError(4001, "User rejected", { extra: "data" });

        expect(error.code).toBe(4001);
        expect(error.message).toBe("User rejected");
        expect(error.data).toEqual({ extra: "data" });
        expect(error.name).toBe("ProviderRpcError");
        expect(error).toBeInstanceOf(Error);
    });

    it("should work without data parameter", () => {
        const error = new ProviderRpcError(4100, "Unauthorized");

        expect(error.code).toBe(4100);
        expect(error.message).toBe("Unauthorized");
        expect(error.data).toBeUndefined();
    });
});

describe("ProviderErrorCode", () => {
    it("should have correct EIP-1193 error codes", () => {
        expect(ProviderErrorCode.UserRejectedRequest).toBe(4001);
        expect(ProviderErrorCode.Unauthorized).toBe(4100);
        expect(ProviderErrorCode.UnsupportedMethod).toBe(4200);
        expect(ProviderErrorCode.Disconnected).toBe(4900);
        expect(ProviderErrorCode.ChainDisconnected).toBe(4901);
    });
});
