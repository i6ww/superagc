import type { VideoShot } from './types';
import { createModelRef, type ModelRef } from '../../utils/settings-manager';

/** 去除字符串末尾的中英文句号 */
function trimTrailingPeriod(s: string): string {
  return s.replace(/[。.]+$/, '');
}

/** 将镜头的多个字段融合为完整的视频生成 prompt */
export function buildVideoPrompt(shot: VideoShot): string {
  const description = shot.description ? trimTrailingPeriod(shot.description) : '';
  const cameraMovement = shot.camera_movement
    ? trimTrailingPeriod(shot.camera_movement)
    : '';
  const firstFramePrompt = shot.first_frame_prompt
    ? trimTrailingPeriod(shot.first_frame_prompt)
    : shot.visual_prompt
    ? trimTrailingPeriod(shot.visual_prompt)
    : '';
  const lastFramePrompt = shot.last_frame_prompt
    ? trimTrailingPeriod(shot.last_frame_prompt)
    : shot.end_frame_description
    ? trimTrailingPeriod(shot.end_frame_description)
    : '';
  const legacyVideoPrompt =
    shot.video_prompt && shot.video_prompt !== shot.description
      ? trimTrailingPeriod(shot.video_prompt)
      : '';
  const transitionHint = shot.transition_hint
    ? trimTrailingPeriod(shot.transition_hint)
    : '';
  const narration = shot.narration
    ? trimTrailingPeriod(shot.narration)
    : shot.script
    ? trimTrailingPeriod(shot.script)
    : '';
  const dialogue = shot.dialogue ? trimTrailingPeriod(shot.dialogue) : '';
  const dialogueSpeakers = shot.dialogue_speakers
    ? trimTrailingPeriod(shot.dialogue_speakers)
    : shot.script_speaker
    ? trimTrailingPeriod(shot.script_speaker)
    : '';
  const speechRelation = shot.speech_relation
    ? trimTrailingPeriod(shot.speech_relation)
    : narration && dialogue
    ? 'both'
    : narration
    ? 'narration_only'
    : dialogue
    ? 'dialogue_only'
    : 'none';
  const narrationPrompt = narration ? `旁白：${narration}` : '';
  const dialoguePrompt = dialogue
    ? dialogueSpeakers
      ? `角色对白：由${dialogueSpeakers}发言。对白内容：${dialogue}`
      : `角色对白：${dialogue}`
    : '';

  const parts = [
    '请生成一个真实自然、上下文连贯的单镜头短视频',
    description ? `镜头主题：${description}` : '',
    narrationPrompt,
    dialoguePrompt,
    `语音关系：${speechRelation}`,
    firstFramePrompt ? `开场关键帧：${firstFramePrompt}` : '',
    lastFramePrompt ? `结束关键帧：${lastFramePrompt}` : '',
    cameraMovement ? `运镜方式：${cameraMovement}` : '',
    legacyVideoPrompt ? `动态细节补充：${legacyVideoPrompt}` : '',
    transitionHint ? `转场建议：${transitionHint}` : '',
    '要求主体动作连贯、时序自然、画面风格统一，避免突兀跳变与闪烁',
  ].filter(Boolean);

  return parts.join('。');
}

export function readStoredModelSelection(
  key: string,
  fallbackModel: string
): { modelId: string; modelRef: ModelRef | null } {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return { modelId: fallbackModel, modelRef: null };
    }

    const parsed = JSON.parse(raw) as {
      modelId?: string;
      profileId?: string | null;
    };

    if (typeof parsed.modelId === 'string' && parsed.modelId.trim()) {
      return {
        modelId: parsed.modelId.trim(),
        modelRef: createModelRef(parsed.profileId || null, parsed.modelId),
      };
    }
  } catch {
    // 兼容旧格式：直接存储 modelId 字符串
  }

  return {
    modelId: localStorage.getItem(key) || fallbackModel,
    modelRef: null,
  };
}

export function writeStoredModelSelection(
  key: string,
  modelId: string,
  modelRef?: ModelRef | null
): void {
  localStorage.setItem(
    key,
    JSON.stringify({
      modelId,
      profileId: modelRef?.profileId || null,
    })
  );
}
