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

const DEFAULT_PORT = 3000;
const DEFAULT_CHECK_INTERVAL = 60;
const DEFAULT_PRICE_USDC = 0.01;

export function loadConfig(overrides: PartialPaywallConfig = {}): PaywallConfig {
  const mainlayerApiKey =
    overrides.mainlayerApiKey ?? process.env.MAINLAYER_API_KEY ?? '';
  const resourceId =
    overrides.resourceId ?? process.env.MAINLAYER_RESOURCE_ID ?? '';
  const upstreamUrl =
    overrides.upstreamUrl ?? process.env.UPSTREAM_URL ?? '';
  const port =
    overrides.port ??
    (process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_PORT);
  const checkInterval =
    overrides.checkInterval ??
    (process.env.CHECK_INTERVAL
      ? parseInt(process.env.CHECK_INTERVAL, 10)
      : DEFAULT_CHECK_INTERVAL);
  const priceUsdc =
    overrides.priceUsdc ??
    (process.env.PRICE_USDC ? parseFloat(process.env.PRICE_USDC) : DEFAULT_PRICE_USDC);

  return {
    mainlayerApiKey,
    resourceId,
    upstreamUrl,
    port,
    checkInterval,
    priceUsdc,
  };
}

export function validateConfig(config: PaywallConfig): void {
  const missing: string[] = [];

  if (!config.mainlayerApiKey) missing.push('mainlayerApiKey (MAINLAYER_API_KEY)');
  if (!config.resourceId) missing.push('resourceId (MAINLAYER_RESOURCE_ID)');
  if (!config.upstreamUrl) missing.push('upstreamUrl (UPSTREAM_URL)');

  if (missing.length > 0) {
    throw new Error(
      `Missing required configuration: ${missing.join(', ')}`
    );
  }

  try {
    new URL(config.upstreamUrl);
  } catch {
    throw new Error(`Invalid upstreamUrl: "${config.upstreamUrl}" is not a valid URL`);
  }

  if (config.port < 1 || config.port > 65535) {
    throw new Error(`Invalid port: ${config.port}`);
  }
}
