import type { Address } from "viem";
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

const mockAddress: Address = "0x1234567890123456789012345678901234567890";

const baseConfig: E2EProviderConfig = {
    interceptorUrl: "http://localhost:3001/intercept",
    rpcUrl: "http://localhost:8545",
    chain: mockChain,
    mockAddress,
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

        it("should initialize with mock address when provided", async () => {
            const provider = createE2EProvider(baseConfig);

            const accounts = await provider.request<Address[]>({ method: "eth_accounts" });

            expect(accounts).toEqual([mockAddress]);
        });

        it("should initialize with empty accounts when no mock address provided", async () => {
            const provider = createE2EProvider({
                ...baseConfig,
                mockAddress: undefined,
            });

            const accounts = await provider.request<Address[]>({ method: "eth_accounts" });

            expect(accounts).toEqual([]);
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
        it("should return mock accounts when available", async () => {
            const provider = createE2EProvider(baseConfig);

            const accounts = await provider.request<Address[]>({ method: "eth_requestAccounts" });

            expect(accounts).toEqual([mockAddress]);
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

    describe("event handling", () => {
        it("should add and call event listeners", () => {
            const provider = createE2EProvider(baseConfig);
            const handler = vi.fn();

            provider.on("accountsChanged", handler);
            provider.emit("accountsChanged", [mockAddress]);

            expect(handler).toHaveBeenCalledWith([mockAddress]);
        });

        it("should remove event listeners", () => {
            const provider = createE2EProvider(baseConfig);
            const handler = vi.fn();

            provider.on("accountsChanged", handler);
            provider.removeListener("accountsChanged", handler);
            provider.emit("accountsChanged", [mockAddress]);

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
                params: [mockAddress, "latest"],
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
                params: [{ to: mockAddress, data: "0x" }, "latest"],
            });

            expect(result).toBe("0xabcdef");
            expect(mockFetch).toHaveBeenCalled();
        });
    });

    describe("wallet methods routing", () => {
        it("should route eth_sendTransaction to interceptor", async () => {
            const mockTxHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
            const mockFetch = vi.spyOn(global, "fetch").mockResolvedValueOnce({
                json: vi.fn().mockResolvedValueOnce({
                    success: true,
                    result: mockTxHash,
                }),
            } as unknown as Response);

            const provider = createE2EProvider(baseConfig);
            const txHash = await provider.request<string>({
                method: "eth_sendTransaction",
                params: [{ from: mockAddress, to: mockAddress, value: "0x1" }],
            });

            expect(txHash).toBe(mockTxHash);
            expect(mockFetch).toHaveBeenCalledWith(
                "http://localhost:3001/intercept",
                expect.objectContaining({
                    method: "POST",
                }),
            );
        });

        it("should route personal_sign to interceptor", async () => {
            const mockSignature = "0xabcdef";
            const mockFetch = vi.spyOn(global, "fetch").mockResolvedValueOnce({
                json: vi.fn().mockResolvedValueOnce({
                    success: true,
                    result: mockSignature,
                }),
            } as unknown as Response);

            const provider = createE2EProvider(baseConfig);
            const signature = await provider.request<string>({
                method: "personal_sign",
                params: ["0x48656c6c6f", mockAddress],
            });

            expect(signature).toBe(mockSignature);
            expect(mockFetch).toHaveBeenCalledWith(
                "http://localhost:3001/intercept",
                expect.anything(),
            );
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
                provider.request({ method: "eth_getBalance", params: [mockAddress, "latest"] }),
            ).rejects.toThrow("Invalid Request");
        });

        it("should throw on interceptor error", async () => {
            vi.spyOn(global, "fetch").mockResolvedValueOnce({
                json: vi.fn().mockResolvedValueOnce({
                    success: false,
                    error: { code: 4001, message: "User rejected" },
                }),
            } as unknown as Response);

            const provider = createE2EProvider(baseConfig);

            await expect(
                provider.request({ method: "eth_sendTransaction", params: [] }),
            ).rejects.toThrow("User rejected");
        });
    });
});

describe("setAccounts", () => {
    it("should emit accountsChanged event", () => {
        const provider = createE2EProvider(baseConfig);
        const handler = vi.fn();
        const newAccounts: Address[] = ["0xNewAddress1234567890123456789012345678"];

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
