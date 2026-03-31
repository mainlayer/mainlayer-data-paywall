import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PaywallService, EntitlementCheckError } from '../src/paywall.js';
import { extractPayerWallet } from '../src/middleware.js';
import { loadConfig, validateConfig } from '../src/config.js';
import type { Request } from 'express';

// ─── PaywallService ───────────────────────────────────────────────────────────

const baseConfig = {
  mainlayerApiKey: 'ml_test_key',
  resourceId: 'res_test123',
  upstreamUrl: 'http://localhost:8000',
  port: 3000,
  checkInterval: 60,
  priceUsdc: 0.01,
};

describe('PaywallService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('buildPaymentRequiredBody', () => {
    it('returns a well-formed 402 body', () => {
      const service = new PaywallService(baseConfig);
      const body = service.buildPaymentRequiredBody();

      expect(body.error).toBe('payment_required');
      expect(body.resource_id).toBe('res_test123');
      expect(body.price_usdc).toBe(0.01);
      expect(body.pay_url).toBe('https://api.mainlayer.fr/pay');
      expect(body.facilitator_url).toBe('https://api.mainlayer.fr/facilitator');
      expect(body.message).toBeTruthy();
    });
  });

  describe('checkEntitlement', () => {
    it('returns granted=true when API responds with granted', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ granted: true, expires_at: Date.now() + 3600000 }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const service = new PaywallService(baseConfig);
      const result = await service.checkEntitlement('wallet_abc');

      expect(result.granted).toBe(true);
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('returns granted=false when API responds with denied', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ granted: false, reason: 'no_entitlement' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const service = new PaywallService(baseConfig);
      const result = await service.checkEntitlement('wallet_xyz');

      expect(result.granted).toBe(false);
      expect(result.reason).toBe('no_entitlement');
    });

    it('caches results and avoids duplicate API calls', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ granted: true }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const service = new PaywallService({ ...baseConfig, checkInterval: 60 });

      await service.checkEntitlement('wallet_cached');
      await service.checkEntitlement('wallet_cached');
      await service.checkEntitlement('wallet_cached');

      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('makes a new API call after cache TTL expires', async () => {
      vi.useFakeTimers();

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ granted: true }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const service = new PaywallService({ ...baseConfig, checkInterval: 1 }); // 1 second TTL

      await service.checkEntitlement('wallet_ttl');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(2000); // advance past TTL

      await service.checkEntitlement('wallet_ttl');
      expect(fetchMock).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('throws EntitlementCheckError on network failure', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      vi.stubGlobal('fetch', fetchMock);

      const service = new PaywallService(baseConfig);

      await expect(service.checkEntitlement('wallet_err')).rejects.toThrow(
        EntitlementCheckError
      );
    });

    it('throws EntitlementCheckError when API returns non-OK status', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });
      vi.stubGlobal('fetch', fetchMock);

      const service = new PaywallService(baseConfig);

      await expect(service.checkEntitlement('wallet_401')).rejects.toThrow(
        EntitlementCheckError
      );
    });

    it('sends Authorization header with API key', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ granted: true }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const service = new PaywallService(baseConfig);
      await service.checkEntitlement('wallet_auth');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>)['Authorization']).toBe(
        'Bearer ml_test_key'
      );
      expect(url).toContain('resource_id=res_test123');
      expect(url).toContain('payer_wallet=wallet_auth');
    });
  });

  describe('invalidateCache', () => {
    it('forces a fresh API call after invalidation', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ granted: true }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const service = new PaywallService(baseConfig);

      await service.checkEntitlement('wallet_inv');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      service.invalidateCache('wallet_inv');

      await service.checkEntitlement('wallet_inv');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});

// ─── extractPayerWallet ───────────────────────────────────────────────────────

describe('extractPayerWallet', () => {
  const makeReq = (
    headers: Record<string, string> = {},
    query: Record<string, string> = {}
  ) =>
    ({
      headers,
      query,
    }) as unknown as Request;

  it('reads X-Payer-Wallet header', () => {
    const req = makeReq({ 'x-payer-wallet': 'wallet_header' });
    expect(extractPayerWallet(req)).toBe('wallet_header');
  });

  it('trims whitespace from header value', () => {
    const req = makeReq({ 'x-payer-wallet': '  wallet_trimmed  ' });
    expect(extractPayerWallet(req)).toBe('wallet_trimmed');
  });

  it('falls back to query parameter when header is absent', () => {
    const req = makeReq({}, { payer_wallet: 'wallet_query' });
    expect(extractPayerWallet(req)).toBe('wallet_query');
  });

  it('returns null when neither header nor query param present', () => {
    const req = makeReq();
    expect(extractPayerWallet(req)).toBeNull();
  });

  it('prefers header over query param when both present', () => {
    const req = makeReq(
      { 'x-payer-wallet': 'header_wallet' },
      { payer_wallet: 'query_wallet' }
    );
    expect(extractPayerWallet(req)).toBe('header_wallet');
  });
});

// ─── Config ───────────────────────────────────────────────────────────────────

describe('loadConfig', () => {
  afterEach(() => {
    delete process.env.MAINLAYER_API_KEY;
    delete process.env.MAINLAYER_RESOURCE_ID;
    delete process.env.UPSTREAM_URL;
    delete process.env.PORT;
    delete process.env.CHECK_INTERVAL;
    delete process.env.PRICE_USDC;
  });

  it('reads values from environment variables', () => {
    process.env.MAINLAYER_API_KEY = 'env_key';
    process.env.MAINLAYER_RESOURCE_ID = 'env_res';
    process.env.UPSTREAM_URL = 'http://env-upstream.com';

    const config = loadConfig();

    expect(config.mainlayerApiKey).toBe('env_key');
    expect(config.resourceId).toBe('env_res');
    expect(config.upstreamUrl).toBe('http://env-upstream.com');
  });

  it('overrides apply over environment variables', () => {
    process.env.MAINLAYER_API_KEY = 'env_key';

    const config = loadConfig({ mainlayerApiKey: 'override_key' });

    expect(config.mainlayerApiKey).toBe('override_key');
  });

  it('uses defaults for optional values', () => {
    const config = loadConfig();

    expect(config.port).toBe(3000);
    expect(config.checkInterval).toBe(60);
    expect(config.priceUsdc).toBe(0.01);
  });
});

describe('validateConfig', () => {
  it('throws when required fields are missing', () => {
    expect(() =>
      validateConfig({
        mainlayerApiKey: '',
        resourceId: '',
        upstreamUrl: '',
        port: 3000,
        checkInterval: 60,
        priceUsdc: 0.01,
      })
    ).toThrow('Missing required configuration');
  });

  it('throws when upstreamUrl is not a valid URL', () => {
    expect(() =>
      validateConfig({
        mainlayerApiKey: 'key',
        resourceId: 'res',
        upstreamUrl: 'not-a-url',
        port: 3000,
        checkInterval: 60,
        priceUsdc: 0.01,
      })
    ).toThrow('Invalid upstreamUrl');
  });

  it('does not throw for valid config', () => {
    expect(() =>
      validateConfig({
        mainlayerApiKey: 'key',
        resourceId: 'res',
        upstreamUrl: 'http://localhost:8000',
        port: 3000,
        checkInterval: 60,
        priceUsdc: 0.01,
      })
    ).not.toThrow();
  });
});
