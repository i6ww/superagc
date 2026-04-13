import { describe, expect, it } from 'vitest';
import { AssetSource, AssetType, type Asset } from '../../types/asset.types';
import {
  extractContentHashFromUrl,
  getAssetContentHash,
  getLocalAssetGroupKey,
  normalizeAssetUrl,
} from '../asset-dedupe';

const HASH = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function createAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-1',
    type: AssetType.IMAGE,
    source: AssetSource.LOCAL,
    url: `/asset-library/content-${HASH}.png`,
    name: 'asset',
    mimeType: 'image/png',
    createdAt: 1,
    ...overrides,
  };
}

describe('asset-dedupe', () => {
  it('normalizes absolute URLs to pathname', () => {
    expect(normalizeAssetUrl(`https://example.com/__aitu_cache__/image/content-${HASH}.png?x=1`))
      .toBe(`/__aitu_cache__/image/content-${HASH}.png`);
  });

  it('extracts content hash from content addressed URL', () => {
    expect(extractContentHashFromUrl(`/asset-library/content-${HASH}.png`)).toBe(HASH);
    expect(extractContentHashFromUrl(`/__aitu_cache__/image/content-${HASH}-cover.png`)).toBe(HASH);
  });

  it('prefers explicit asset content hash', () => {
    expect(getAssetContentHash(createAsset({ contentHash: HASH }))).toBe(HASH);
  });

  it('uses the same local group key for same-content local assets', () => {
    const first = createAsset({ id: 'asset-1' });
    const second = createAsset({
      id: 'asset-2',
      url: `https://example.com/__aitu_cache__/image/content-${HASH}.png`,
    });

    expect(getLocalAssetGroupKey(first)).toBe(getLocalAssetGroupKey(second));
  });

  it('does not group ai assets into local dedupe domain', () => {
    const aiAsset = createAsset({
      source: AssetSource.AI_GENERATED,
      url: `/__aitu_cache__/image/content-${HASH}.png`,
    });

    expect(getLocalAssetGroupKey(aiAsset)).toBeNull();
  });
});
