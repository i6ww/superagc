import { useSyncExternalStore } from 'react';
import { modelPricingService, formatModelPrice } from '../utils/model-pricing-service';
import type { ModelPrice, PricingGroup } from '../utils/model-pricing-types';

export function useModelPrice(
  profileId: string | undefined | null,
  modelId: string
): ModelPrice | null {
  const version = useSyncExternalStore(
    (cb) => modelPricingService.subscribe(cb),
    () => modelPricingService.getVersion()
  );
  void version;
  return modelPricingService.getModelPrice(profileId, modelId);
}

export function useFormattedModelPrice(
  profileId: string | undefined | null,
  modelId: string
): string {
  const price = useModelPrice(profileId, modelId);
  return price ? formatModelPrice(price) : '';
}

export function usePricingGroups(profileId: string | undefined): PricingGroup[] {
  const version = useSyncExternalStore(
    (cb) => modelPricingService.subscribe(cb),
    () => modelPricingService.getVersion()
  );
  void version;
  return profileId ? modelPricingService.getGroups(profileId) : [];
}

export function useModelMeta(
  profileId: string | undefined | null,
  modelId: string
): { description?: string; docsUrl?: string } | null {
  const price = useModelPrice(profileId, modelId);
  if (!price) return null;
  if (!price.description && !price.docsUrl) return null;
  return { description: price.description, docsUrl: price.docsUrl };
}
