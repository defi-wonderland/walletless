import type { Address, Hex } from "viem";
import { arbitrum, mainnet, optimism } from "viem/chains";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { e2eConnector } from "../src/connector.js";

const mockChain = mainnet;

// Anvil's first test private key
const TEST_PRIVATE_KEY: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TEST_ADDRESS: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

// Mock wagmi config emitter
function createMockConfig(): {
    emitter: { emit: ReturnType<typeof vi.fn> };
    chains: (typeof mockChain)[];
    state: { chainId: number };
} {
    return {
        emitter: {
            emit: vi.fn(),
        },
        chains: [mockChain],
        state: {
            chainId: mockChain.id,
        },
    };
}

describe("e2eConnector", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("connector factory", () => {
        it("should create a connector with default parameters", () => {
            const connector = e2eConnector();

            expect(connector).toBeDefined();
            expect(typeof connector).toBe("function");
        });

        it("should create a connector with custom parameters", () => {
            const connector = e2eConnector({
                chains: [mainnet],
                rpcUrls: { 1: "http://custom:8545" },
                account: TEST_PRIVATE_KEY,
                debug: true,
            });

            expect(connector).toBeDefined();
        });
    });

    describe("connector instance", () => {
        it("should have correct id, name, and type", () => {
            const connector = e2eConnector({ chains: [mockChain], account: TEST_PRIVATE_KEY });
            const mockConfig = createMockConfig();
            const instance = connector(mockConfig as never);

            expect(instance.id).toBe("e2e-connector");
            expect(instance.name).toBe("E2E Connector");
            expect(instance.type).toBe("e2e");
        });
    });

    describe("setup", () => {
        it("should complete without error", async () => {
            const connector = e2eConnector({ chains: [mockChain], account: TEST_PRIVATE_KEY });
            const mockConfig = createMockConfig();
            const instance = connector(mockConfig as never);

            await expect(instance.setup?.()).resolves.toBeUndefined();
        });
    });

    describe("connect", () => {
        it("should return accounts and chainId", async () => {
            const connector = e2eConnector({ chains: [mockChain], account: TEST_PRIVATE_KEY });
            const mockConfig = createMockConfig();
            const instance = connector(mockConfig as never);

            const result = await instance.connect({});

            expect(result.accounts).toEqual([TEST_ADDRESS]);
            expect(result.chainId).toBe(mockChain.id);
        });

        it("should use provided chainId when connecting", async () => {
            const connector = e2eConnector({ chains: [mockChain], account: TEST_PRIVATE_KEY });
            const mockConfig = createMockConfig();
            const instance = connector(mockConfig as never);

            const result = await instance.connect({ chainId: 137 });

            expect(result.chainId).toBe(137);
        });

        it("should use default chain id when no chainId provided", async () => {
            const connector = e2eConnector({ chains: [mockChain], account: TEST_PRIVATE_KEY });
            const mockConfig = createMockConfig();
            const instance = connector(mockConfig as never);

            const result = await instance.connect({});

            expect(result.chainId).toBe(mockChain.id);
        });
    });

    describe("disconnect", () => {
        it("should disconnect without error", async () => {
            const connector = e2eConnector({ chains: [mockChain], account: TEST_PRIVATE_KEY });
            const mockConfig = createMockConfig();
            const instance = connector(mockConfig as never);

            await instance.connect({});
            await expect(instance.disconnect()).resolves.toBeUndefined();
        });

        it("should handle disconnect when not connected", async () => {
            const connector = e2eConnector({ chains: [mockChain], account: TEST_PRIVATE_KEY });
            const mockConfig = createMockConfig();
            const instance = connector(mockConfig as never);

            await expect(instance.disconnect()).resolves.toBeUndefined();
        });
    });

    describe("getAccounts", () => {
        it("should return the configured account address", async () => {
            const connector = e2eConnector({ chains: [mockChain], account: TEST_PRIVATE_KEY });
            const mockConfig = createMockConfig();
            const instance = connector(mockConfig as never);

            const accounts = await instance.getAccounts();

            expect(accounts).toEqual([TEST_ADDRESS]);
        });
    });

    describe("getChainId", () => {
        it("should return default chain id when not connected", async () => {
            const connector = e2eConnector({ chains: [mockChain], account: TEST_PRIVATE_KEY });
            const mockConfig = createMockConfig();
            const instance = connector(mockConfig as never);

            const chainId = await instance.getChainId();

            expect(chainId).toBe(mockChain.id);
        });

        it("should return chain id from provider when connected", async () => {
            const connector = e2eConnector({ chains: [mockChain], account: TEST_PRIVATE_KEY });
            const mockConfig = createMockConfig();
            const instance = connector(mockConfig as never);

            await instance.connect({});
            const chainId = await instance.getChainId();

            expect(chainId).toBe(mockChain.id);
        });
    });

    describe("getProvider", () => {
        it("should return a provider", async () => {
            const connector = e2eConnector({ chains: [mockChain], account: TEST_PRIVATE_KEY });
            const mockConfig = createMockConfig();
            const instance = connector(mockConfig as never);

            const provider = await instance.getProvider();

            expect(provider).toBeDefined();
            expect(provider.request).toBeDefined();
        });

        it("should create provider if not connected", async () => {
            const connector = e2eConnector({ chains: [mockChain], account: TEST_PRIVATE_KEY });
            const mockConfig = createMockConfig();
            const instance = connector(mockConfig as never);

            const provider = await instance.getProvider();

            expect(provider).toBeDefined();
        });

        it("should return same provider after connect", async () => {
            const connector = e2eConnector({ chains: [mockChain], account: TEST_PRIVATE_KEY });
            const mockConfig = createMockConfig();
            const instance = connector(mockConfig as never);

            await instance.connect({});
            const provider1 = await instance.getProvider();
            const provider2 = await instance.getProvider();

            expect(provider1).toBe(provider2);
        });
    });

    describe("isAuthorized", () => {
        it("should always return true", async () => {
            const connector = e2eConnector({ chains: [mockChain], account: TEST_PRIVATE_KEY });
            const mockConfig = createMockConfig();
            const instance = connector(mockConfig as never);

            const authorized = await instance.isAuthorized();

            expect(authorized).toBe(true);
        });
    });

    describe("switchChain", () => {
        it("should switch chain and emit change event", async () => {
            const connector = e2eConnector({
                chains: [mockChain, optimism],
                account: TEST_PRIVATE_KEY,
            });
            const mockConfig = createMockConfig();
            const instance = connector(mockConfig as never);

            await instance.connect({});
            const result = await instance.switchChain!({ chainId: 10 });

            expect(result.id).toBe(10);
            expect(mockConfig.emitter.emit).toHaveBeenCalledWith("change", { chainId: 10 });
        });

        it("should return chain config with correct properties", async () => {
            const connector = e2eConnector({
                chains: [mockChain, arbitrum],
                account: TEST_PRIVATE_KEY,
            });
            const mockConfig = createMockConfig();
            const instance = connector(mockConfig as never);

            await instance.connect({});
            const result = await instance.switchChain!({ chainId: 42161 });

            expect(result.id).toBe(42161);
            expect(result.name).toBe("Arbitrum One");
            expect(result.nativeCurrency).toEqual(arbitrum.nativeCurrency);
            expect(result.rpcUrls).toEqual(arbitrum.rpcUrls);
        });

        it("should emit change event even without provider", async () => {
            const connector = e2eConnector({ chains: [mockChain], account: TEST_PRIVATE_KEY });
            const mockConfig = createMockConfig();
            const instance = connector(mockConfig as never);

            await instance.switchChain!({ chainId: 1 });

            expect(mockConfig.emitter.emit).toHaveBeenCalledWith("change", { chainId: 1 });
        });
    });

    describe("onAccountsChanged", () => {
        it("should emit change event with new accounts", async () => {
            const connector = e2eConnector({ chains: [mockChain], account: TEST_PRIVATE_KEY });
            const mockConfig = createMockConfig();
            const instance = connector(mockConfig as never);
            const newAccounts = ["0x1234567890123456789012345678901234567890" as Address];

            await instance.connect({});
            instance.onAccountsChanged(newAccounts);

            expect(mockConfig.emitter.emit).toHaveBeenCalledWith("change", {
                accounts: newAccounts,
            });
        });

        it("should not update provider accounts if array is empty", async () => {
            const connector = e2eConnector({ chains: [mockChain], account: TEST_PRIVATE_KEY });
            const mockConfig = createMockConfig();
            const instance = connector(mockConfig as never);

            await instance.connect({});
            instance.onAccountsChanged([]);

            // Should still emit change event
            expect(mockConfig.emitter.emit).toHaveBeenCalledWith("change", { accounts: [] });
        });
    });

    describe("onChainChanged", () => {
        it("should emit change event with new chain id (hex string)", async () => {
            const connector = e2eConnector({ chains: [mockChain], account: TEST_PRIVATE_KEY });
            const mockConfig = createMockConfig();
            const instance = connector(mockConfig as never);

            await instance.connect({});
            instance.onChainChanged("0x89");

            expect(mockConfig.emitter.emit).toHaveBeenCalledWith("change", { chainId: 137 });
        });

        it("should emit change event with new chain id (number)", async () => {
            const connector = e2eConnector({ chains: [mockChain], account: TEST_PRIVATE_KEY });
            const mockConfig = createMockConfig();
            const instance = connector(mockConfig as never);

            await instance.connect({});
            instance.onChainChanged("0xa4b1"); // 42161 in hex

            expect(mockConfig.emitter.emit).toHaveBeenCalledWith("change", { chainId: 42161 });
        });
    });

    describe("onDisconnect", () => {
        it("should emit disconnect event", async () => {
            const connector = e2eConnector({ chains: [mockChain], account: TEST_PRIVATE_KEY });
            const mockConfig = createMockConfig();
            const instance = connector(mockConfig as never);

            await instance.connect({});
            instance.onDisconnect();

            expect(mockConfig.emitter.emit).toHaveBeenCalledWith("disconnect");
        });

        it("should handle disconnect when not connected", () => {
            const connector = e2eConnector({ chains: [mockChain], account: TEST_PRIVATE_KEY });
            const mockConfig = createMockConfig();
            const instance = connector(mockConfig as never);

            instance.onDisconnect();

            expect(mockConfig.emitter.emit).toHaveBeenCalledWith("disconnect");
        });
    });

    describe("provider integration", () => {
        it("should be able to request accounts through provider", async () => {
            const connector = e2eConnector({ chains: [mockChain], account: TEST_PRIVATE_KEY });
            const mockConfig = createMockConfig();
            const instance = connector(mockConfig as never);

            await instance.connect({});
            const provider = await instance.getProvider();
            const accounts = await provider.request<Address[]>({ method: "eth_accounts" });

            expect(accounts).toEqual([TEST_ADDRESS]);
        });

        it("should be able to get chain id through provider", async () => {
            const connector = e2eConnector({ chains: [mockChain], account: TEST_PRIVATE_KEY });
            const mockConfig = createMockConfig();
            const instance = connector(mockConfig as never);

            await instance.connect({});
            const provider = await instance.getProvider();
            const chainId = await provider.request<string>({ method: "eth_chainId" });

            expect(chainId).toBe("0x1");
        });
    });
});
