import { providerPricingCacheSettings } from './settings-manager';
import type {
  ModelPrice,
  PricingApiResponse,
  PricingGroup,
  PricingGroupPrice,
  ProviderPricingCache,
} from './model-pricing-types';

type PricingListener = () => void;

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

function computeModelPrice(
  gp: PricingGroupPrice,
  groupRatio: number,
  cnyPerUsd: number
): ModelPrice {
  // quota_type=1: token 计费（用 model_ratio）
  if (gp.quota_type === 1) {
    const inputUsd = round4(gp.model_ratio * 2 * groupRatio);
    const outputUsd = round4(gp.model_ratio * 2 * gp.model_completion_ratio * groupRatio);
    return {
      inputCnyMtok: round4(inputUsd * cnyPerUsd),
      outputCnyMtok: round4(outputUsd * cnyPerUsd),
      flatCny: null,
      billingType: 'token',
    };
  }
  // quota_type=0: 按次计费, quota_type=2: 按秒计费（都用 model_price）
  const flatUsd = round4(gp.model_price * groupRatio);
  return {
    inputCnyMtok: null,
    outputCnyMtok: null,
    flatCny: round4(flatUsd * cnyPerUsd),
    billingType: gp.quota_type === 2 ? 'per-second' : 'flat',
  };
}

export function formatModelPrice(price: ModelPrice): string {
  if (price.billingType === 'per-second' && price.flatCny != null && price.flatCny > 0) {
    return `¥${price.flatCny.toFixed(2)}/秒`;
  }
  if (price.billingType === 'flat' && price.flatCny != null && price.flatCny > 0) {
    return `¥${price.flatCny.toFixed(2)}/次`;
  }
  if (
    price.billingType === 'token' &&
    price.inputCnyMtok != null &&
    price.outputCnyMtok != null &&
    (price.inputCnyMtok > 0 || price.outputCnyMtok > 0)
  ) {
    return `¥${price.inputCnyMtok.toFixed(2)}/¥${price.outputCnyMtok.toFixed(2)} 百万token`;
  }
  return '';
}

class ModelPricingService {
  private cacheMap = new Map<string, ProviderPricingCache>();
  private listeners = new Set<PricingListener>();

  constructor() {
    const saved = providerPricingCacheSettings.get();
    if (Array.isArray(saved)) {
      saved.forEach((c) => this.cacheMap.set(c.profileId, c));
    }
  }

  subscribe(listener: PricingListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  async fetchAndCache(
    profileId: string,
    pricingUrl: string,
    apiKey: string,
    groupName: string,
    cnyPerUsd: number
  ): Promise<ProviderPricingCache> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    const response = await fetch(pricingUrl, { headers });
    if (!response.ok) {
      throw new Error(`Pricing API error: ${response.status}`);
    }
    const json = (await response.json()) as PricingApiResponse;
    if (!json.data?.group_info || !json.data?.model_info) {
      throw new Error('Invalid pricing API response');
    }

    const groups: PricingGroup[] = Object.entries(json.data.group_info).map(
      ([name, info]) => ({
        name,
        displayName: info.DisplayName || name,
        ratio: info.GroupRatio ?? 1,
      })
    );

    const effectiveGroup = groupName || 'default';
    const groupInfo = json.data.group_info[effectiveGroup];
    const groupRatio = groupInfo?.GroupRatio ?? 1;

    const prices: Record<string, ModelPrice> = {};
    for (const model of json.data.model_info) {
      const groupPrices = model.price_info?.[effectiveGroup];
      const gp: PricingGroupPrice | undefined = groupPrices?.['default'];
      if (!gp) continue;
      const firstDocs = Object.values(model.endpoints || {}).find((ep) => ep.docs)?.docs;
      prices[model.model_name] = {
        ...computeModelPrice(gp, groupRatio, cnyPerUsd),
        description: model.description || undefined,
        docsUrl: firstDocs || undefined,
      };
    }

    const cache: ProviderPricingCache = {
      profileId,
      fetchedAt: Date.now(),
      groups,
      prices,
    };

    this.cacheMap.set(profileId, cache);
    this.persist();
    this.notify();
    return cache;
  }

  getCache(profileId: string): ProviderPricingCache | null {
    return this.cacheMap.get(profileId) ?? null;
  }

  getModelPrice(profileId: string | undefined | null, modelId: string): ModelPrice | null {
    if (!profileId) return null;
    return this.cacheMap.get(profileId)?.prices[modelId] ?? null;
  }

  getGroups(profileId: string): PricingGroup[] {
    return this.cacheMap.get(profileId)?.groups ?? [];
  }

  removeCache(profileId: string): void {
    if (this.cacheMap.delete(profileId)) {
      this.persist();
      this.notify();
    }
  }

  getVersion(): number {
    return this.cacheMap.size;
  }

  private persist(): void {
    const caches = Array.from(this.cacheMap.values());
    void providerPricingCacheSettings.update(caches);
  }
}

export const modelPricingService = new ModelPricingService();
