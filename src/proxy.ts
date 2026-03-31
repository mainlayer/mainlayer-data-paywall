import express from 'express';
import type { Express } from 'express';
import { createPaywall, buildProxyMiddleware } from './middleware.js';
import { PaywallService } from './paywall.js';
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
export function buildProxyApp(options: ProxyServerOptions): Express {
  const { config, paywallDisabled = false } = options;

  const app = express();

  // Health check endpoint — no auth required
  app.get('/_health', (_req, res) => {
    res.json({ status: 'ok', resource_id: config.resourceId });
  });

  // Paywall info endpoint — lets agents discover payment requirements
  // without making a full request to the upstream
  app.get('/_paywall', (_req, res) => {
    const paywallService = new PaywallService(config);
    res.json({
      resource_id: config.resourceId,
      price_usdc: config.priceUsdc,
      pay_url: 'https://api.mainlayer.fr/pay',
      facilitator_url: 'https://api.mainlayer.fr/facilitator',
      docs: 'https://docs.mainlayer.fr',
    });
  });

  if (paywallDisabled) {
    // Pass-through mode
    app.use('/', buildProxyMiddleware(config));
  } else {
    // Protected mode — all other routes go through the paywall
    app.use(
      '/',
      ...createPaywall({
        resourceId: config.resourceId,
        upstream: config.upstreamUrl,
        apiKey: config.mainlayerApiKey,
        checkInterval: config.checkInterval,
        priceUsdc: config.priceUsdc,
      })
    );
  }

  return app;
}

export interface RunningServer {
  close: () => Promise<void>;
  port: number;
}

/**
 * Start the proxy server on the configured port.
 * Returns a handle that can shut down the server gracefully.
 */
export function startProxyServer(options: ProxyServerOptions): Promise<RunningServer> {
  const app = buildProxyApp(options);
  const { port } = options.config;

  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;

      console.log(`[mainlayer-paywall] Listening on port ${actualPort}`);
      console.log(`[mainlayer-paywall] Resource: ${options.config.resourceId}`);
      console.log(`[mainlayer-paywall] Upstream: ${options.config.upstreamUrl}`);
      console.log(`[mainlayer-paywall] Health: http://localhost:${actualPort}/_health`);
      console.log(`[mainlayer-paywall] Paywall info: http://localhost:${actualPort}/_paywall`);

      resolve({
        port: actualPort,
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });

    server.on('error', reject);
  });
}
