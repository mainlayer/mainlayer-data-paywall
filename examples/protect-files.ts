/**
 * Example: Protect file downloads with a Mainlayer paywall
 *
 * This example wraps a static file server (e.g. an S3-compatible endpoint
 * or any URL that serves files) behind the paywall.
 *
 * Run:
 *   MAINLAYER_API_KEY=ml_sk_... ts-node examples/protect-files.ts
 */

import express from 'express';
import { createPaywall } from '../src/index.js';

const UPSTREAM_FILES_URL =
  process.env.UPSTREAM_URL ?? 'https://storage.example.com/datasets';

const app = express();

// Paywall-protected file download endpoint.
// Every unique (resource_id, payer_wallet) pair is checked once per minute.
// After payment, the agent's wallet is entitled and downloads go straight through.
app.use(
  '/files',
  ...createPaywall({
    resourceId: process.env.MAINLAYER_RESOURCE_ID ?? 'res_files_example',
    upstream: UPSTREAM_FILES_URL,
    apiKey: process.env.MAINLAYER_API_KEY ?? 'ml_sk_demo',
    priceUsdc: 0.05,        // $0.05 per access — more expensive for datasets
    checkInterval: 300,     // Cache entitlements for 5 minutes
  })
);

// Info endpoint
app.get('/', (_req, res) => {
  res.json({
    message: 'File download paywall example',
    protected_path: '/files/*',
    how_to_pay: 'https://docs.mainlayer.xyz',
  });
});

const PORT = parseInt(process.env.PORT ?? '3002', 10);
app.listen(PORT, () => {
  console.log(`File paywall example listening on http://localhost:${PORT}`);
  console.log('');
  console.log('  # Without payment — expect 402:');
  console.log(`  curl http://localhost:${PORT}/files/dataset.csv`);
  console.log('');
  console.log('  # With a valid payer wallet:');
  console.log(
    `  curl -H "X-Payer-Wallet: wallet_abc123" http://localhost:${PORT}/files/dataset.csv`
  );
});
