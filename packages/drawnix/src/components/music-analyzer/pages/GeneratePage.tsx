import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MusicAnalysisRecord, GeneratedClip } from '../types';
import { updateRecord } from '../storage';
import { taskQueueService } from '../../../services/task-queue';
import { TaskType } from '../../../types/task.types';
import { ModelDropdown } from '../../ai-input-bar/ModelDropdown';
import { useSelectableModels } from '../../../hooks/use-runtime-models';
import { getSelectionKey } from '../../../utils/model-selection';
import type { ModelRef } from '../../../utils/settings-manager';
import { getCompatibleParams, getDefaultAudioModel } from '../../../constants/model-config';
import {
  readStoredModelSelection,
  writeStoredModelSelection,
} from '../utils';

const STORAGE_KEY_AUDIO_MODEL = 'music-analyzer:audio-model';

interface GeneratePageProps {
  record: MusicAnalysisRecord;
  onRecordUpdate: (record: MusicAnalysisRecord) => void;
  onRecordsChange: (records: MusicAnalysisRecord[]) => void;
  onRestart?: () => void;
}

export const GeneratePage: React.FC<GeneratePageProps> = ({
  record,
  onRecordUpdate,
  onRecordsChange,
  onRestart,
}) => {
  const [title, setTitle] = useState(record.title || '');
  const [tags, setTags] = useState((record.styleTags || []).join(', '));
  const [prompt, setPrompt] = useState(record.lyricsDraft || '');
  const [mv, setMv] = useState('chirp-v5-5');
  const [batchCount, setBatchCount] = useState(1);
  const [selectedModel, setSelectedModelState] = useState(
    () => readStoredModelSelection(STORAGE_KEY_AUDIO_MODEL, getDefaultAudioModel()).modelId
  );
  const [selectedModelRef, setSelectedModelRef] = useState<ModelRef | null>(
    () => readStoredModelSelection(STORAGE_KEY_AUDIO_MODEL, getDefaultAudioModel()).modelRef
  );
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const generatingRef = useRef(false);

  const setSelectedModel = useCallback((model: string, modelRef?: ModelRef | null) => {
    setSelectedModelState(model);
    setSelectedModelRef(modelRef || null);
    writeStoredModelSelection(STORAGE_KEY_AUDIO_MODEL, model, modelRef);
  }, []);

  useEffect(() => {
    setTitle(record.title || '');
    setTags((record.styleTags || []).join(', '));
    setPrompt(record.lyricsDraft || '');
  }, [record]);

  useEffect(() => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const styleTags = tags
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const updated = await updateRecord(record.id, {
        title,
        styleTags,
        lyricsDraft: prompt,
      });
      onRecordsChange(updated);
      onRecordUpdate({
        ...record,
        title,
        styleTags,
        lyricsDraft: prompt,
      });
    }, 400);
    return () => clearTimeout(saveTimerRef.current);
  }, [onRecordUpdate, onRecordsChange, prompt, record.id, tags, title]);

  const audioModels = useSelectableModels('audio');
  const sunoModels = useMemo(
    () =>
      audioModels.filter((item) => {
        const tagsText = Array.isArray((item as any).tags)
          ? (item as any).tags.join(' ')
          : '';
        return /suno/i.test(item.id) || /suno/i.test(tagsText);
      }),
    [audioModels]
  );
  const mvParam = useMemo(
    () => getCompatibleParams(selectedModel).find((param) => param.id === 'mv'),
    [selectedModel]
  );

  useEffect(() => {
    if (mvParam?.defaultValue) {
      setMv((current) => current || String(mvParam.defaultValue));
    }
  }, [mvParam?.defaultValue]);

  const clips = record.generatedClips || [];

  // 批量生成
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      setMessage('请先准备歌词或生成提示词');
      return;
    }
    if (generatingRef.current) return;
    generatingRef.current = true;

    setSubmitting(true);
    setMessage('');
    try {
      const taskIds: string[] = [];
      for (let i = 0; i < batchCount; i++) {
        const task = taskQueueService.createTask(
          {
            prompt,
            model: selectedModel,
            modelRef: selectedModelRef,
            sunoAction: 'music',
            title: title.trim(),
            tags: tags.trim(),
            mv,
            batchId: `ma_${record.id}_gen_${i}`,
            batchIndex: i,
            batchTotal: batchCount,
            autoInsertToCanvas: true,
          },
          TaskType.AUDIO
        );
        taskIds.push(task.id);
      }
      const updated = await updateRecord(record.id, {
        generateTaskIds: [...(record.generateTaskIds || []), ...taskIds],
        title,
        lyricsDraft: prompt,
      });
      onRecordsChange(updated);
      onRecordUpdate({
        ...record,
        generateTaskIds: [...(record.generateTaskIds || []), ...taskIds],
        title,
        lyricsDraft: prompt,
      });
      setMessage(`已提交 ${batchCount} 次调用到 Suno 任务队列`);
    } catch (taskError: any) {
      setMessage(taskError.message || '提交生成任务失败');
    } finally {
      setSubmitting(false);
      generatingRef.current = false;
    }
  }, [
    batchCount,
    mv,
    onRecordUpdate,
    onRecordsChange,
    prompt,
    record,
    selectedModel,
    selectedModelRef,
    tags,
    title,
  ]);

  return (
    <div className="va-page">
      <div className="ma-card">
        <div className="ma-card-header">
          <span>Suno 模型</span>
        </div>
        <ModelDropdown
          selectedModel={selectedModel}
          selectedSelectionKey={getSelectionKey(selectedModel, selectedModelRef)}
          onSelect={setSelectedModel}
          models={sunoModels.length > 0 ? sunoModels : audioModels}
          variant="form"
          placement="down"
          placeholder="选择音频生成模型"
        />
      </div>

      {mvParam?.options && mvParam.options.length > 0 && (
        <div className="ma-card">
          <div className="ma-card-header">
            <span>Suno 版本</span>
          </div>
          <select
            className="ma-select"
            value={mv}
            onChange={(event) => setMv(event.target.value)}
          >
            {mvParam.options.map((option) => (
              <option key={option.value} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="ma-card">
        <div className="ma-card-header">
          <span>歌曲标题</span>
        </div>
        <input
          className="ma-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="歌曲标题"
        />
      </div>

      <div className="ma-card">
        <div className="ma-card-header">
          <span>风格标签</span>
        </div>
        <input
          className="ma-input"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder="逗号分隔，例如 edm, intense, female vocal"
        />
      </div>

      <div className="ma-card">
        <div className="ma-card-header">
          <span>提交给 Suno 的歌词/提示词</span>
        </div>
        <textarea
          className="ma-textarea"
          rows={10}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="这里的内容会直接作为 prompt 提交给 Suno"
        />
      </div>

      {/* 调用次数选择（每次调用 Suno 返回 2 首） */}
      <div className="ma-card">
        <div className="ma-card-header">
          <span>调用次数</span>
          <span className="ma-muted">每次返回 2 首</span>
        </div>
        <div className="ma-batch-selector">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              className={`ma-batch-btn ${batchCount === n ? 'active' : ''}`}
              onClick={() => setBatchCount(n)}
            >
              {n} 次
            </button>
          ))}
        </div>
      </div>

      {/* 已生成片段 */}
      {clips.length > 0 && (
        <div className="ma-card">
          <div className="ma-card-header">
            <span>已生成片段 ({clips.length})</span>
          </div>
          <div className="ma-clips-gallery">
            {clips.map((clip) => (
              <ClipCard key={clip.clipId} clip={clip} />
            ))}
          </div>
        </div>
      )}

      {message && <div className="ma-progress">{message}</div>}

      <div className="va-page-actions">
        <button onClick={onRestart}>重新开始</button>
        <button
          className="va-btn-primary"
          onClick={handleGenerate}
          disabled={submitting}
        >
          调用 {batchCount} 次
        </button>
      </div>
    </div>
  );
};

/** 已生成片段 - 紧凑横向布局 */
const ClipCard: React.FC<{ clip: GeneratedClip }> = ({ clip }) => (
  <div className="ma-clip-row">
    {clip.imageUrl ? (
      <img
        className="ma-clip-thumb"
        src={clip.imageUrl}
        alt=""
        referrerPolicy="no-referrer"
      />
    ) : (
      <div className="ma-clip-thumb ma-clip-thumb--placeholder">♪</div>
    )}
    <div className="ma-clip-meta">
      <span className="ma-clip-title">{clip.title || '未命名'}</span>
      {clip.duration != null && (
        <span className="ma-clip-duration">{formatDuration(clip.duration)}</span>
      )}
    </div>
    <audio controls src={clip.audioUrl} className="ma-clip-player" preload="metadata" />
  </div>
);

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
