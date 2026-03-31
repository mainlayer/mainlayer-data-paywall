import type { Express } from 'express';
import type { PaywallConfig } from './config.js';
export interface ProxyServerOptions {
    config: PaywallConfig;
    /** If true, skip the paywall and proxy everything through directly (useful for testing) */
    paywallDisabled?: boolean;
}
/**
 * Build a fully configured Express application that wraps an upstream service
 * with a Mainlayer paywall.
 */
export declare function buildProxyApp(options: ProxyServerOptions): Express;
export interface RunningServer {
    close: () => Promise<void>;
    port: number;
}
/**
 * Start the proxy server on the configured port.
 * Returns a handle that can shut down the server gracefully.
 */
export declare function startProxyServer(options: ProxyServerOptions): Promise<RunningServer>;
//# sourceMappingURL=proxy.d.ts.map