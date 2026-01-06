# @wonderland/walletless

Lightweight E2E Provider for Web3 DApps - A virtual EIP-1193 provider that enables deterministic, high-performance E2E testing.

## Overview

This library provides a **"Man-in-the-Middle" injected provider** that sits between your DApp and the network. Instead of interacting with a real wallet extension, the DApp interacts with our custom provider which implements the standard EIP-1193 interface.

### How It Works

```mermaid
graph LR
    DApp["DApp UI"]
    CP1["E2E Provider"]
    CP2["E2E Provider"]
    SIGN["Sign logic / Impersonation"]
    ANVIL["Anvil RPC"]

    DApp -->|Read| CP1
    CP1 -->|eth_call, eth_getBalance, ...| ANVIL

    DApp -->|Write| CP2
    CP2 -->|eth_sendTx, eth_sign, ...| SIGN
    SIGN --> ANVIL
```

**Read operations** (`eth_call`, `eth_getBalance`, etc.) → Forwarded directly to Anvil RPC

**Write operations** (`eth_sendTransaction`, `eth_sign`, etc.) → Routed to local signing logic, then forwarded to Anvil RPC

This keeps **100% chain realism** while maintaining **full control** in tests.

## Advantages

-   **Incredible Test Speed**: No browser extension overhead, controlled RPC latency, fully virtualized wallet interactions
-   **Framework Agnostic**: Works with Cypress, Playwright, Selenium, or any E2E testing tool
-   **Zero External Dependencies**: Built entirely on viem types and native fetch
-   **Total Control**: Simulate edge cases like RPC errors, specific error codes, delayed signatures, chain switching failures
-   **CI/CD Friendly**: Runs effortlessly in headless browsers and Docker containers

## Installation

```bash
pnpm add @wonderland/walletless
```

## Usage

### With Wagmi (Recommended)

The solution uses a standard Wagmi Connector factory, making it "Plug and Play". The DApp does not need to change its code logic, only its configuration:

```typescript
import { e2eConnector } from "@wonderland/walletless";
import { createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";

const isE2E = process.env.CI === "true";

export const config = createConfig({
    chains: [mainnet],
    connectors: isE2E
        ? [e2eConnector()]
        : [
              /* real wallets */
          ],
    transports: {
        [mainnet.id]: http("http://127.0.0.1:8545"),
    },
});
```

#### Custom Configuration

```typescript
import { e2eConnector } from "@wonderland/walletless";
import { createConfig, http } from "wagmi";
import { arbitrum, mainnet, optimism } from "wagmi/chains";

export const config = createConfig({
    chains: [mainnet, arbitrum, optimism],
    connectors: [
        e2eConnector({
            chains: [mainnet, arbitrum, optimism],
            rpcUrls: {
                1: "http://mainnet-anvil:8545",
                42161: "http://arbitrum-anvil:8546",
            },
            account: "0xYourPrivateKey...",
            debug: true,
        }),
    ],
    transports: {
        [mainnet.id]: http("http://mainnet-anvil:8545"),
        [arbitrum.id]: http("http://arbitrum-anvil:8546"),
    },
});
```

### Standalone Provider

```typescript
import { createE2EProvider } from "@wonderland/walletless";
import { mainnet } from "viem/chains";

const provider = createE2EProvider();

// Use the provider directly
const accounts = await provider.request({ method: "eth_requestAccounts" });
const balance = await provider.request({
    method: "eth_getBalance",
    params: [accounts[0], "latest"],
});
```

### Test Control Functions

```typescript
import {
    ANVIL_ACCOUNTS,
    createE2EProvider,
    disconnect,
    setAccounts,
    setChain,
    setSigningAccount,
} from "@wonderland/walletless";
// Switch by viem Account object (for custom accounts)
import { privateKeyToAccount } from "viem/accounts";

const provider = createE2EProvider();

// Switch signing account by index (0-9)
setSigningAccount(provider, 0); // First Anvil account
setSigningAccount(provider, 5); // Sixth Anvil account

// Switch by Anvil address (looks up matching private key)
setSigningAccount(provider, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8");

// Switch by raw private key
setSigningAccount(provider, "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");

setSigningAccount(provider, privateKeyToAccount("0x..."));

// Access Anvil accounts directly
console.log(ANVIL_ACCOUNTS[0].address); // 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
console.log(ANVIL_ACCOUNTS[0].privateKey);

// Update accounts (emits accountsChanged event)
setAccounts(provider, ["0xNewAddress..."]);

// Disconnect (emits disconnect event)
disconnect(provider);
```

### Multichain Support

The provider supports multiple chains with per-chain RPC URLs, allowing you to test chain switching scenarios in your DApp:

```typescript
import { createE2EProvider, setChain } from "@wonderland/walletless";
import { arbitrum, mainnet, optimism } from "viem/chains";

// Create provider with multiple chains and per-chain RPC URLs
const provider = createE2EProvider({
    chains: [mainnet, arbitrum, optimism],
    rpcUrls: {
        1: "http://mainnet-anvil:8545",
        42161: "http://arbitrum-anvil:8546",
        10: "http://optimism-anvil:8547",
    },
});

// Get current chain (first in array is default)
const chainId = await provider.request({ method: "eth_chainId" });
console.log(chainId); // "0x1" (mainnet)

// Switch to Arbitrum - provider now uses arbitrum RPC URL
setChain(provider, arbitrum.id);

// Verify switch
const newChainId = await provider.request({ method: "eth_chainId" });
console.log(newChainId); // "0xa4b1" (Arbitrum)

// Switching to unsupported chain throws an error
try {
    setChain(provider, 137); // Polygon - not in chains array
} catch (e) {
    console.log(e.message); // "Chain 137 is not supported. Supported chains: 1, 42161, 10"
}
```

#### With Wagmi Connector

```typescript
import { e2eConnector } from "@wonderland/walletless";
import { createConfig, http } from "wagmi";
import { arbitrum, mainnet, optimism } from "wagmi/chains";

export const config = createConfig({
    chains: [mainnet, arbitrum, optimism],
    connectors: [
        e2eConnector({
            chains: [mainnet, arbitrum, optimism],
            rpcUrls: {
                1: "http://mainnet-anvil:8545",
                42161: "http://arbitrum-anvil:8546",
                10: "http://optimism-anvil:8547",
            },
        }),
    ],
    transports: {
        [mainnet.id]: http("http://mainnet-anvil:8545"),
        [arbitrum.id]: http("http://arbitrum-anvil:8546"),
        [optimism.id]: http("http://optimism-anvil:8547"),
    },
});
```

#### How Chain Switching Works

When you call `setChain()` or `wallet_switchEthereumChain`:

1. The chain ID is validated against the supported chains list
2. The RPC URL is updated to the corresponding chain's URL from `rpcUrls`
3. The internal wallet client is recreated with the new chain configuration
4. The provider state is updated with the new chain ID
5. A `chainChanged` event is emitted to notify listeners (wagmi, your DApp, etc.)

This ensures the wallet client always uses the correct chain and RPC endpoint for signing transactions.

### Using with Wagmi Connector

When you need to switch accounts or chains during tests while using the wagmi connector, pass your provider to the connector:

```typescript
import {
    createE2EProvider,
    e2eConnector,
    setChain,
    setSigningAccount,
} from "@wonderland/walletless";
import { createConfig, http } from "wagmi";
import { arbitrum, mainnet } from "wagmi/chains";

// Create provider externally so you can control it
const provider = createE2EProvider({
    chains: [mainnet, arbitrum],
    rpcUrls: {
        1: "http://mainnet-anvil:8545",
        42161: "http://arbitrum-anvil:8546",
    },
});

export const config = createConfig({
    chains: [mainnet, arbitrum],
    connectors: [e2eConnector({ provider })],
    transports: {
        [mainnet.id]: http("http://mainnet-anvil:8545"),
        [arbitrum.id]: http("http://arbitrum-anvil:8546"),
    },
});

// In your tests, switch accounts - wagmi will be notified automatically
setSigningAccount(provider, 3); // Switch to 4th Anvil account

// Switch chains during tests (also switches RPC endpoint)
setChain(provider, arbitrum.id); // Switch to Arbitrum
```

> **Note:** If your wagmi config is created inside a React component (common with RainbowKit or dynamic chain setups), you'll need to use `useRef` to maintain a stable provider reference. Otherwise, each re-render creates a new provider instance, and calls to `setSigningAccount()` won't affect the provider that wagmi is actually using.

## Method Routing

### Read Methods → Anvil RPC

These methods are forwarded directly to the configured RPC URL:

-   `eth_call`, `eth_getBalance`, `eth_getCode`, `eth_getStorageAt`
-   `eth_blockNumber`, `eth_getBlockByHash`, `eth_getBlockByNumber`
-   `eth_getTransactionReceipt`, `eth_getTransactionByHash`
-   `eth_gasPrice`, `eth_estimateGas`, `eth_feeHistory`
-   `eth_getLogs`, `eth_getFilterLogs`
-   And more...

### Write Methods → Local Signing → Anvil RPC

These methods are handled locally with viem's wallet client:

-   `eth_sendTransaction` - Signed locally, sent to Anvil
-   `personal_sign` - Signed locally
-   `eth_signTypedData_v4` - Signed locally
-   `eth_sign` - Signed locally

### Wallet Methods → Local State

These methods are handled by local provider state:

-   `eth_accounts`, `eth_requestAccounts`
-   `eth_chainId`, `net_version`
-   `wallet_switchEthereumChain`, `wallet_addEthereumChain`

## Test Runner Integration

### Cypress Example

```typescript
// cypress/e2e/swap.cy.ts
describe("Token Swap", () => {
    beforeEach(() => {
        // Start Anvil fork before tests
        cy.task("startAnvil", { forkUrl: process.env.MAINNET_RPC });
    });

    it("should swap tokens successfully", () => {
        cy.visit("/swap");

        // The E2E connector auto-connects
        cy.get('[data-testid="token-input"]').type("1.0");
        cy.get('[data-testid="swap-button"]').click();

        // Transaction is signed locally and sent to Anvil
        cy.get('[data-testid="success-message"]').should("be.visible");
    });
});
```

### Playwright Example

```typescript
// tests/swap.spec.ts
import { expect, test } from "@playwright/test";

test("should swap tokens", async ({ page }) => {
    await page.goto("/swap");

    await page.getByTestId("token-input").fill("1.0");
    await page.getByTestId("swap-button").click();

    // Transaction is automatically signed and executed
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
});
```

## Configuration

### E2EConnectorParameters (Wagmi)

The connector accepts **either** a pre-constructed provider **or** configuration options:

**Option 1: Pass a provider** (recommended when you need `setSigningAccount()`)

| Parameter  | Type          | Description                                   |
| ---------- | ------------- | --------------------------------------------- |
| `provider` | `E2EProvider` | Pre-constructed provider for external control |

**Option 2: Let the connector create the provider internally**

| Parameter | Type                     | Default                        | Description                                                                       |
| --------- | ------------------------ | ------------------------------ | --------------------------------------------------------------------------------- |
| `chains`  | `Chain[]`                | `[mainnet]`                    | Supported chains (first chain is default)                                         |
| `rpcUrls` | `Record<number, string>` | `{}`                           | Per-chain RPC URLs mapping chainId to URL. Falls back to `http://127.0.0.1:8545`. |
| `account` | `Hex \| Account`         | Anvil's first test private key | Private key or viem Account for signing                                           |
| `debug`   | `boolean`                | `false`                        | Enable debug logging                                                              |

### E2EProviderConfig (Standalone)

All parameters are optional with sensible Anvil defaults:

| Parameter | Type                     | Default                        | Description                                                                       |
| --------- | ------------------------ | ------------------------------ | --------------------------------------------------------------------------------- |
| `chains`  | `Chain[]`                | `[mainnet]`                    | Supported chains (first chain is default)                                         |
| `rpcUrls` | `Record<number, string>` | `{}`                           | Per-chain RPC URLs mapping chainId to URL. Falls back to `http://127.0.0.1:8545`. |
| `account` | `Hex \| Account`         | Anvil's first test private key | Private key or viem Account for signing                                           |
| `debug`   | `boolean`                | `false`                        | Enable debug logging                                                              |

### setSigningAccount Input Types

| Input Type   | Example                                     | Description                        |
| ------------ | ------------------------------------------- | ---------------------------------- |
| Index (0-9)  | `setSigningAccount(provider, 0)`            | Use Anvil's nth default account    |
| Address      | `setSigningAccount(provider, "0x70997...")` | Look up matching Anvil account     |
| Private Key  | `setSigningAccount(provider, "0x59c69...")` | Use any private key (66 chars)     |
| viem Account | `setSigningAccount(provider, viemAccount)`  | Use a viem Account object directly |

## Final Result

With this library you get:

-   A **real blockchain** (Anvil fork)
-   A **virtual wallet** (local signing)
-   A **deterministic environment** (no external dependencies)
-   A **super-fast E2E stack** (no browser extension overhead)
-   **Zero dependency on Metamask** or fake endpoints

This is as close as you can get to **production behavior** with **testing-level control**.

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Lint
pnpm lint

# Format
pnpm format:fix
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting a PR.
