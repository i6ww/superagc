import { describe, expect, it } from 'vitest';
import { AssetSource, AssetType, type Asset } from '../../types/asset.types';
import {
  ASSET_URI_PREFIX,
  buildAssetEmbedMarkdown,
  extractAssetIdFromUrl,
  hasAssetEmbed,
} from '../markdown-asset-embeds';

function createAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-1',
    type: AssetType.IMAGE,
    source: AssetSource.LOCAL,
    url: '/asset-library/content-hash.png',
    name: '示例素材',
    mimeType: 'image/png',
    createdAt: 1,
    ...overrides,
  };
}

describe('markdown-asset-embeds', () => {
  it('builds asset embed markdown for images', () => {
    expect(buildAssetEmbedMarkdown(createAsset())).toBe(`![image|示例素材](${ASSET_URI_PREFIX}asset-1)`);
  });

  it('builds asset embed markdown for non-image assets with type hint', () => {
    const video = createAsset({ id: 'video-1', type: AssetType.VIDEO, name: '演示视频' });
    const audio = createAsset({ id: 'audio-1', type: AssetType.AUDIO, name: '演示音频' });

    expect(buildAssetEmbedMarkdown(video)).toBe(`![video|演示视频](${ASSET_URI_PREFIX}video-1)`);
    expect(buildAssetEmbedMarkdown(audio)).toBe(`![audio|演示音频](${ASSET_URI_PREFIX}audio-1)`);
  });

  it('extracts asset id from asset protocol urls', () => {
    expect(extractAssetIdFromUrl('asset://foo-bar?x=1')).toBe('foo-bar');
    expect(extractAssetIdFromUrl('/asset-library/content.png')).toBeNull();
  });

  it('detects markdown containing asset embeds', () => {
    expect(hasAssetEmbed('普通文本')).toBe(false);
    expect(hasAssetEmbed('![image|示例](asset://asset-1)')).toBe(true);
  });
});
