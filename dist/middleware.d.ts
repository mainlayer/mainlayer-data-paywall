import type { Request, RequestHandler } from 'express';
import type { PaywallConfig } from './config.js';
export interface CreatePaywallOptions {
    resourceId: string;
    upstream: string;
    apiKey: string;
    checkInterval?: number;
    priceUsdc?: number;
}
/**
 * Express middleware factory.
 * Protects all downstream routes with a Mainlayer paywall.
 *
 * Usage:
 *   app.use('/protected', createPaywall({ ... }))
 */
export declare function createPaywall(options: CreatePaywallOptions): RequestHandler[];
/**
 * Build a configured http-proxy-middleware instance targeting the upstream URL.
 */
export declare function buildProxyMiddleware(config: PaywallConfig): RequestHandler;
/**
 * Extract the payer wallet identifier from the incoming request.
 * Reads `X-Payer-Wallet` header (primary) and falls back to
 * a `payer_wallet` query parameter for CLI/browser convenience.
 */
export declare function extractPayerWallet(req: Request): string | null;
//# sourceMappingURL=middleware.d.ts.map