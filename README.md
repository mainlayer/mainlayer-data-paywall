# mainlayer-data-paywall

Universal reverse proxy that puts a **Mainlayer paywall** in front of any data source, enabling AI agents to autonomously pay small amounts to access data.

---

## The Vision

In the agentic web, AI agents autonomously hit data sources — APIs, datasets, streams, files. Instead of requiring pre-configured API keys or human setup, they encounter a Mainlayer payment challenge, pay automatically (e.g., $0.01), and instantly receive the data.

This is pay-per-view for any data source, fully autonomous.

```
AI Agent                   Mainlayer Paywall            Your Data Source
    |                             |                             |
    |-- GET /data/something ----> |                             |
    |                             | (no X-Payer-Wallet header)  |
    | <-- 402 Payment Required -- |                             |
    |     { pay_url, price }      |                             |
    |                             |                             |
    |-- Pay via Mainlayer ------> api.mainlayer.fr             |
    |                             |                             |
    |-- GET /data/something ----> |                             |
    |   X-Payer-Wallet: wallet_x  |                             |
    |                             |-- entitlement check ------> api.mainlayer.fr
    |                             | <-- { granted: true } ----- |
    |                             |-- proxy request ----------> |
    | <-- 200 { data } ---------- | <-- 200 { data } ---------- |
```

---

## Quick Start

Protect any API in 2 minutes:

```bash
# 1. Install (or use npx — no install needed)
npm install -g mainlayer-data-paywall

# 2. Register your resource at app.mainlayer.fr and get:
#    - MAINLAYER_API_KEY
#    - MAINLAYER_RESOURCE_ID

# 3. Start the paywall proxy
npx mainlayer-data-paywall \
  --resource-id res_abc123 \
  --upstream https://my-internal-api.com \
  --api-key ml_sk_... \
  --port 3000
```

Now any request to `http://localhost:3000` without a valid entitlement gets a 402. After paying, include `X-Payer-Wallet` and the request passes straight through to your upstream.

---

## Installation

```bash
npm install mainlayer-data-paywall
```

Requires Node.js 18+.

---

## CLI Usage

```bash
npx mainlayer-data-paywall [options]

Options:
  --resource-id <id>     Mainlayer resource ID (required)
  --upstream <url>       Upstream data source URL (required)
  --api-key <key>        Mainlayer API key (required)
  --port <number>        Port to listen on (default: 3000)
  --price-usdc <number>  Price per access in USDC (default: 0.01)
  --check-interval <s>   Entitlement cache TTL in seconds (default: 60)
  --no-paywall           Disable paywall, proxy all requests through (debug)
  --help                 Show help
```

---

## Programmatic API

Embed the paywall as Express middleware in any existing app:

```typescript
import express from 'express'
import { createPaywall } from 'mainlayer-data-paywall'

const app = express()

// Public routes
app.get('/', (req, res) => res.json({ message: 'Welcome' }))

// Protected routes — Mainlayer paywall sits in front
app.use(
  '/protected',
  ...createPaywall({
    resourceId: 'res_abc123',
    upstream: 'http://my-internal-api',
    apiKey: process.env.MAINLAYER_API_KEY!,
    priceUsdc: 0.01,
    checkInterval: 60,
  })
)

app.listen(3000)
```

### `createPaywall(options)`

Returns an array of Express middleware (`[authMiddleware, proxyMiddleware]`).

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `resourceId` | `string` | Yes | Your Mainlayer resource ID |
| `upstream` | `string` | Yes | Upstream URL to proxy to |
| `apiKey` | `string` | Yes | Your Mainlayer API key |
| `priceUsdc` | `number` | No | Price per access in USDC (default: `0.01`) |
| `checkInterval` | `number` | No | Entitlement cache TTL in seconds (default: `60`) |

---

## How the Payment Flow Works

1. **Agent sends a request** to your paywall proxy (e.g., `GET /data/prices`)
2. **No access?** The proxy returns `402 Payment Required`:
   ```json
   {
     "error": "payment_required",
     "message": "Access to this resource requires payment",
     "resource_id": "res_abc123",
     "price_usdc": 0.01,
     "pay_url": "https://api.mainlayer.fr/pay",
     "facilitator_url": "https://api.mainlayer.fr/facilitator"
   }
   ```
3. **Agent pays** via `pay_url` using its Mainlayer wallet
4. **Agent re-sends request** with `X-Payer-Wallet: <wallet_id>` header
5. **Proxy verifies** entitlement via `api.mainlayer.fr/entitlements/check`
6. **Access granted** — request proxied to upstream, data returned

Entitlement checks are **cached in memory** for `checkInterval` seconds per wallet, so high-frequency agents don't slow down.

---

## Configuration Reference

All config can be set via environment variables or CLI flags.

| Env Variable | CLI Flag | Description | Default |
|---|---|---|---|
| `MAINLAYER_API_KEY` | `--api-key` | Your Mainlayer API key | — |
| `MAINLAYER_RESOURCE_ID` | `--resource-id` | Mainlayer resource ID | — |
| `UPSTREAM_URL` | `--upstream` | Upstream data source URL | — |
| `PORT` | `--port` | Port to listen on | `3000` |
| `PRICE_USDC` | `--price-usdc` | Price per access in USDC | `0.01` |
| `CHECK_INTERVAL` | `--check-interval` | Entitlement cache TTL (seconds) | `60` |

---

## Docker

```bash
docker run \
  -e MAINLAYER_API_KEY=ml_sk_... \
  -e MAINLAYER_RESOURCE_ID=res_abc123 \
  -e UPSTREAM_URL=http://my-api:8000 \
  -p 3000:3000 \
  ghcr.io/mainlayer/data-paywall
```

### Docker Compose

Protect an existing service with a full compose setup:

```yaml
version: '3.9'

services:
  my-api:
    image: my-api-image
    ports:
      - '8000:8000'

  paywall:
    image: ghcr.io/mainlayer/data-paywall:latest
    ports:
      - '3000:3000'
    environment:
      MAINLAYER_API_KEY: ${MAINLAYER_API_KEY}
      MAINLAYER_RESOURCE_ID: ${MAINLAYER_RESOURCE_ID}
      UPSTREAM_URL: http://my-api:8000
    depends_on:
      - my-api
```

See [`examples/docker-compose.yml`](examples/docker-compose.yml) for the full example.

---

## Built-in Endpoints

These endpoints are available on the proxy itself and do not require payment:

| Endpoint | Description |
|---|---|
| `GET /_health` | Health check — returns `{"status":"ok","resource_id":"..."}` |
| `GET /_paywall` | Payment info — returns resource ID, price, and pay URL |

---

## Agent Integration

For AI agents using this paywall, the recommended flow:

1. Make your request normally
2. If you receive `402`, read `pay_url` and `price_usdc` from the response body
3. Pay via Mainlayer using your agent wallet
4. Re-send the request with `X-Payer-Wallet: <your_wallet_id>` header

The `facilitator_url` in the 402 body can be used by agent frameworks that support Mainlayer's autonomous payment facilitation protocol.

---

## Mainlayer Dashboard

Register your data source and manage resources at [app.mainlayer.fr](https://app.mainlayer.fr):

- Create a resource and set a price
- Get your `MAINLAYER_API_KEY` and `MAINLAYER_RESOURCE_ID`
- Monitor payments and entitlements in real time
- Set up webhooks for payment events

Documentation: [docs.mainlayer.fr](https://docs.mainlayer.fr)

---

## Development

```bash
# Install dependencies
npm install

# Run in dev mode (tsx, no build step)
npm run dev

# Build
npm run build

# Test
npm test

# Test with coverage
npm run test:coverage

# Type check
npm run typecheck
```

---

## License

MIT
