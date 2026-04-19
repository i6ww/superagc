import { describe, expect, it, vi } from 'vitest';
import { updateWorkflowRecord } from './record-sync';

describe('record-sync', () => {
  it('returns updated record from persisted records when found', async () => {
    const updateRecord = vi.fn(async () => [
      { id: 'record_1', title: 'new' },
    ]);

    const result = await updateWorkflowRecord(
      { id: 'record_1', title: 'old' },
      { title: 'new' },
      updateRecord
    );

    expect(updateRecord).toHaveBeenCalledWith('record_1', { title: 'new' });
    expect(result).toEqual({
      records: [{ id: 'record_1', title: 'new' }],
      record: { id: 'record_1', title: 'new' },
    });
  });

  it('falls back to merged target record when updated list misses the target', async () => {
    const updateRecord = vi.fn(async () => []);

    const result = await updateWorkflowRecord(
      { id: 'record_1', title: 'old', starred: false },
      { title: 'merged', starred: true },
      updateRecord
    );

    expect(result).toEqual({
      records: [],
      record: { id: 'record_1', title: 'merged', starred: true },
    });
  });
});
