# @defi-wonderland/e2e-provider

Virtual EIP-1193 provider and Wagmi connector for E2E testing of Web3 applications.

## Overview

This library provides a virtual Ethereum provider that enables end-to-end testing of Web3 applications without requiring a real wallet extension. It intercepts wallet operations (signing, transactions) and forwards them to a configurable interceptor URL while routing read-only blockchain operations to an RPC endpoint.

### Key Features

- **EIP-1193 Compatible**: Drop-in replacement for wallet providers
- **Wagmi Integration**: Custom connector for seamless Wagmi v2 integration
- **Request Interception**: Forward wallet operations to your test infrastructure
- **RPC Routing**: Route read operations to a local fork or public RPC
- **Full Control**: Programmatically control accounts, chains, and events

## Installation

```bash
pnpm add @defi-wonderland/e2e-provider
```

## Usage

### With Wagmi

```typescript
import { e2eConnector } from "@defi-wonderland/e2e-provider";
import { createConfig, http } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";

const config = createConfig({
    chains: [mainnet, sepolia],
    connectors: [
        e2eConnector({
            interceptorUrl: "http://localhost:3001/wallet-intercept",
            rpcUrl: "http://localhost:8545", // anvil fork
            mockAddress: "0x1234567890123456789012345678901234567890",
            debug: true,
        }),
    ],
    transports: {
        [mainnet.id]: http("http://localhost:8545"),
        [sepolia.id]: http("http://localhost:8545"),
    },
});
```

### Standalone Provider

```typescript
import { createE2EProvider } from "@defi-wonderland/e2e-provider";
import { mainnet } from "viem/chains";

const provider = createE2EProvider({
    interceptorUrl: "http://localhost:3001/intercept",
    rpcUrl: "http://localhost:8545",
    chain: mainnet,
    mockAddress: "0x1234567890123456789012345678901234567890",
    debug: true,
});

// Use the provider directly
const accounts = await provider.request({ method: "eth_requestAccounts" });
const balance = await provider.request({
    method: "eth_getBalance",
    params: ["0x1234...", "latest"],
});
```

### Test Control Functions

```typescript
import { setAccounts, setChain, disconnect } from "@defi-wonderland/e2e-provider";

// Update accounts during test
setAccounts(provider, ["0xNewAddress..."]);

// Switch chain
setChain(provider, 1); // mainnet

// Disconnect
disconnect(provider);
```

## How It Works

The E2E provider routes requests based on their type:

### Read Methods → RPC URL

These methods are forwarded to the configured RPC URL (or chain's default):

- `eth_call`, `eth_getBalance`, `eth_getCode`
- `eth_blockNumber`, `eth_getBlockByHash`, `eth_getBlockByNumber`
- `eth_getTransactionReceipt`, `eth_getTransactionByHash`
- `eth_gasPrice`, `eth_estimateGas`, `eth_feeHistory`
- And more...

### Wallet Methods → Interceptor URL

These methods are forwarded to your test interceptor:

- `eth_requestAccounts`, `eth_accounts`
- `eth_sendTransaction`, `eth_sendRawTransaction`
- `personal_sign`, `eth_signTypedData_v4`
- `wallet_switchEthereumChain`, `wallet_addEthereumChain`
- And more...

## Interceptor API

Your interceptor should handle POST requests with the following payload:

```typescript
type InterceptedRequest = {
    id: number;
    method: string;
    params?: unknown[];
    timestamp: number;
    chainId: number;
};
```

And respond with:

```typescript
type InterceptorResponse<T> = {
    success: boolean;
    result?: T;
    error?: {
        code: number;
        message: string;
        data?: unknown;
    };
};
```

### Example Interceptor (Express)

```typescript
import express from "express";

const app = express();
app.use(express.json());

app.post("/wallet-intercept", (req, res) => {
    const { method, params } = req.body;

    switch (method) {
        case "eth_sendTransaction":
            // Return a mock transaction hash
            res.json({
                success: true,
                result: "0x1234567890abcdef...",
            });
            break;

        case "personal_sign":
            // Return a mock signature
            res.json({
                success: true,
                result: "0xabcdef...",
            });
            break;

        default:
            res.json({
                success: false,
                error: { code: 4001, message: "User rejected" },
            });
    }
});

app.listen(3001);
```

## Configuration

### E2EConnectorParameters

| Parameter        | Type              | Required | Description                                    |
| ---------------- | ----------------- | -------- | ---------------------------------------------- |
| `interceptorUrl` | `string`          | Yes      | URL to forward wallet requests                 |
| `rpcUrl`         | `string`          | No       | RPC URL for read operations                    |
| `chains`         | `readonly Chain[]`| No       | Supported chains (defaults to wagmi config)    |
| `mockAddress`    | `Address`         | No       | Initial wallet address                         |
| `debug`          | `boolean`         | No       | Enable debug logging                           |

### E2EProviderConfig

| Parameter        | Type      | Required | Description                                    |
| ---------------- | --------- | -------- | ---------------------------------------------- |
| `interceptorUrl` | `string`  | Yes      | URL to forward wallet requests                 |
| `rpcUrl`         | `string`  | No       | RPC URL for read operations                    |
| `chain`          | `Chain`   | Yes      | Chain configuration                            |
| `mockAddress`    | `Address` | No       | Initial wallet address                         |
| `debug`          | `boolean` | No       | Enable debug logging                           |

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
