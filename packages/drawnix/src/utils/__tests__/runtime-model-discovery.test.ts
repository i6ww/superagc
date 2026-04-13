import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('runtime-model-discovery', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('不会把图片模型钉到音频类型列表里', async () => {
    vi.doMock('../settings-manager', () => ({
      LEGACY_DEFAULT_PROVIDER_PROFILE_ID: 'legacy-default',
      providerCatalogsSettings: {
        get: () => [
          {
            profileId: 'provider-image',
            discoveredAt: Date.now(),
            discoveredModels: [
              {
                id: 'gemini-3-pro-image-preview',
                label: 'Gemini Image',
                shortLabel: 'Gemini Image',
                shortCode: 'gmi',
                type: 'image',
                vendor: 'GEMINI',
              },
            ],
            selectedModelIds: ['gemini-3-pro-image-preview'],
          },
        ],
        addListener: () => {},
        removeListener: () => {},
        update: async () => {},
      },
      providerProfilesSettings: {
        get: () => [
          {
            id: 'provider-image',
            name: '图片供应商',
            enabled: true,
          },
        ],
        addListener: () => {},
        removeListener: () => {},
      },
      invocationPresetsSettings: {
        addListener: () => {},
        removeListener: () => {},
      },
      settingsManager: {
        getSetting: () => ({}),
        addListener: () => {},
        removeListener: () => {},
      },
    }));

    const { getPinnedSelectableModel } = await import(
      '../runtime-model-discovery'
    );

    expect(
      getPinnedSelectableModel('audio', 'gemini-3-pro-image-preview', {
        profileId: 'provider-image',
        modelId: 'gemini-3-pro-image-preview',
      })
    ).toBeNull();
  });

  it('主流最新静态模型可被初始选择器解析', async () => {
    const { getStaticModelConfig } = await import('../../constants/model-config');

    expect(getStaticModelConfig('gpt-5.1')?.type).toBe('text');
    expect(getStaticModelConfig('claude-sonnet-4-6')?.type).toBe('text');
    expect(getStaticModelConfig('seedream-v4')?.type).toBe('image');
    expect(getStaticModelConfig('veo3-fast-frames')?.type).toBe('video');
  });

  it('应用模型选择时会返回新增和移除增量', async () => {
    vi.doMock('../settings-manager', () => ({
      LEGACY_DEFAULT_PROVIDER_PROFILE_ID: 'legacy-default',
      providerCatalogsSettings: {
        get: () => [
          {
            profileId: 'provider-text',
            discoveredAt: Date.now(),
            discoveredModels: [
              {
                id: 'model-a',
                label: 'Model A',
                shortLabel: 'Model A',
                type: 'text',
                vendor: 'OPENAI',
              },
              {
                id: 'model-b',
                label: 'Model B',
                shortLabel: 'Model B',
                type: 'text',
                vendor: 'OPENAI',
              },
              {
                id: 'model-c',
                label: 'Model C',
                shortLabel: 'Model C',
                type: 'text',
                vendor: 'OPENAI',
              },
            ],
            selectedModelIds: ['model-a', 'model-b'],
          },
        ],
        addListener: () => {},
        removeListener: () => {},
        update: async () => {},
      },
      providerProfilesSettings: {
        get: () => [
          {
            id: 'provider-text',
            name: '文本供应商',
            enabled: true,
          },
        ],
        addListener: () => {},
        removeListener: () => {},
      },
      invocationPresetsSettings: {
        addListener: () => {},
        removeListener: () => {},
      },
      settingsManager: {
        getSetting: () => ({}),
        addListener: () => {},
        removeListener: () => {},
      },
    }));

    const { runtimeModelDiscovery } = await import('../runtime-model-discovery');

    const result = runtimeModelDiscovery.applySelection('provider-text', [
      'model-b',
      'model-c',
    ]);

    expect(result.models.map((model) => model.id)).toEqual(['model-b', 'model-c']);
    expect(result.addedModelIds).toEqual(['model-c']);
    expect(result.removedModelIds).toEqual(['model-a']);
  });
});
