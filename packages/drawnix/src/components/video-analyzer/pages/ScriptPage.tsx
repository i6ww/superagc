/**
 * 脚本编辑页 - 商品信息 + AI 改编 + 镜头脚本编辑
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { AnalysisRecord, ProductInfo, VideoShot } from '../types';
import { formatShotsMarkdown, migrateProductInfo } from '../types';
import { quickInsert } from '../../../mcp/tools/canvas-insertion';
import { sendChatWithGemini } from '../../../utils/gemini-api/services';
import type { GeminiMessage } from '../../../utils/gemini-api/types';
import { updateRecord } from '../storage';
import { ShotCard } from '../components/ShotCard';
import { ComboInput } from '../components/ComboInput';
import { ModelDropdown } from '../../ai-input-bar/ModelDropdown';
import { useSelectableModels } from '../../../hooks/use-runtime-models';
import { computeSegmentPlan, type SegmentPlan } from '../../../utils/segment-plan';
import { getVideoModelConfig } from '../../../constants/video-model-config';
import { getSelectionKey } from '../../../utils/model-selection';
import type { ModelRef } from '../../../utils/settings-manager';
import {
  readStoredModelSelection,
  writeStoredModelSelection,
} from '../utils';

const STORAGE_KEY_SCRIPT_MODEL = 'video-analyzer:script-model';
const STORAGE_KEY_VIDEO_MODEL = 'video-analyzer:video-model';
const DEFAULT_SCRIPT_MODEL = 'gemini-3.1-pro-preview';
const DEFAULT_VIDEO_MODEL = 'veo3';

const CAMERA_MOVEMENT_OPTIONS = [
  '固定镜头 (Static)',
  '缓慢推近 (Dolly In)',
  '缓慢拉远 (Dolly Out)',
  '水平平移 (Pan)',
  '垂直摇移 (Tilt)',
  '跟随拍摄 (Follow)',
  '手持感 (Handheld)',
  '环绕拍摄 (Orbit)',
  '升降镜头 (Crane)',
  '快速推移 (Zoom In)',
  '快速拉远 (Zoom Out)',
  '滑轨移动 (Slider)',
  '航拍俯冲 (Drone Dive)',
  '第一人称 (POV)',
];

const SPEECH_RELATION_OPTIONS = [
  { label: '无 (none)', value: 'none' },
  { label: '仅旁白 (narration_only)', value: 'narration_only' },
  { label: '仅对白 (dialogue_only)', value: 'dialogue_only' },
  { label: '旁白+对白 (both)', value: 'both' },
];

const TRANSITION_OPTIONS = [
  { label: '硬切 (cut)', value: 'cut' },
  { label: '溶解 (dissolve)', value: 'dissolve' },
  { label: '匹配切 (match_cut)', value: 'match_cut' },
  { label: '淡出到黑 (fade_to_black)', value: 'fade_to_black' },
];

interface ScriptPageProps {
  record: AnalysisRecord;
  onRecordUpdate: (record: AnalysisRecord) => void;
  onRecordsChange: (records: AnalysisRecord[]) => void;
  onNext?: () => void;
}

export const ScriptPage: React.FC<ScriptPageProps> = ({
  record,
  onRecordUpdate,
  onRecordsChange,
  onNext,
}) => {
  const [productInfo, setProductInfo] = useState<ProductInfo>(() =>
    migrateProductInfo(
      record.productInfo || { prompt: '' },
      record.analysis.totalDuration
    )
  );
  const [shots, setShots] = useState<VideoShot[]>(
    record.editedShots || [...record.analysis.shots]
  );
  const [rewriting, setRewriting] = useState(false);
  const [error, setError] = useState('');
  const [scriptModel, setScriptModelState] = useState(
    () => readStoredModelSelection(STORAGE_KEY_SCRIPT_MODEL, DEFAULT_SCRIPT_MODEL).modelId
  );
  const [scriptModelRef, setScriptModelRef] = useState<ModelRef | null>(
    () => readStoredModelSelection(STORAGE_KEY_SCRIPT_MODEL, DEFAULT_SCRIPT_MODEL).modelRef
  );
  const setScriptModel = useCallback((model: string, modelRef?: ModelRef | null) => {
    setScriptModelState(model);
    setScriptModelRef(modelRef || null);
    writeStoredModelSelection(STORAGE_KEY_SCRIPT_MODEL, model, modelRef);
  }, []);
  const textModels = useSelectableModels('text');
  const videoModels = useSelectableModels('video');
  const [videoModel, setVideoModelState] = useState(
    () =>
      record.productInfo?.videoModel ||
      readStoredModelSelection(
        STORAGE_KEY_VIDEO_MODEL,
        DEFAULT_VIDEO_MODEL
      ).modelId
  );
  const [videoModelRef, setVideoModelRef] = useState<ModelRef | null>(
    () =>
      record.productInfo?.videoModelRef ||
      readStoredModelSelection(
        STORAGE_KEY_VIDEO_MODEL,
        record.productInfo?.videoModel || DEFAULT_VIDEO_MODEL
      ).modelRef
  );
  const setVideoModel = useCallback((model: string, modelRef?: ModelRef | null) => {
    setVideoModelState(model);
    setVideoModelRef(modelRef || null);
    writeStoredModelSelection(STORAGE_KEY_VIDEO_MODEL, model, modelRef);
    const cfg = getVideoModelConfig(model);
    const defaultDur = parseInt(cfg.defaultDuration, 10) || 8;
    setProductInfo(p => ({
      ...p,
      videoModel: model,
      videoModelRef: modelRef || null,
      segmentDuration: defaultDur,
    }));
  }, []);

  // 当前视频模型的可用时长选项
  const durationOptions = useMemo(() => {
    const cfg = getVideoModelConfig(videoModel);
    return cfg.durationOptions;
  }, [videoModel]);

  // 用户选择的单段时长（默认取模型的 defaultDuration）
  const selectedSegmentDuration = useMemo(() => {
    if (productInfo.segmentDuration) {
      const valid = durationOptions.some(o => parseInt(o.value, 10) === productInfo.segmentDuration);
      if (valid) return productInfo.segmentDuration;
    }
    const cfg = getVideoModelConfig(videoModel);
    return parseInt(cfg.defaultDuration, 10) || 8;
  }, [productInfo.segmentDuration, durationOptions, videoModel]);

  // 分段计划（基于用户选择的单段时长）
  const segmentPlan = useMemo((): SegmentPlan => {
    const targetDur = productInfo.targetDuration || record.analysis.totalDuration;
    const singleOption = [{ label: `${selectedSegmentDuration}秒`, value: String(selectedSegmentDuration) }];
    return computeSegmentPlan(targetDur, singleOption);
  }, [selectedSegmentDuration, productInfo.targetDuration, record.analysis.totalDuration]);

  // 表单变化时自动保存到 IndexedDB（防抖 500ms）
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const updated = await updateRecord(record.id, { productInfo });
      onRecordsChange(updated);
      onRecordUpdate({ ...record, productInfo });
    }, 500);
    return () => clearTimeout(saveTimerRef.current);
  }, [productInfo]); // 只依赖 productInfo，避免循环

  const saveShots = useCallback(async (newShots: VideoShot[]) => {
    setShots(newShots);
    const updated = await updateRecord(record.id, { editedShots: newShots, productInfo });
    onRecordsChange(updated);
    onRecordUpdate({ ...record, editedShots: newShots, productInfo });
  }, [record, productInfo, onRecordUpdate, onRecordsChange]);

  const handleShotFieldChange = useCallback((shotId: string, field: keyof VideoShot, value: string) => {
    const newShots = shots.map(s => s.id === shotId ? { ...s, [field]: value } : s);
    saveShots(newShots);
  }, [shots, saveShots]);

  const handleRewrite = useCallback(async () => {
    if (!productInfo.prompt?.trim()) {
      setError('请填写提示词');
      return;
    }
    setRewriting(true);
    setError('');
    try {
      const originalShots = JSON.stringify(record.analysis.shots.map(s => ({
        id: s.id, label: s.label, type: s.type,
        startTime: s.startTime, endTime: s.endTime, duration: s.duration,
        description: s.description,
        narration: s.narration,
        dialogue: s.dialogue || '',
        dialogue_speakers: s.dialogue_speakers,
        speech_relation: s.speech_relation || 'none',
        first_frame_prompt: s.first_frame_prompt,
        last_frame_prompt: s.last_frame_prompt,
        camera_movement: s.camera_movement,
      })));

      const targetDur = productInfo.targetDuration || record.analysis.totalDuration;
      const { segments, actualTotal, isFixed, overflow } = segmentPlan;
      const segmentCount = segments.length;

      const durationInfo = isFixed
        ? `当前视频模型（${videoModel}）为固定时长模型，每段固定 ${segments[0]} 秒。
实际可用视频总时长：${actualTotal} 秒（${segmentCount} 段 × ${segments[0]} 秒/段）${overflow > 0 ? `，比目标 ${targetDur} 秒多出 ${overflow} 秒` : ''}。
请按 ${actualTotal} 秒总时长分配内容节奏。`
        : `目标视频总时长：${targetDur} 秒。
分段方案：${segments.map((d, i) => `第${i + 1}段 ${d}s`).join('、')}，实际总时长 ${actualTotal} 秒。
每个镜头的 duration 必须等于对应段的可用时长。`;

      const prompt = `你是一个短视频脚本改编专家。请基于以下原始视频脚本，改编脚本。

原始视频信息：
- 总时长：${record.analysis.totalDuration}秒
- 风格：${record.analysis.video_style || '未知'}
- BGM 情绪：${record.analysis.bgm_mood || '未知'}
- 画面比例：${record.analysis.aspect_ratio || '16x9'}

原始镜头脚本：
${originalShots}

用户提示词：
${productInfo.prompt || '未指定'}

视频生成约束：
- 使用的视频模型：${videoModel}
- ${durationInfo}
- 需要 ${segmentCount} 个视频片段拼接成完整视频

改编要求（所有字段必须使用与用户提示词相同的语言）：
1. **description（画面描述）**：根据用户提示词"${productInfo.prompt || ''}"改编画面内容，详细描述场景、人物、动作、光线、色调
2. **narration（旁白）**：画外音/解说词，无旁白则为空字符串
3. **dialogue（角色说话）**：角色台词，无角色说话则为空字符串；多角色请按”角色名: 台词”分行输出
4. **dialogue_speakers（对白角色）**：单角色填角色名，多角色用”角色A|角色B”按发言顺序列出；无对白填空字符串
5. **speech_relation（旁白与对白关系）**：必须是 'none' | 'narration_only' | 'dialogue_only' | 'both' 之一，并与 narration/dialogue 是否为空严格一致
6. **first_frame_prompt（首帧图片提示词）**：用于生成镜头开场画面，需精确描述主体位置、动作起始状态、构图、光线与背景
7. **last_frame_prompt（尾帧图片提示词）**：用于生成镜头结尾画面，需精确描述主体位置、动作定格状态、构图、光线与背景
8. **camera_movement（运镜方式）**：根据新内容适当调整

拼接衔接要求（极其重要！）：
1. 视觉锚点：相邻镜头之间必须有一个共同的视觉元素（同一商品、同一场景、同一手部动作），确保画面连贯
2. 运镜方向延续：如果一个镜头结尾是向右平移(pan right)，下一个镜头开头应继续向右或保持静止，不能突然反向
3. 色调一致性：所有镜头统一使用相同的色调和光线风格
4. 动作连贯：如果一个镜头结尾主体正在做某个动作，下一个镜头开头要延续这个动作

每个镜头的额外输出字段：
- **transition_hint**：到下一个镜头的转场方式，从 'cut'(硬切)、'dissolve'(交叉溶解)、'match_cut'(匹配切)、'fade_to_black'(淡出到黑) 中选择。同场景内推荐 'cut'，跨场景推荐 'dissolve'，最后一个镜头设为 'fade_to_black'

重要：所有字段的值必须使用与用户提示词相同的语言，保持语言一致性。

返回一个 JSON 数组，每个元素包含：id、startTime、endTime、duration、description、narration、dialogue、dialogue_speakers、speech_relation、first_frame_prompt、last_frame_prompt、camera_movement、label、type、transition_hint 字段。
只返回 JSON 数组，不要 markdown 格式。`;

      const messages: GeminiMessage[] = [{ role: 'user', content: [{ type: 'text', text: prompt }] }];
      const response = await sendChatWithGemini(
        messages,
        undefined,
        undefined,
        scriptModelRef || scriptModel
      );
      const text = response.choices?.[0]?.message?.content;
      if (!text) throw new Error('AI 未返回有效响应');

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('响应中未找到有效 JSON');

      const updates = JSON.parse(jsonMatch[0]) as Array<Partial<VideoShot> & { id: string }>;
      // AI 可能返回全新的镜头列表（增减镜头），或基于原 id 更新
      let newShots: VideoShot[];
      if (updates.length > 0 && updates[0].startTime !== undefined) {
        // AI 返回了完整的镜头列表（含时间分配），直接使用
        newShots = updates.map((u, i) => ({
          ...shots.find(s => s.id === u.id) || shots[i] || {},
          ...u,
          id: u.id || `shot_${i + 1}`,
        })) as VideoShot[];
      } else {
        // 仅部分字段更新，合并到现有 shots
        newShots = shots.map(shot => {
          const update = updates.find(u => u.id === shot.id);
          return update ? { ...shot, ...update } : shot;
        });
      }
      await saveShots(newShots);
    } catch (err: any) {
      setError(err.message || '改编失败');
    } finally {
      setRewriting(false);
    }
  }, [record, productInfo, shots, saveShots, segmentPlan, videoModel, scriptModel, scriptModelRef]);

  const handleInsertScripts = useCallback(async () => {
    await quickInsert('text', formatShotsMarkdown(shots, record.analysis, productInfo));
  }, [shots, productInfo, record]);

  return (
    <div className="va-page">
      {/* 提示词 + 参数 */}
      <div className="va-product-form">
        <textarea
          className="va-form-textarea"
          placeholder="描述你想要的视频内容，如：拖鞋，生活用品，主打防滑..."
          rows={3}
          value={productInfo.prompt}
          onChange={e => setProductInfo(p => ({ ...p, prompt: e.target.value }))}
        />
        <div className="va-form-row">
          <div className="va-duration-input" style={{ width: 'auto', flex: 1 }}>
            <label className="va-edit-label">视频时长(秒)</label>
            <input className="va-form-input" type="number" min={5} max={300} value={productInfo.targetDuration ?? record.analysis.totalDuration} onChange={e => setProductInfo(p => ({ ...p, targetDuration: Number(e.target.value) || undefined }))} />
          </div>
        </div>
        <div className="va-model-select">
          <label className="va-model-label">改编模型</label>
          <ModelDropdown
            variant="form"
            selectedModel={scriptModel}
            selectedSelectionKey={getSelectionKey(scriptModel, scriptModelRef)}
            onSelect={setScriptModel}
            models={textModels}
            placement="down"
            disabled={rewriting}
            placeholder="选择文本模型"
          />
        </div>
        <div className="va-model-select">
          <label className="va-model-label">视频模型</label>
          <ModelDropdown
            variant="form"
            selectedModel={videoModel}
            selectedSelectionKey={getSelectionKey(videoModel, videoModelRef)}
            onSelect={setVideoModel}
            models={videoModels}
            placement="down"
            disabled={rewriting}
            placeholder="选择视频模型"
          />
          <div className="va-segment-duration-select">
            <label className="va-model-label">单段</label>
            <select
              className="va-form-select"
              value={String(selectedSegmentDuration)}
              onChange={e => setProductInfo(p => ({ ...p, segmentDuration: parseInt(e.target.value, 10) }))}
              disabled={durationOptions.length <= 1}
            >
              {durationOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          {segmentPlan.overflow > 0 && (
            <span className="va-duration-overflow">
              实际 {segmentPlan.actualTotal}s（+{segmentPlan.overflow}s）
            </span>
          )}
        </div>
        <button className="va-analyze-btn" onClick={handleRewrite} disabled={rewriting}>
          {rewriting ? 'AI 改编中...' : 'AI 改编脚本'}
        </button>
        {error && <div className="va-error">{error}</div>}
      </div>

      {/* 镜头脚本列表 */}
      <div className="va-shots">
        {shots.map((shot, i) => (
          <ShotCard key={shot.id} shot={shot} index={i} compact>
            <div className="va-edit-fields">
              <label className="va-edit-label">画面描述</label>
              <textarea className="va-edit-textarea" rows={2} value={shot.description || ''} onChange={e => handleShotFieldChange(shot.id, 'description', e.target.value)} />
              <label className="va-edit-label">旁白</label>
              <textarea className="va-edit-textarea" rows={2} value={shot.narration || ''} onChange={e => handleShotFieldChange(shot.id, 'narration', e.target.value)} />
              <label className="va-edit-label">角色说话</label>
              <textarea className="va-edit-textarea" rows={2} value={shot.dialogue || ''} onChange={e => handleShotFieldChange(shot.id, 'dialogue', e.target.value)} placeholder={'多角色时按"角色名: 台词"分行'} />
              <label className="va-edit-label">对白角色</label>
              <input className="va-form-input" type="text" value={shot.dialogue_speakers || ''} onChange={e => handleShotFieldChange(shot.id, 'dialogue_speakers', e.target.value)} placeholder="如：主讲人 或 主讲人|顾客" />
              <label className="va-edit-label">旁白/对白关系</label>
              <ComboInput value={shot.speech_relation || ''} onChange={v => handleShotFieldChange(shot.id, 'speech_relation', v)} options={SPEECH_RELATION_OPTIONS} placeholder="选择关系" />
              <label className="va-edit-label">运镜方式</label>
              <ComboInput value={shot.camera_movement || ''} onChange={v => handleShotFieldChange(shot.id, 'camera_movement', v)} options={CAMERA_MOVEMENT_OPTIONS} placeholder="选择或输入运镜方式" />
              <label className="va-edit-label">首帧 Prompt</label>
              <textarea className="va-edit-textarea" rows={2} value={shot.first_frame_prompt || ''} onChange={e => handleShotFieldChange(shot.id, 'first_frame_prompt', e.target.value)} />
              <label className="va-edit-label">尾帧 Prompt</label>
              <textarea className="va-edit-textarea" rows={2} value={shot.last_frame_prompt || ''} onChange={e => handleShotFieldChange(shot.id, 'last_frame_prompt', e.target.value)} />
              <label className="va-edit-label">转场方式</label>
              <ComboInput value={shot.transition_hint || ''} onChange={v => handleShotFieldChange(shot.id, 'transition_hint', v)} options={TRANSITION_OPTIONS} placeholder="选择转场方式" />
            </div>
          </ShotCard>
        ))}
      </div>

      <div className="va-page-actions">
        <button onClick={handleInsertScripts}>脚本→画布</button>
        {onNext && <button className="va-btn-primary" onClick={onNext}>下一步: 生成素材 →</button>}
      </div>
    </div>
  );
};
