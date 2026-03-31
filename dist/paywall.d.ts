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
export declare class PaywallService {
    private readonly config;
    private readonly cache;
    private readonly ttlMs;
    constructor(config: PaywallConfig);
    /**
     * Check whether a payer wallet has a valid entitlement for the configured resource.
     * Results are cached in-memory for `checkInterval` seconds to avoid hammering the API.
     */
    checkEntitlement(payerWallet: string): Promise<EntitlementResult>;
    /**
     * Build the 402 Payment Required response body.
     */
    buildPaymentRequiredBody(): PaymentRequiredResponse;
    /**
     * Invalidate the cached entitlement for a specific wallet.
     * Useful if you want to force a re-check after payment.
     */
    invalidateCache(payerWallet: string): void;
    /** Remove all expired cache entries. */
    pruneCache(): void;
    private fetchEntitlement;
}
export declare class EntitlementCheckError extends Error {
    readonly cause: Error | null;
    readonly statusCode?: number | undefined;
    constructor(message: string, cause: Error | null, statusCode?: number | undefined);
}
//# sourceMappingURL=paywall.d.ts.map