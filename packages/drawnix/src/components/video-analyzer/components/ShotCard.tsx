/**
 * 镜头卡片组件
 */

import React from 'react';
import type { VideoShot } from '../types';
import { SHOT_TYPE_COLORS } from '../types';

/** 转场 icon */
const TRANSITION_ICONS: Record<string, string> = {
  cut: '✂️',
  dissolve: '🔀',
  match_cut: '🔗',
  fade_to_black: '⬛',
};

/** 转场中文标签 */
const TRANSITION_LABELS: Record<string, string> = {
  cut: '硬切',
  dissolve: '溶解',
  match_cut: '匹配切',
  fade_to_black: '淡出',
};

interface ShotCardProps {
  shot: VideoShot;
  index: number;
  /** 紧凑模式：隐藏描述/文案/运镜的只读展示（编辑表单会替代） */
  compact?: boolean;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

export const ShotCard: React.FC<ShotCardProps> = ({ shot, index, compact, actions, children }) => (
  <div className="va-shot-card">
    <div className="va-shot-header">
      <span
        className="va-shot-badge"
        style={{ backgroundColor: SHOT_TYPE_COLORS[shot.type] || SHOT_TYPE_COLORS.other }}
      >
        {shot.label}
      </span>
      <span className="va-shot-time">
        #{index + 1} · {shot.startTime}s - {shot.endTime}s
      </span>
      {shot.transition_hint && (
        <span className="va-shot-transition">
          {TRANSITION_ICONS[shot.transition_hint] || '→'} {TRANSITION_LABELS[shot.transition_hint] || shot.transition_hint}
        </span>
      )}
    </div>
    {!compact && (
      <>
        <p className="va-shot-desc">{shot.description}</p>
        {(shot.narration || shot.script) && <p className="va-shot-script">旁白: "{shot.narration || shot.script}"</p>}
        {shot.dialogue && <p className="va-shot-script">对白: "{shot.dialogue}"</p>}
        {(shot.dialogue_speakers || shot.script_speaker) && (
          <span className="va-shot-camera">对白角色: {shot.dialogue_speakers || shot.script_speaker}</span>
        )}
        {shot.speech_relation && (
          <span className="va-shot-camera">语音关系: {shot.speech_relation}</span>
        )}
        {shot.camera_movement && (
          <span className="va-shot-camera">运镜: {shot.camera_movement}</span>
        )}
        {shot.visual_prompt && (
          <p className="va-shot-prompt">图片 Prompt: {shot.visual_prompt}</p>
        )}
        {shot.video_prompt && (
          <p className="va-shot-prompt">视频 Prompt: {shot.video_prompt}</p>
        )}
        {shot.end_frame_description && (
          <p className="va-shot-prompt">尾帧描述: {shot.end_frame_description}</p>
        )}
      </>
    )}
    {children}
    {actions && <div className="va-shot-actions">{actions}</div>}
  </div>
);
