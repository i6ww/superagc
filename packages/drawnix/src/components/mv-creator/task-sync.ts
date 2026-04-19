/**
 * 爆款MV生成器 - 任务同步
 */

import type { Task } from '../../types/task.types';
import { TaskType } from '../../types/task.types';
import type { MVRecord, VideoShot, VideoCharacter } from './types';
import { loadRecords, updateRecord } from './storage';
import { addStoryboardVersionToRecord, createStoryboardVersion } from './utils';
import { parseRewriteShotUpdates, applyRewriteShotUpdates } from '../video-analyzer/utils';
import {
  extractBatchRecordId,
  readTaskAction,
  readTaskChatResponse,
  readTaskStringParam,
  syncGeneratedClipsForRecord,
  updateWorkflowRecord,
} from '../shared/workflow';

// ── 分镜规划任务 ──

function getMVCreatorAction(task: Task): 'storyboard' | 'rewrite' | null {
  return readTaskAction(task, 'mvCreatorAction', ['storyboard', 'rewrite'] as const);
}

export function isMVCreatorTask(task: Task): boolean {
  return getMVCreatorAction(task) !== null;
}

function parseStoryboardResult(task: Task): { shots: VideoShot[]; characters: VideoCharacter[] } {
  let chatResponse = readTaskChatResponse(task);
  if (!chatResponse) throw new Error('分镜任务缺少结果内容');

  const codeBlockMatch = chatResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    chatResponse = codeBlockMatch[1].trim();
  }

  // 尝试新格式：{ characters: [...], shots: [...] }
  const objMatch = chatResponse.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0]);
      if (Array.isArray(parsed.shots)) {
        const shots = (parsed.shots as VideoShot[]).map((s, i) => ({
          ...s,
          id: s.id || `shot_${i + 1}`,
        }));
        const characters = Array.isArray(parsed.characters) ? parsed.characters as VideoCharacter[] : [];
        return { shots, characters };
      }
    } catch { /* fall through */ }
  }

  // 纯 JSON 数组
  const arrMatch = chatResponse.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      const shots = (JSON.parse(arrMatch[0]) as VideoShot[]).map((s, i) => ({
        ...s,
        id: s.id || `shot_${i + 1}`,
      }));
      return { shots, characters: [] };
    } catch { /* fall through to partial extraction */ }
  }

  // 截断兜底：逐个提取完整的 JSON 对象
  const objects: VideoShot[] = [];
  const characters: VideoCharacter[] = [];
  const objectPattern = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  let match: RegExpExecArray | null;
  while ((match = objectPattern.exec(chatResponse)) !== null) {
    try {
      const obj = JSON.parse(match[0]);
      if (obj && typeof obj === 'object') {
        if (obj.id?.startsWith('char_') && obj.name && obj.description) {
          characters.push(obj as VideoCharacter);
        } else if (obj.id?.startsWith('shot_') || obj.startTime !== undefined) {
          objects.push({ ...obj, id: obj.id || `shot_${objects.length + 1}` } as VideoShot);
        }
      }
    } catch { /* skip */ }
  }

  if (objects.length > 0) return { shots: objects, characters };
  throw new Error('响应中未找到有效 JSON（可能因输出过长被截断）');
}

export async function syncMVStoryboardTask(task: Task): Promise<{
  records: MVRecord[];
  record: MVRecord;
} | null> {
  if (task.status !== 'completed' || getMVCreatorAction(task) !== 'storyboard') {
    return null;
  }

  const recordId = readTaskStringParam(task, 'mvCreatorRecordId');
  if (!recordId) return null;

  const records = await loadRecords();
  const target = records.find(r => r.id === recordId);
  if (!target || target.pendingStoryboardTaskId !== task.id) return null;

  const { shots, characters } = parseStoryboardResult(task);
  const versionCount = (target.storyboardVersions || []).length;
  const version = createStoryboardVersion(
    shots,
    `AI 分镜 #${versionCount + 1}`,
    (task.params as { prompt?: string }).prompt
  );
  const versionPatch = addStoryboardVersionToRecord(target, version);

  return updateWorkflowRecord(target, {
    editedShots: shots,
    pendingStoryboardTaskId: null,
    storyboardGeneratedAt: Date.now(),
    ...(characters.length > 0 ? { characters } : {}),
    ...versionPatch,
  }, updateRecord);
}

// ── 脚本改编任务 ──

export async function syncMVRewriteTask(task: Task): Promise<{
  records: MVRecord[];
  record: MVRecord;
} | null> {
  if (task.status !== 'completed' || getMVCreatorAction(task) !== 'rewrite') {
    return null;
  }

  const recordId = readTaskStringParam(task, 'mvCreatorRecordId');
  if (!recordId) return null;

  const records = await loadRecords();
  const target = records.find(r => r.id === recordId);
  if (!target || target.pendingRewriteTaskId !== task.id) return null;

  const chatResponse = readTaskChatResponse(task);
  if (!chatResponse) return null;

  // 尝试解析 { characters, shots } 格式（改编可能同时更新角色）
  let newShots: VideoShot[];
  let updatedCharacters: VideoCharacter[] | null = null;

  const objMatch = chatResponse.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0]);
      if (Array.isArray(parsed.shots)) {
        newShots = parsed.shots.map((s: VideoShot, i: number) => ({
          ...s,
          id: s.id || `shot_${i + 1}`,
        }));
        if (Array.isArray(parsed.characters) && parsed.characters.length > 0) {
          updatedCharacters = parsed.characters as VideoCharacter[];
        }
      } else {
        const updates = parseRewriteShotUpdates(chatResponse);
        const currentShots = target.editedShots || [];
        newShots = applyRewriteShotUpdates(currentShots, updates);
      }
    } catch {
      const updates = parseRewriteShotUpdates(chatResponse);
      const currentShots = target.editedShots || [];
      newShots = applyRewriteShotUpdates(currentShots, updates);
    }
  } else {
    const updates = parseRewriteShotUpdates(chatResponse);
    const currentShots = target.editedShots || [];
    newShots = applyRewriteShotUpdates(currentShots, updates);
  }

  const versionCount = (target.storyboardVersions || []).length;
  const version = createStoryboardVersion(
    newShots,
    `AI 改编 #${versionCount + 1}`,
    (task.params as { prompt?: string }).prompt
  );
  const versionPatch = addStoryboardVersionToRecord(target, version);

  return updateWorkflowRecord(target, {
    editedShots: newShots,
    pendingRewriteTaskId: null,
    storyboardGeneratedAt: Date.now(),
    ...(updatedCharacters ? { characters: updatedCharacters } : {}),
    ...versionPatch,
  }, updateRecord);
}

// ── 音乐生成任务 ──

export function getMVMusicRecordId(task: Task): string | null {
  if (task.type !== TaskType.AUDIO) return null;
  const batchId = (task.params as { batchId?: string }).batchId;
  if (!batchId) return null;
  return extractBatchRecordId(batchId, {
    prefix: 'mv_',
    marker: '_music_',
  });
}

export async function syncMVMusicTask(
  task: Task,
  recordId: string
): Promise<{ records: MVRecord[]; record: MVRecord } | null> {
  return syncGeneratedClipsForRecord(task, recordId, {
    loadRecords,
    updateRecord,
  });
}
