#!/usr/bin/env node

/**
 * mainlayer-data-paywall
 *
 * Universal reverse proxy that puts a Mainlayer paywall in front of any data source,
 * enabling AI agents to autonomously pay for access.
 *
 * CLI usage:
 *   npx mainlayer-data-paywall \
 *     --resource-id res_abc123 \
 *     --upstream https://my-api.com \
 *     --api-key ml_... \
 *     --port 3000
 *
 * Programmatic usage:
 *   import { createPaywall } from 'mainlayer-data-paywall'
 *   app.use('/protected', createPaywall({ ... }))
 */

import { loadConfig, validateConfig } from './config.js';
import { startProxyServer } from './proxy.js';

// Re-export the public API
export { createPaywall } from './middleware.js';
export { buildProxyApp, startProxyServer } from './proxy.js';
export { PaywallService, EntitlementCheckError } from './paywall.js';
export type { PaywallConfig, PartialPaywallConfig } from './config.js';
export type { EntitlementResult, PaymentRequiredResponse } from './paywall.js';
export type { CreatePaywallOptions } from './middleware.js';

// ─── CLI entry point ──────────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = 'true';
      }
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`
mainlayer-data-paywall — put a Mainlayer paywall in front of any data source

USAGE
  npx mainlayer-data-paywall [options]

OPTIONS
  --resource-id <id>     Mainlayer resource ID (required)
  --upstream <url>       Upstream data source URL (required)
  --api-key <key>        Mainlayer API key (required)
  --port <number>        Port to listen on (default: 3000)
  --price-usdc <number>  Price per access in USDC (default: 0.01)
  --check-interval <s>   Entitlement cache TTL in seconds (default: 60)
  --no-paywall           Disable paywall — proxy all requests through (debug)
  --help                 Show this help message

ENVIRONMENT VARIABLES
  MAINLAYER_API_KEY      Mainlayer API key
  MAINLAYER_RESOURCE_ID  Resource ID
  UPSTREAM_URL           Upstream data source URL
  PORT                   Port to listen on
  PRICE_USDC             Price per access in USDC
  CHECK_INTERVAL         Entitlement cache TTL in seconds

EXAMPLES
  npx mainlayer-data-paywall \\
    --resource-id res_abc123 \\
    --upstream https://my-api.com \\
    --api-key ml_sk_... \\
    --port 3000

  MAINLAYER_API_KEY=ml_sk_... \\
  MAINLAYER_RESOURCE_ID=res_abc123 \\
  UPSTREAM_URL=http://localhost:8000 \\
  npx mainlayer-data-paywall
`);
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const args = parseArgs(rawArgs);

  if ('help' in args || 'h' in args) {
    printHelp();
    process.exit(0);
  }

  const config = loadConfig({
    mainlayerApiKey: args['api-key'],
    resourceId: args['resource-id'],
    upstreamUrl: args['upstream'],
    port: args['port'] ? parseInt(args['port'], 10) : undefined,
    checkInterval: args['check-interval'] ? parseInt(args['check-interval'], 10) : undefined,
    priceUsdc: args['price-usdc'] ? parseFloat(args['price-usdc']) : undefined,
  });

  const paywallDisabled = 'no-paywall' in args;

  if (!paywallDisabled) {
    try {
      validateConfig(config);
    } catch (err) {
      console.error('[mainlayer-paywall] Configuration error:', (err as Error).message);
      console.error('Run with --help for usage information.');
      process.exit(1);
    }
  }

  const server = await startProxyServer({ config, paywallDisabled });

  const shutdown = async (signal: string) => {
    console.log(`\n[mainlayer-paywall] Received ${signal}, shutting down...`);
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[mainlayer-paywall] Fatal error:', err);
  process.exit(1);
});
