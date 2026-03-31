import type { PaywallConfig } from './config.js';

export interface EntitlementResult {
  granted: boolean;
  expiresAt?: number;
  reason?: string;
}

export interface PaymentRequiredResponse {
  error: 'payment_required';
  message: string;
  resource_id: string;
  price_usdc: number;
  pay_url: string;
  facilitator_url: string;
}

interface CacheEntry {
  result: EntitlementResult;
  cachedAt: number;
}

const MAINLAYER_API_BASE = 'https://api.mainlayer.fr';

export class PaywallService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(private readonly config: PaywallConfig) {
    // checkInterval is in seconds; convert to ms
    this.ttlMs = (config.checkInterval ?? 60) * 1000;
  }

  /**
   * Check whether a payer wallet has a valid entitlement for the configured resource.
   * Results are cached in-memory for `checkInterval` seconds to avoid hammering the API.
   */
  async checkEntitlement(payerWallet: string): Promise<EntitlementResult> {
    const cacheKey = `${this.config.resourceId}:${payerWallet}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.cachedAt < this.ttlMs) {
      return cached.result;
    }

    const result = await this.fetchEntitlement(payerWallet);
    this.cache.set(cacheKey, { result, cachedAt: Date.now() });
    return result;
  }

  /**
   * Build the 402 Payment Required response body.
   */
  buildPaymentRequiredBody(): PaymentRequiredResponse {
    return {
      error: 'payment_required',
      message: 'Access to this resource requires payment',
      resource_id: this.config.resourceId,
      price_usdc: this.config.priceUsdc,
      pay_url: `${MAINLAYER_API_BASE}/pay`,
      facilitator_url: `${MAINLAYER_API_BASE}/facilitator`,
    };
  }

  /**
   * Invalidate the cached entitlement for a specific wallet.
   * Useful if you want to force a re-check after payment.
   */
  invalidateCache(payerWallet: string): void {
    const cacheKey = `${this.config.resourceId}:${payerWallet}`;
    this.cache.delete(cacheKey);
  }

  /** Remove all expired cache entries. */
  pruneCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.cachedAt >= this.ttlMs) {
        this.cache.delete(key);
      }
    }
  }

  private async fetchEntitlement(payerWallet: string): Promise<EntitlementResult> {
    const url = new URL(`${MAINLAYER_API_BASE}/entitlements/check`);
    url.searchParams.set('resource_id', this.config.resourceId);
    url.searchParams.set('payer_wallet', payerWallet);

    let response: Response;

    try {
      response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.mainlayerApiKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10000), // 10s timeout to prevent hanging
      });
    } catch (err) {
      // Network error — fail closed (deny access) and surface the error
      const cause = err instanceof Error ? err : new Error(String(err));
      throw new EntitlementCheckError(
        `Failed to reach Mainlayer API: ${cause.message}`,
        cause
      );
    }

    if (!response.ok) {
      // 401/403 likely means a bad API key; other errors are transient
      const body = await response.text().catch(() => '(no response body)');
      throw new EntitlementCheckError(
        `Mainlayer API error (${response.status}): ${body}`,
        null,
        response.status
      );
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch (err) {
      throw new EntitlementCheckError(
        'Mainlayer API response was not valid JSON',
        err instanceof Error ? err : null
      );
    }

    // Safely extract entitlement data with type guards
    const entitlementData = data as Record<string, unknown>;
    return {
      granted: Boolean(entitlementData.granted),
      expiresAt: typeof entitlementData.expires_at === 'number' ? entitlementData.expires_at : undefined,
      reason: typeof entitlementData.reason === 'string' ? entitlementData.reason : undefined,
    };
  }
}

export class EntitlementCheckError extends Error {
  constructor(
    message: string,
    public readonly cause: Error | null,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'EntitlementCheckError';
  }
}
