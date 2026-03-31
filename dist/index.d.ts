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
export { createPaywall } from './middleware.js';
export { buildProxyApp, startProxyServer } from './proxy.js';
export { PaywallService, EntitlementCheckError } from './paywall.js';
export type { PaywallConfig, PartialPaywallConfig } from './config.js';
export type { EntitlementResult, PaymentRequiredResponse } from './paywall.js';
export type { CreatePaywallOptions } from './middleware.js';
//# sourceMappingURL=index.d.ts.map