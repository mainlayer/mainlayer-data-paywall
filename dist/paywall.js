const MAINLAYER_API_BASE = 'https://api.mainlayer.xyz';
export class PaywallService {
    config;
    cache = new Map();
    ttlMs;
    constructor(config) {
        this.config = config;
        // checkInterval is in seconds; convert to ms
        this.ttlMs = (config.checkInterval ?? 60) * 1000;
    }
    /**
     * Check whether a payer wallet has a valid entitlement for the configured resource.
     * Results are cached in-memory for `checkInterval` seconds to avoid hammering the API.
     */
    async checkEntitlement(payerWallet) {
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
    buildPaymentRequiredBody() {
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
    invalidateCache(payerWallet) {
        const cacheKey = `${this.config.resourceId}:${payerWallet}`;
        this.cache.delete(cacheKey);
    }
    /** Remove all expired cache entries. */
    pruneCache() {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.cachedAt >= this.ttlMs) {
                this.cache.delete(key);
            }
        }
    }
    async fetchEntitlement(payerWallet) {
        const url = new URL(`${MAINLAYER_API_BASE}/entitlements/check`);
        url.searchParams.set('resource_id', this.config.resourceId);
        url.searchParams.set('payer_wallet', payerWallet);
        let response;
        try {
            response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${this.config.mainlayerApiKey}`,
                    Accept: 'application/json',
                },
            });
        }
        catch (err) {
            // Network error — fail closed (deny access) and surface the error
            throw new EntitlementCheckError('Failed to reach Mainlayer API', err instanceof Error ? err : new Error(String(err)));
        }
        if (!response.ok) {
            // 401/403 likely means a bad API key; other errors are transient
            const body = await response.text().catch(() => '');
            throw new EntitlementCheckError(`Mainlayer API returned ${response.status}: ${body}`, null, response.status);
        }
        const data = (await response.json());
        return {
            granted: Boolean(data.granted),
            expiresAt: data.expires_at,
            reason: data.reason,
        };
    }
}
export class EntitlementCheckError extends Error {
    cause;
    statusCode;
    constructor(message, cause, statusCode) {
        super(message);
        this.cause = cause;
        this.statusCode = statusCode;
        this.name = 'EntitlementCheckError';
    }
}
//# sourceMappingURL=paywall.js.map