import { describe, expect, it } from 'vitest';
import { TaskType, type Task } from '../../../types/task.types';
import {
  appendTaskToRelatedGroup,
  findRecordIdFromBatch,
  sortRelatedTaskGroups,
} from './history-task-utils';

function createTask(id: string, createdAt: number): Task {
  return {
    id,
    type: TaskType.CHAT,
    status: 'completed',
    params: {},
    createdAt,
    updatedAt: createdAt,
  } as Task;
}

describe('history-task-utils', () => {
  it('finds record id from workflow batch prefix', () => {
    const recordIds = ['record_a', 'record_b'];

    expect(findRecordIdFromBatch('mv_record_a_music_1', 'mv_', recordIds)).toBe('record_a');
    expect(findRecordIdFromBatch('va_record_b_shot_2', 'va_', recordIds)).toBe('record_b');
    expect(findRecordIdFromBatch('ma_unknown_audio_1', 'ma_', recordIds)).toBeNull();
    expect(findRecordIdFromBatch('xx_record_a_1', 'ma_', recordIds)).toBeNull();
  });

  it('appends tasks into lazily created related groups', () => {
    const map = new Map<string, Record<'rewrite' | 'audio', Task[]>>();
    const task = createTask('task_1', 1);

    appendTaskToRelatedGroup(map, 'record_a', 'rewrite', task, () => ({
      rewrite: [],
      audio: [],
    }));

    expect(map.get('record_a')).toEqual({
      rewrite: [task],
      audio: [],
    });
  });

  it('sorts every related group by createdAt descending', () => {
    const map = new Map<string, Record<'rewrite' | 'audio', Task[]>>([
      ['record_a', {
        rewrite: [createTask('task_old', 1), createTask('task_new', 3)],
        audio: [createTask('task_mid', 2), createTask('task_latest', 4)],
      }],
    ]);

    sortRelatedTaskGroups(map);

    expect(map.get('record_a')).toEqual({
      rewrite: [createTask('task_new', 3), createTask('task_old', 1)],
      audio: [createTask('task_latest', 4), createTask('task_mid', 2)],
    });
  });
});
