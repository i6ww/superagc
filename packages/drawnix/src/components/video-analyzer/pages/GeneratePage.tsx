/**
 * 素材生成页 - 单镜头弹窗生成 + 底部批量配置
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { AnalysisRecord, VideoShot } from '../types';
import { aspectRatioToVideoSize, migrateProductInfo } from '../types';
import { getVideoModelConfig } from '../../../constants/video-model-config';
import { mcpRegistry } from '../../../mcp/registry';
import { updateRecord } from '../storage';
import { ShotCard } from '../components/ShotCard';
import { buildVideoPrompt } from '../utils';
import { ReferenceImageUpload } from '../../ttd-dialog/shared';
import type { ReferenceImage } from '../../ttd-dialog/shared';
import { ModelDropdown } from '../../ai-input-bar/ModelDropdown';
import { useSelectableModels } from '../../../hooks/use-runtime-models';
import { getSelectionKey } from '../../../utils/model-selection';
import type { ModelRef } from '../../../utils/settings-manager';
import { useDrawnix, DialogType } from '../../../hooks/use-drawnix';
import { taskQueueService } from '../../../services/task-queue';
import {
  readStoredModelSelection,
  writeStoredModelSelection,
} from '../utils';

const STORAGE_KEY_IMAGE_MODEL = 'video-analyzer:image-model';
const STORAGE_KEY_VIDEO_MODEL = 'video-analyzer:video-model';

interface GeneratePageProps {
  record: AnalysisRecord;
  onRecordUpdate: (record: AnalysisRecord) => void;
  onRecordsChange: (records: AnalysisRecord[]) => void;
  onRestart?: () => void;
}

export const GeneratePage: React.FC<GeneratePageProps> = ({
  record,
  onRecordUpdate,
  onRecordsChange,
  onRestart,
}) => {
  const shots = record.editedShots || record.analysis.shots;
  const aspectRatio = record.analysis.aspect_ratio || '16x9';
  const batchId = record.batchId || `va_${record.id}`;
  const { openDialog } = useDrawnix();
