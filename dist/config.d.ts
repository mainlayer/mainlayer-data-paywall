export interface PaywallConfig {
    mainlayerApiKey: string;
    resourceId: string;
    upstreamUrl: string;
    port: number;
    checkInterval: number;
    priceUsdc: number;
}
export interface PartialPaywallConfig {
    mainlayerApiKey?: string;
    resourceId?: string;
    upstreamUrl?: string;
    port?: number;
    checkInterval?: number;
    priceUsdc?: number;
}
export declare function loadConfig(overrides?: PartialPaywallConfig): PaywallConfig;
export declare function validateConfig(config: PaywallConfig): void;
//# sourceMappingURL=config.d.ts.map