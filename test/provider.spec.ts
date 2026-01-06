import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { E2EProviderConfig } from "../src/types.js";
import { ANVIL_ACCOUNTS } from "../src/constants.js";
import {
    createE2EProvider,
    disconnect,
    setAccounts,
    setChain,
    setSigningAccount,
} from "../src/provider.js";

const mockChain = {
    id: 1,
    name: "Ethereum",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
        default: { http: ["https://eth.llamarpc.com"] },
    },
} as const;

// Anvil's first test private key
const TEST_PRIVATE_KEY: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TEST_ADDRESS: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const baseConfig: E2EProviderConfig = {
    rpcUrl: "http://localhost:8545",
    chain: mockChain,
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
        it("should update chain ID and emit chainChanged event", async () => {
            const provider = createE2EProvider(baseConfig);
            const chainChangedHandler = vi.fn();

            provider.on("chainChanged", chainChangedHandler);
            await provider.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: "0x89" }], // Polygon
            });

            expect(chainChangedHandler).toHaveBeenCalledWith("0x89");

            // Verify the chain ID was updated
            const chainId = await provider.request<string>({ method: "eth_chainId" });
            expect(chainId).toBe("0x89");
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

describe("setAccounts", () => {
    it("should emit accountsChanged event", () => {
        const provider = createE2EProvider(baseConfig);
        const handler = vi.fn();
        const newAccounts: Address[] = ["0xNewAddress1234567890123456789012345678" as Address];

        provider.on("accountsChanged", handler);
        setAccounts(provider, newAccounts);

        expect(handler).toHaveBeenCalledWith(newAccounts);
    });
});

describe("setChain", () => {
    it("should emit chainChanged event with hex chain ID", () => {
        const provider = createE2EProvider(baseConfig);
        const handler = vi.fn();

        provider.on("chainChanged", handler);
        setChain(provider, 137); // Polygon

        expect(handler).toHaveBeenCalledWith("0x89");
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
