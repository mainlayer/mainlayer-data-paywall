import { createProxyMiddleware } from 'http-proxy-middleware';
import { PaywallService, EntitlementCheckError } from './paywall.js';
/**
 * Express middleware factory.
 * Protects all downstream routes with a Mainlayer paywall.
 *
 * Usage:
 *   app.use('/protected', createPaywall({ ... }))
 */
export function createPaywall(options) {
    const config = {
        mainlayerApiKey: options.apiKey,
        resourceId: options.resourceId,
        upstreamUrl: options.upstream,
        port: 3000,
        checkInterval: options.checkInterval ?? 60,
        priceUsdc: options.priceUsdc ?? 0.01,
    };
    const paywallService = new PaywallService(config);
    const proxyMiddleware = buildProxyMiddleware(config);
    const authMiddleware = async (req, res, next) => {
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
        }
        catch (err) {
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
    return [authMiddleware, proxyMiddleware];
}
/**
 * Build a configured http-proxy-middleware instance targeting the upstream URL.
 */
export function buildProxyMiddleware(config) {
    return createProxyMiddleware({
        target: config.upstreamUrl,
        changeOrigin: true,
        on: {
            error: (err, _req, res) => {
                console.error('[mainlayer-paywall] Proxy error:', err.message);
                if (!('headersSent' in res && res.headersSent)) {
                    res.status(502).json({
                        error: 'bad_gateway',
                        message: 'Upstream service is unavailable.',
                    });
                }
            },
        },
    });
}
/**
 * Extract the payer wallet identifier from the incoming request.
 * Reads `X-Payer-Wallet` header (primary) and falls back to
 * a `payer_wallet` query parameter for CLI/browser convenience.
 */
export function extractPayerWallet(req) {
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
//# sourceMappingURL=middleware.js.map