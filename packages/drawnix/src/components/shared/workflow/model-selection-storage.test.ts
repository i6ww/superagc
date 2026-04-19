import { beforeEach, describe, expect, it } from 'vitest';
import { readStoredModelSelection, writeStoredModelSelection } from './model-selection-storage';

describe('model-selection-storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('writes profile-aware model selection and reads it back', () => {
    writeStoredModelSelection('workflow:model', 'veo3', {
      profileId: 'profile_a',
      modelId: 'veo3',
    });

    expect(readStoredModelSelection('workflow:model', 'fallback')).toEqual({
      modelId: 'veo3',
      modelRef: {
        profileId: 'profile_a',
        modelId: 'veo3',
      },
    });
  });

  it('falls back to legacy plain-string storage', () => {
    localStorage.setItem('workflow:model', 'legacy-model');

    expect(readStoredModelSelection('workflow:model', 'fallback')).toEqual({
      modelId: 'legacy-model',
      modelRef: null,
    });
  });
});
