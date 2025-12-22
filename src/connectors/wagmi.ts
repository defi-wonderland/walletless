import { createRequire } from "node:module";

import type { E2EConnectorParameters } from "../connector.js";
import type { ConnectorInstance, CreateConnectorFn } from "../types.js";
import { createE2EConnectorBuilder } from "../connector.js";

const require = createRequire(import.meta.url);

/**
 * Wagmi adapter for the agnostic E2E connector builder.
 *
 * @example
 * ```ts
 * import { e2eConnector } from "@wonderland/walletless/connectors/wagmi";
 * import { createConfig, http } from "wagmi";
 * import { mainnet } from "wagmi/chains";
 *
 * // Zero-config usage with Anvil defaults (mainnet fork, first test account)
 * const config = createConfig({
 *   chains: [mainnet],
 *   connectors: [e2eConnector()],
 *   transports: { [mainnet.id]: http("http://127.0.0.1:8545") },
 * });
 *
 * // Custom configuration
 * const customConfig = createConfig({
 *   chains: [mainnet],
 *   connectors: [
 *     e2eConnector({
 *       rpcUrl: "http://127.0.0.1:8545",
 *       account: "0xYourPrivateKey...",
 *       chain: mainnet,
 *       debug: true,
 *     }),
 *   ],
 *   transports: { [mainnet.id]: http("http://127.0.0.1:8545") },
 * });
 * ```
 */
const loadCreateConnector = (): CreateConnectorFn => {
    try {
        const wagmi = require("wagmi") as typeof import("wagmi");
        return wagmi.createConnector as unknown as CreateConnectorFn;
    } catch (error) {
        throw new Error(
            "wagmi is not installed. Install it to use the e2e connector: `pnpm add wagmi`.",
        );
    }
};

export const e2eConnector = (parameters: E2EConnectorParameters = {}): ConnectorInstance => {
    const createConnectorFn = loadCreateConnector();
    const builder = createE2EConnectorBuilder(createConnectorFn);
    return builder(parameters);
};
