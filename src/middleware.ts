import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { PaywallService, EntitlementCheckError } from './paywall.js';
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
export function createPaywall(options: CreatePaywallOptions): RequestHandler[] {
  const config: PaywallConfig = {
    mainlayerApiKey: options.apiKey,
    resourceId: options.resourceId,
    upstreamUrl: options.upstream,
    port: 3000,
    checkInterval: options.checkInterval ?? 60,
    priceUsdc: options.priceUsdc ?? 0.01,
  };

  const paywallService = new PaywallService(config);
  const proxyMiddleware = buildProxyMiddleware(config);

  const authMiddleware: RequestHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const payerWallet = extractPayerWallet(req);

    // No wallet header — immediately return payment challenge
    if (!payerWallet) {
      res.status(402).json(paywallService.buildPaymentRequiredBody());
      return;
    }

    try {
      const entitlement = await paywallService.checkEntitlement(payerWallet);

      if (!entitlement.granted) {
        res.status(402).json(paywallService.buildPaymentRequiredBody());
        return;
      }

      // Access granted — continue to proxy
      next();
    } catch (err) {
      if (err instanceof EntitlementCheckError) {
        // Fail closed: deny access on API errors
        console.error('[mainlayer-paywall] Entitlement check failed:', err.message);
        res.status(503).json({
          error: 'service_unavailable',
          message: 'Unable to verify payment status. Please try again.',
        });
        return;
      }

      // Unexpected error
      next(err);
    }
  };

  return [authMiddleware, proxyMiddleware as RequestHandler];
}

/**
 * Build a configured http-proxy-middleware instance targeting the upstream URL.
 */
export function buildProxyMiddleware(config: PaywallConfig): RequestHandler {
  return createProxyMiddleware({
    target: config.upstreamUrl,
    changeOrigin: true,
    on: {
      error: (err, _req, res) => {
        console.error('[mainlayer-paywall] Proxy error:', err.message);
        if (!('headersSent' in res && res.headersSent)) {
          (res as Response).status(502).json({
            error: 'bad_gateway',
            message: 'Upstream service is unavailable.',
          });
        }
      },
    },
  }) as RequestHandler;
}

/**
 * Extract the payer wallet identifier from the incoming request.
 * Reads `X-Payer-Wallet` header (primary) and falls back to
 * a `payer_wallet` query parameter for CLI/browser convenience.
 */
export function extractPayerWallet(req: Request): string | null {
  const header = req.headers['x-payer-wallet'];
  if (typeof header === 'string' && header.trim()) {
    return header.trim();
  }

  const query = req.query['payer_wallet'];
  if (typeof query === 'string' && query.trim()) {
    return query.trim();
  }

  return null;
}
