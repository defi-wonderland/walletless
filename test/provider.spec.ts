import type { Address, Hex } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { E2EProviderConfig } from "../src/types.js";
import { createE2EProvider, disconnect, setAccounts, setChain } from "../src/provider.js";

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
// Corresponding address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
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
