import { describe, expect, it } from 'vitest';
import {
  appendVersionToRecord,
  DEFAULT_ORIGINAL_VERSION_ID,
  switchVersionInRecord,
} from './versioned-record';

describe('versioned-record', () => {
  it('prepends a new version, caps history, and activates it', () => {
    const patch = appendVersionToRecord(
      {
        activeVersionId: 'v1',
        scriptVersions: [
          { id: 'v1', shots: ['old-1'] },
          { id: 'v0', shots: ['old-0'] },
        ],
      },
      'scriptVersions',
      { id: 'v2', shots: ['new'] },
      2,
      { editedShots: ['new'] }
    );

    expect(patch).toEqual({
      activeVersionId: 'v2',
      scriptVersions: [
        { id: 'v2', shots: ['new'] },
        { id: 'v1', shots: ['old-1'] },
      ],
      editedShots: ['new'],
    });
  });

  it('switches to original patch when original handler exists', () => {
    const patch = switchVersionInRecord(
      {
        scriptVersions: [{ id: 'v1', shots: ['v1'] }],
      },
      'scriptVersions',
      DEFAULT_ORIGINAL_VERSION_ID,
      {
        getVersionPatch: (version) => ({ editedShots: version.shots }),
        getOriginalPatch: () => ({ editedShots: ['original'] }),
      }
    );

    expect(patch).toEqual({
      activeVersionId: DEFAULT_ORIGINAL_VERSION_ID,
      editedShots: ['original'],
    });
  });

  it('switches to a stored version and returns null for missing versions', () => {
    const record = {
      storyboardVersions: [
        { id: 'v1', shots: ['a'] },
        { id: 'v2', shots: ['b'] },
      ],
    };

    expect(switchVersionInRecord(record, 'storyboardVersions', 'v2', {
      getVersionPatch: (version) => ({ editedShots: version.shots }),
    })).toEqual({
      activeVersionId: 'v2',
      editedShots: ['b'],
    });

    expect(switchVersionInRecord(record, 'storyboardVersions', 'missing', {
      getVersionPatch: (version) => ({ editedShots: version.shots }),
    })).toBeNull();
  });
});
