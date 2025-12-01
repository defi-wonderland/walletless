import { describe, expect, it } from "vitest";

import { isReadMethod, isWalletMethod, READ_METHODS, WALLET_METHODS } from "../src/constants.js";

describe("constants", () => {
    describe("READ_METHODS", () => {
        it("should include common read methods", () => {
            expect(READ_METHODS).toContain("eth_call");
            expect(READ_METHODS).toContain("eth_getBalance");
            expect(READ_METHODS).toContain("eth_blockNumber");
            expect(READ_METHODS).toContain("eth_getTransactionReceipt");
            expect(READ_METHODS).toContain("eth_gasPrice");
        });

        it("should not include wallet methods", () => {
            expect(READ_METHODS).not.toContain("eth_sendTransaction");
            expect(READ_METHODS).not.toContain("personal_sign");
            expect(READ_METHODS).not.toContain("eth_requestAccounts");
        });
    });

    describe("WALLET_METHODS", () => {
        it("should include common wallet methods", () => {
            expect(WALLET_METHODS).toContain("eth_requestAccounts");
            expect(WALLET_METHODS).toContain("eth_sendTransaction");
            expect(WALLET_METHODS).toContain("personal_sign");
            expect(WALLET_METHODS).toContain("eth_signTypedData_v4");
            expect(WALLET_METHODS).toContain("wallet_switchEthereumChain");
        });

        it("should not include read methods", () => {
            expect(WALLET_METHODS).not.toContain("eth_call");
            expect(WALLET_METHODS).not.toContain("eth_getBalance");
            expect(WALLET_METHODS).not.toContain("eth_blockNumber");
        });
    });

    describe("isReadMethod", () => {
        it("should return true for read methods", () => {
            expect(isReadMethod("eth_call")).toBe(true);
            expect(isReadMethod("eth_getBalance")).toBe(true);
            expect(isReadMethod("eth_blockNumber")).toBe(true);
            expect(isReadMethod("eth_getTransactionReceipt")).toBe(true);
        });

        it("should return false for wallet methods", () => {
            expect(isReadMethod("eth_sendTransaction")).toBe(false);
            expect(isReadMethod("personal_sign")).toBe(false);
            expect(isReadMethod("eth_requestAccounts")).toBe(false);
        });

        it("should return false for unknown methods", () => {
            expect(isReadMethod("unknown_method")).toBe(false);
            expect(isReadMethod("")).toBe(false);
        });
    });

    describe("isWalletMethod", () => {
        it("should return true for wallet methods", () => {
            expect(isWalletMethod("eth_sendTransaction")).toBe(true);
            expect(isWalletMethod("personal_sign")).toBe(true);
            expect(isWalletMethod("eth_requestAccounts")).toBe(true);
            expect(isWalletMethod("wallet_switchEthereumChain")).toBe(true);
        });

        it("should return false for read methods", () => {
            expect(isWalletMethod("eth_call")).toBe(false);
            expect(isWalletMethod("eth_getBalance")).toBe(false);
            expect(isWalletMethod("eth_blockNumber")).toBe(false);
        });

        it("should return false for unknown methods", () => {
            expect(isWalletMethod("unknown_method")).toBe(false);
            expect(isWalletMethod("")).toBe(false);
        });
    });
});
