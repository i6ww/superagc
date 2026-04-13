// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_MODEL_SELECTION_CACHE_KEY } from '../../constants/storage';

describe('ai-model-selection-storage', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('按类型写入并读取最近选择', async () => {
    const { getPersistedModelSelection, setPersistedModelSelection } =
      await import('../ai-model-selection-storage');

    setPersistedModelSelection('image', {
      modelId: 'gemini-image',
      modelRef: { profileId: 'provider-a', modelId: 'gemini-image' },
      providerIdHint: 'provider-a',
      vendorHint: 'GEMINI',
    });
    setPersistedModelSelection('video', {
      modelId: 'veo3',
      modelRef: { profileId: 'provider-b', modelId: 'veo3' },
      providerIdHint: 'provider-b',
      vendorHint: 'GOOGLE',
    });

    expect(getPersistedModelSelection('image')).toMatchObject({
      modelId: 'gemini-image',
      profileId: 'provider-a',
      providerIdHint: 'provider-a',
      vendorHint: 'GEMINI',
    });
    expect(getPersistedModelSelection('video')).toMatchObject({
      modelId: 'veo3',
      profileId: 'provider-b',
      providerIdHint: 'provider-b',
      vendorHint: 'GOOGLE',
    });

    setPersistedModelSelection('text', {
      modelId: 'deepseek-v3.2',
      modelRef: { profileId: 'provider-c', modelId: 'deepseek-v3.2' },
      providerIdHint: 'provider-c',
      vendorHint: 'DEEPSEEK',
    });

    expect(getPersistedModelSelection('text')).toMatchObject({
      modelId: 'deepseek-v3.2',
      profileId: 'provider-c',
      providerIdHint: 'provider-c',
      vendorHint: 'DEEPSEEK',
    });
  });

  it('agent 选择应优先使用独立缓存，不与 text 混写', async () => {
    const { getPersistedModelSelection, setPersistedModelSelection } =
      await import('../ai-model-selection-storage');

    setPersistedModelSelection('text', {
      modelId: 'deepseek-v3.2',
      modelRef: { profileId: 'provider-text', modelId: 'deepseek-v3.2' },
      providerIdHint: 'provider-text',
      vendorHint: 'DEEPSEEK',
    });
    setPersistedModelSelection('agent', {
      modelId: 'gemini-2.5-pro',
      modelRef: { profileId: 'provider-agent', modelId: 'gemini-2.5-pro' },
      providerIdHint: 'provider-agent',
      vendorHint: 'GEMINI',
    });

    expect(getPersistedModelSelection('agent')).toMatchObject({
      modelId: 'gemini-2.5-pro',
      profileId: 'provider-agent',
      providerIdHint: 'provider-agent',
      vendorHint: 'GEMINI',
    });
    expect(getPersistedModelSelection('text')).toMatchObject({
      modelId: 'deepseek-v3.2',
      profileId: 'provider-text',
    });
  });

  it('清理损坏数据并返回空结果', async () => {
    localStorage.setItem(
      AI_MODEL_SELECTION_CACHE_KEY,
      '{"image":{"modelId":123},"video":"bad"}'
    );

    const { getPersistedModelSelection } = await import(
      '../ai-model-selection-storage'
    );

    expect(getPersistedModelSelection('image')).toBeNull();
    expect(getPersistedModelSelection('video')).toBeNull();
  });

  it('支持删除单个类型缓存', async () => {
    const {
      clearPersistedModelSelection,
      getPersistedModelSelection,
      setPersistedModelSelection,
    } = await import('../ai-model-selection-storage');

    setPersistedModelSelection('image', {
      modelId: 'flux',
      modelRef: { profileId: null, modelId: 'flux' },
      vendorHint: 'OTHER',
    });
    setPersistedModelSelection('video', {
      modelId: 'kling-video',
      modelRef: { profileId: 'provider-k', modelId: 'kling-video' },
      vendorHint: 'KLING',
    });

    clearPersistedModelSelection('image');

    expect(getPersistedModelSelection('image')).toBeNull();
    expect(getPersistedModelSelection('video')).toMatchObject({
      modelId: 'kling-video',
    });
  });
});
