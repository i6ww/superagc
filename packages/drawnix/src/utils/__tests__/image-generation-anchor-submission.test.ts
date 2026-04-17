import { describe, expect, it } from 'vitest';
import {
  DEFAULT_IMAGE_GENERATION_ANCHOR_SIZE,
  GHOST_IMAGE_GENERATION_ANCHOR_SIZE,
} from '../../types/image-generation-anchor.types';
import {
  buildImageGenerationAnchorCreateOptions,
  inferImageGenerationAnchorType,
  resolveImageGenerationAnchorSize,
} from '../image-generation-anchor-submission';

describe('image-generation-anchor-submission', () => {
  it('uses frame geometry when a target frame is provided', () => {
    const options = buildImageGenerationAnchorCreateOptions({
      workflowId: 'wf-frame',
      expectedInsertPosition: [120, 240],
      targetFrameId: 'frame-1',
      targetFrameDimensions: { width: 960, height: 540 },
      requestedCount: 1,
      zoom: 1,
      title: '图片生成',
    });

    expect(options.anchorType).toBe('frame');
    expect(options.position).toEqual([120, 240]);
    expect(options.size).toEqual({ width: 960, height: 540 });
  });

  it('uses ratio geometry when a single image request has a requested size', () => {
    const options = buildImageGenerationAnchorCreateOptions({
      workflowId: 'wf-ratio',
      expectedInsertPosition: [0, 0],
      requestedSize: '16x9',
      requestedCount: 1,
      zoom: 1,
      title: '图片生成',
    });

    expect(options.anchorType).toBe('ratio');
    expect(options.size).toEqual({ width: 400, height: 225 });
  });

  it('falls back to ghost geometry when neither frame nor size is known', () => {
    const options = buildImageGenerationAnchorCreateOptions({
      workflowId: 'wf-ghost',
      expectedInsertPosition: [32, 64],
      requestedCount: 1,
      zoom: 1,
      title: '图片生成',
    });

    expect(options.anchorType).toBe('ghost');
    expect(options.size).toEqual(GHOST_IMAGE_GENERATION_ANCHOR_SIZE);
  });

  it('uses stack anchor for multi-image generation and keeps default preview size', () => {
    expect(
      inferImageGenerationAnchorType({
        requestedCount: 4,
        requestedSize: '1x1',
        targetFrameId: undefined,
        targetFrameDimensions: undefined,
      })
    ).toBe('stack');

    expect(
      resolveImageGenerationAnchorSize({
        requestedCount: 4,
        requestedSize: '1x1',
        targetFrameDimensions: undefined,
        anchorType: 'stack',
        size: undefined,
      })
    ).toEqual(DEFAULT_IMAGE_GENERATION_ANCHOR_SIZE);
  });

  it('preserves weak frame affinity for independent multi-image anchors', () => {
    const options = buildImageGenerationAnchorCreateOptions({
      workflowId: 'wf-batch',
      expectedInsertPosition: [120, 240],
      targetFrameId: undefined,
      targetFrameDimensions: undefined,
      frameAffinityId: 'frame-1',
      frameAffinityDimensions: { width: 960, height: 540 },
      requestedSize: '16x9',
      requestedCount: 1,
      batchId: 'wf_batch_wf-batch',
      batchIndex: 1,
      batchTotal: 4,
      zoom: 1,
      title: '图片生成',
    });

    expect(options.anchorType).toBe('ratio');
    expect(options.frameAffinityId).toBe('frame-1');
    expect(options.frameAffinityDimensions).toEqual({
      width: 960,
      height: 540,
    });
    expect(options.targetFrameId).toBeUndefined();
  });
});
