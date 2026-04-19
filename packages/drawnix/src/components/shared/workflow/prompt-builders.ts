import type { VideoAnalysisData } from '../../../services/video-analysis-service';
import type { VideoShot } from '../../../services/video-analysis-service';

interface WorkflowPromptProductInfo {
  videoStyle?: string;
  bgmMood?: string;
}

function trimTrailingPeriod(text: string): string {
  return text.replace(/[。.]+$/, '');
}

export function buildVideoPrompt(
  shot: VideoShot,
  analysis?: VideoAnalysisData,
  productInfo?: WorkflowPromptProductInfo | null
): string {
  const description = shot.description ? trimTrailingPeriod(shot.description) : '';
  const cameraMovement = shot.camera_movement
    ? trimTrailingPeriod(shot.camera_movement)
    : '';
  const firstFramePrompt = shot.first_frame_prompt
    ? trimTrailingPeriod(shot.first_frame_prompt)
    : '';
  const lastFramePrompt = shot.last_frame_prompt
    ? trimTrailingPeriod(shot.last_frame_prompt)
    : '';
  const transitionHint = shot.transition_hint
    ? trimTrailingPeriod(shot.transition_hint)
    : '';
  const narration = shot.narration ? trimTrailingPeriod(shot.narration) : '';
  const dialogue = shot.dialogue ? trimTrailingPeriod(shot.dialogue) : '';
  const dialogueSpeakers = shot.dialogue_speakers
    ? trimTrailingPeriod(shot.dialogue_speakers)
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

  const styleParts: string[] = [];
  const videoStyle = productInfo?.videoStyle || analysis?.video_style;
  const bgmMood = productInfo?.bgmMood || analysis?.bgm_mood;
  if (videoStyle) styleParts.push(`画面风格：${trimTrailingPeriod(videoStyle)}`);
  if (bgmMood) styleParts.push(`BGM情绪：${trimTrailingPeriod(bgmMood)}`);

  const characterAnchor = shot.character_description
    ? `The same ${trimTrailingPeriod(shot.character_description)}`
    : '';

  return [
    '请生成一个真实自然、上下文连贯的单镜头短视频',
    ...styleParts,
    characterAnchor ? `角色一致性：${characterAnchor}` : '',
    description ? `镜头主题：${description}` : '',
    narrationPrompt,
    dialoguePrompt,
    `语音关系：${speechRelation}`,
    firstFramePrompt ? `开场关键帧：${firstFramePrompt}` : '',
    lastFramePrompt ? `结束关键帧：${lastFramePrompt}` : '',
    cameraMovement ? `运镜方式：${cameraMovement}` : '',
    transitionHint ? `转场建议：${transitionHint}` : '',
    '要求主体动作连贯、时序自然、画面风格统一，避免突兀跳变与闪烁',
  ]
    .filter(Boolean)
    .join('。');
}

export function buildFramePrompt(
  shotPrompt: string,
  analysis?: VideoAnalysisData,
  productInfo?: WorkflowPromptProductInfo | null
): string {
  const videoStyle = productInfo?.videoStyle || analysis?.video_style;
  if (!videoStyle || !shotPrompt) return shotPrompt;
  return `${trimTrailingPeriod(videoStyle)}。${shotPrompt}`;
}
