/**
 * Example: Protect an existing API with a Mainlayer paywall
 *
 * This example shows how to embed the paywall as Express middleware
 * in an existing application.
 *
 * Run:
 *   MAINLAYER_API_KEY=ml_sk_... ts-node examples/protect-api.ts
 */

import express from 'express';
import { createPaywall } from '../src/index.js';

const app = express();

// Public routes — no paywall
app.get('/', (_req, res) => {
  res.json({
    message: 'Welcome. Access /api/data for premium data.',
    how_to_pay: 'https://docs.mainlayer.fr/quickstart',
  });
});

// Protected route — Mainlayer paywall sits in front of the upstream API
//
// The paywall middleware:
//  1. Reads X-Payer-Wallet from the incoming request
//  2. Calls api.mainlayer.fr/entitlements/check
//  3. Returns 402 if not entitled, or proxies through if entitled
app.use(
  '/api/data',
  ...createPaywall({
    resourceId: process.env.MAINLAYER_RESOURCE_ID ?? 'res_example',
    upstream: 'https://jsonplaceholder.typicode.com',
    apiKey: process.env.MAINLAYER_API_KEY ?? 'ml_sk_demo',
    priceUsdc: 0.01,
    checkInterval: 60,
  })
);

const PORT = parseInt(process.env.PORT ?? '3001', 10);
app.listen(PORT, () => {
  console.log(`Example server listening on http://localhost:${PORT}`);
  console.log('');
  console.log('Try these requests:');
  console.log('  # Without payment — expect 402:');
  console.log(`  curl http://localhost:${PORT}/api/data/todos/1`);
  console.log('');
  console.log('  # With a valid payer wallet — expect data:');
  console.log(`  curl -H "X-Payer-Wallet: wallet_abc123" http://localhost:${PORT}/api/data/todos/1`);
});
