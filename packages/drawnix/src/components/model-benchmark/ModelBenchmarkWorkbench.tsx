import React, { useEffect, useMemo, useRef, useState, startTransition } from 'react';
import type { Subscription } from 'rxjs';
import { Select } from 'tdesign-react';
import {
  BENCHMARK_PROMPT_PRESETS,
  buildBenchmarkTarget,
  getDefaultPromptPreset,
  modelBenchmarkService,
  rankBenchmarkEntries,
  type BenchmarkCompareMode,
  type BenchmarkModality,
  type BenchmarkRankingMode,
  type ModelBenchmarkEntry,
  type ModelBenchmarkLaunchRequest,
  type ModelBenchmarkSession,
} from '../../services/model-benchmark-service';
import {
  applyShiftRangeSelection,
  reconcileSelection,
} from '../../services/model-benchmark-pure';
import { runtimeModelDiscovery } from '../../utils/runtime-model-discovery';
import {
  LEGACY_DEFAULT_PROVIDER_PROFILE_ID,
  providerProfilesSettings,
  type ProviderProfile,
} from '../../utils/settings-manager';
import type { ModelConfig } from '../../constants/model-config';
import './model-benchmark-workbench.scss';

interface ModelBenchmarkWorkbenchProps {
  initialRequest?: ModelBenchmarkLaunchRequest;
}

type CapabilityKey =
  | 'supportsText'
  | 'supportsImage'
  | 'supportsVideo'
  | 'supportsAudio';

const MODALITY_LABELS: Record<BenchmarkModality, string> = {
  text: '文本',
  image: '图片',
  video: '视频',
  audio: '音频',
};

const MODE_LABELS: Record<BenchmarkCompareMode, string> = {
  'cross-provider': '同模型跨供应商',
  'cross-model': '同供应商跨模型',
  custom: '自定义批测',
};

const MODE_DESCRIPTIONS: Record<BenchmarkCompareMode, string> = {
  'cross-provider': '锁定一个模型，横向比较不同供应商的稳定性、速度和效果差异。',
  'cross-model': '锁定一个供应商，一次跑完同类模型，快速筛掉慢和差的型号。',
  custom: '手动编排供应商与模型组合，适合做定向复测和候选名单对比。',
};

const RANKING_LABELS: Record<BenchmarkRankingMode, string> = {
  speed: '速度优先',
  cost: '成本优先',
  balanced: '综合平衡',
};

const SESSION_STATUS_LABELS: Record<string, string> = {
  draft: '待启动',
  running: '测试中',
  completed: '已完成',
  partial: '部分失败',
};

const MAX_AUTO_CUSTOM_TARGETS = 6;
const QUEUE_PREVIEW_LIMIT = 8;

function isNonNullTarget<T>(value: T | null): value is T {
  return value !== null;
}

function normalizeQuery(value: string): string[] {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function matchesQuery(query: string, values: Array<string | null | undefined>): boolean {
  const tokens = normalizeQuery(query);
  if (tokens.length === 0) {
    return true;
  }

  const haystack = values
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return tokens.every((token) => haystack.includes(token));
}

function getCapabilityKey(modality: BenchmarkModality): CapabilityKey {
  if (modality === 'text') return 'supportsText';
  if (modality === 'image') return 'supportsImage';
  if (modality === 'video') return 'supportsVideo';
  return 'supportsAudio';
}

function getAvailableProfilesForModality(
  profiles: ProviderProfile[],
  modality: BenchmarkModality
) {
  const capabilityKey = getCapabilityKey(modality);
  return profiles.filter(
    (profile) =>
      profile.enabled &&
      (profile.id === LEGACY_DEFAULT_PROVIDER_PROFILE_ID ||
        profile.capabilities[capabilityKey])
  );
}

function useDiscoveryVersion() {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    return runtimeModelDiscovery.subscribe(() => {
      setVersion((value) => value + 1);
    });
  }, []);

  return version;
}

function useProviderProfilesState() {
  const [profiles, setProfiles] = useState<ProviderProfile[]>(() =>
    providerProfilesSettings.get()
  );

  useEffect(() => {
    const listener = (nextProfiles: ProviderProfile[]) => {
      setProfiles(nextProfiles);
    };
    providerProfilesSettings.addListener(listener);
    return () => {
      providerProfilesSettings.removeListener(listener);
    };
  }, []);

  return profiles;
}

function formatDuration(ms: number | null): string {
  if (!ms || ms < 0) {
    return '--';
  }
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(ms >= 10000 ? 1 : 2)}s`;
}

function getSessionSummary(session: ModelBenchmarkSession | null) {
  if (!session) {
    return {
      total: 0,
      completed: 0,
      failed: 0,
      running: 0,
    };
  }
  return session.entries.reduce(
    (summary, entry) => {
      summary.total += 1;
      if (entry.status === 'completed') summary.completed += 1;
      if (entry.status === 'failed') summary.failed += 1;
      if (entry.status === 'running') summary.running += 1;
      return summary;
    },
    { total: 0, completed: 0, failed: 0, running: 0 }
  );
}

function getProfileModels(
  profileId: string,
  modality: BenchmarkModality
): ModelConfig[] {
  const models =
    profileId === LEGACY_DEFAULT_PROVIDER_PROFILE_ID
      ? runtimeModelDiscovery.getProfilePreferredModels(profileId, modality)
      : runtimeModelDiscovery
          .getState(profileId)
          .models.filter((model) => model.type === modality);
  const deduped = new Map<string, ModelConfig>();
  models.forEach((model) => {
    if (model.type === modality && !deduped.has(model.id)) {
      deduped.set(model.id, model);
    }
  });
  return Array.from(deduped.values());
}

function getModelDisplayName(model: Pick<ModelConfig, 'id' | 'label' | 'shortLabel'>) {
  return model.shortLabel || model.label || model.id;
}

function getModelOptionLabel(model: Pick<ModelConfig, 'id' | 'label' | 'shortLabel'>) {
  const displayName = getModelDisplayName(model);
  return displayName === model.id
    ? displayName
    : `${displayName} · ${model.id}`;
}

function ModelBenchmarkWorkbench({
  initialRequest,
}: ModelBenchmarkWorkbenchProps) {
  const profiles = useProviderProfilesState();
  const discoveryVersion = useDiscoveryVersion();
  const [storeState, setStoreState] = useState(() =>
    modelBenchmarkService.getState()
  );
  const [modality, setModality] = useState<BenchmarkModality>('text');
  const [compareMode, setCompareMode] =
    useState<BenchmarkCompareMode>('cross-provider');
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [selectedProviderIds, setSelectedProviderIds] = useState<string[]>([]);
  const [selectedCustomKeys, setSelectedCustomKeys] = useState<string[]>([]);
  const [pickerQuery, setPickerQuery] = useState('');
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [promptPresetId, setPromptPresetId] = useState(
    getDefaultPromptPreset('text').id
  );
  const [prompt, setPrompt] = useState(getDefaultPromptPreset('text').prompt);
  const [rankingMode, setRankingMode] =
    useState<BenchmarkRankingMode>('speed');
  const launchSignatureRef = useRef<string>('');
  const pickerAnchorRef = useRef<string | null>(null);
  const pickerButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const subscription: Subscription = modelBenchmarkService
      .observe()
      .subscribe((state) => {
        startTransition(() => {
          setStoreState(state);
        });
      });
    return () => subscription.unsubscribe();
  }, []);

  const availableProfiles = useMemo(() => {
    return getAvailableProfilesForModality(profiles, modality);
  }, [modality, profiles]);

  const profileMap = useMemo(
    () => new Map(availableProfiles.map((profile) => [profile.id, profile])),
    [availableProfiles]
  );

  const activeProfile = selectedProfileId
    ? profileMap.get(selectedProfileId) || null
    : null;

  const availablePromptPresets = useMemo(
    () => BENCHMARK_PROMPT_PRESETS.filter((preset) => preset.modality === modality),
    [modality]
  );

  const activeProfileModels = useMemo(() => {
    void discoveryVersion;
    if (!selectedProfileId) {
      return [];
    }
    return getProfileModels(selectedProfileId, modality);
  }, [discoveryVersion, modality, selectedProfileId]);

  const crossProviderModels = useMemo(() => {
    void discoveryVersion;
    const deduped = new Map<string, ModelConfig>();
    availableProfiles.forEach((profile) => {
      getProfileModels(profile.id, modality).forEach((model) => {
        if (!deduped.has(model.id)) {
          deduped.set(model.id, model);
        }
      });
    });
    return Array.from(deduped.values());
  }, [availableProfiles, discoveryVersion, modality]);

  const customTargets = useMemo(() => {
    void discoveryVersion;
    return availableProfiles.flatMap((profile) =>
      getProfileModels(profile.id, modality).map((model) =>
        buildBenchmarkTarget(profile.id, profile.name, model)
      )
    );
  }, [availableProfiles, discoveryVersion, modality]);

  useEffect(() => {
    if (!availableProfiles.length) {
      setSelectedProfileId('');
      return;
    }

    const defaultPreset = getDefaultPromptPreset(modality);
    setPromptPresetId((current) =>
      availablePromptPresets.some((preset) => preset.id === current)
        ? current
        : defaultPreset.id
    );
    setPrompt((current) =>
      current === getDefaultPromptPreset('text').prompt ||
      current === getDefaultPromptPreset('image').prompt ||
      current === getDefaultPromptPreset('video').prompt ||
      current === getDefaultPromptPreset('audio').prompt
        ? defaultPreset.prompt
        : current
    );

    if (!selectedProfileId || !profileMap.has(selectedProfileId)) {
      setSelectedProfileId(availableProfiles[0].id);
    }
  }, [
    availableProfiles,
    availablePromptPresets,
    modality,
    profileMap,
    selectedProfileId,
  ]);

  useEffect(() => {
    const modelIds = activeProfileModels.map((model) => model.id);
    if (modelIds.length === 0) {
      setSelectedModelIds([]);
      return;
    }

    setSelectedModelIds((current) =>
      reconcileSelection(current, modelIds, { fallback: 'all' })
    );
  }, [activeProfileModels]);

  useEffect(() => {
    const modelIds = crossProviderModels.map((model) => model.id);
    if (modelIds.length === 0) {
      setSelectedModelId('');
      return;
    }

    if (!modelIds.includes(selectedModelId)) {
      setSelectedModelId(modelIds[0]);
    }
  }, [crossProviderModels, selectedModelId]);

  const crossProviderCandidates = useMemo(() => {
    if (!selectedModelId) {
      return [];
    }
    return availableProfiles
      .map((profile) => {
        const model = getProfileModels(profile.id, modality).find(
          (item) => item.id === selectedModelId
        );
        return model ? buildBenchmarkTarget(profile.id, profile.name, model) : null;
      })
      .filter(isNonNullTarget);
  }, [availableProfiles, modality, selectedModelId]);

  useEffect(() => {
    setSelectedProviderIds((current) =>
      reconcileSelection(
        current,
        crossProviderCandidates.map((target) => target.profileId),
        { fallback: 'all' }
      )
    );
  }, [crossProviderCandidates]);

  useEffect(() => {
    setSelectedCustomKeys((current) =>
      reconcileSelection(
        current,
        customTargets.map((target) => target.selectionKey),
        {
          fallback: 'first',
          limit: MAX_AUTO_CUSTOM_TARGETS,
        }
      )
    );
  }, [customTargets]);

  const activeSession = useMemo(() => {
    return (
      storeState.sessions.find(
        (session) => session.id === storeState.activeSessionId
      ) || null
    );
  }, [storeState.activeSessionId, storeState.sessions]);

  useEffect(() => {
    if (!activeSession) {
      return;
    }
    setRankingMode(activeSession.rankingMode);
  }, [activeSession]);

  const sessionSummary = useMemo(
    () => getSessionSummary(activeSession),
    [activeSession]
  );

  const sortedEntries = useMemo(() => {
    if (!activeSession) {
      return [];
    }
    return rankBenchmarkEntries(activeSession.entries, activeSession.rankingMode);
  }, [activeSession]);

  const resolvedTargets = useMemo(() => {
    if (compareMode === 'cross-provider') {
      return crossProviderCandidates.filter((target) =>
        selectedProviderIds.includes(target.profileId)
      );
    }

    if (compareMode === 'cross-model') {
      if (!selectedProfileId) {
        return [];
      }
      const profile = profileMap.get(selectedProfileId);
      if (!profile) {
        return [];
      }
      return activeProfileModels
        .filter((model) => selectedModelIds.includes(model.id))
        .map((model) => buildBenchmarkTarget(profile.id, profile.name, model));
    }

    return customTargets.filter((target) =>
      selectedCustomKeys.includes(target.selectionKey)
    );
  }, [
    activeProfileModels,
    compareMode,
    crossProviderCandidates,
    customTargets,
    profileMap,
    selectedCustomKeys,
    selectedModelIds,
    selectedProfileId,
    selectedProviderIds,
  ]);

  const queuePreviewTargets = resolvedTargets.slice(0, QUEUE_PREVIEW_LIMIT);
  const topEntry = sortedEntries.find((entry) => entry.status === 'completed') || null;
  const filteredCrossModelModels = useMemo(
    () =>
      activeProfileModels.filter((model) => {
        const active = selectedModelIds.includes(model.id);
        if (showSelectedOnly && !active) {
          return false;
        }
        return matchesQuery(pickerQuery, [
          getModelDisplayName(model),
          model.id,
          activeProfile?.name,
        ]);
      }),
    [activeProfile?.name, activeProfileModels, pickerQuery, selectedModelIds, showSelectedOnly]
  );
  const filteredCrossProviderCandidates = useMemo(
    () =>
      crossProviderCandidates.filter((target) => {
        const active = selectedProviderIds.includes(target.profileId);
        if (showSelectedOnly && !active) {
          return false;
        }
        return matchesQuery(pickerQuery, [
          target.profileName,
          target.modelLabel,
          target.modelId,
          target.profileId,
        ]);
      }),
    [crossProviderCandidates, pickerQuery, selectedProviderIds, showSelectedOnly]
  );
  const filteredCustomTargets = useMemo(
    () =>
      customTargets.filter((target) => {
        const active = selectedCustomKeys.includes(target.selectionKey);
        if (showSelectedOnly && !active) {
          return false;
        }
        return matchesQuery(pickerQuery, [
          target.profileName,
          target.modelLabel,
          target.modelId,
          target.profileId,
        ]);
      }),
    [customTargets, pickerQuery, selectedCustomKeys, showSelectedOnly]
  );
  const visiblePickerKeys = useMemo(() => {
    if (compareMode === 'cross-model') {
      return filteredCrossModelModels.map((model) => model.id);
    }
    if (compareMode === 'cross-provider') {
      return filteredCrossProviderCandidates.map((target) => target.profileId);
    }
    return filteredCustomTargets.map((target) => target.selectionKey);
  }, [
    compareMode,
    filteredCrossModelModels,
    filteredCrossProviderCandidates,
    filteredCustomTargets,
  ]);

  useEffect(() => {
    if (visiblePickerKeys.length === 0) {
      pickerAnchorRef.current = null;
      return;
    }
    if (
      pickerAnchorRef.current &&
      visiblePickerKeys.includes(pickerAnchorRef.current)
    ) {
      return;
    }
    pickerAnchorRef.current = visiblePickerKeys[0];
  }, [visiblePickerKeys]);

  useEffect(() => {
    if (!initialRequest) {
      return;
    }
    const signature = JSON.stringify(initialRequest);
    if (!storeState.ready || launchSignatureRef.current === signature) {
      return;
    }
    launchSignatureRef.current = signature;

    const nextModality = initialRequest.modality || 'text';
    const nextProfiles = getAvailableProfilesForModality(profiles, nextModality);
    const nextCompareMode =
      initialRequest.compareMode ||
      (initialRequest.modelId ? 'cross-provider' : 'cross-model');
    const defaultPreset = getDefaultPromptPreset(nextModality);
    setModality(nextModality);
    setCompareMode(nextCompareMode);
    setPromptPresetId(defaultPreset.id);
    setPrompt(defaultPreset.prompt);
    if (initialRequest.profileId) {
      setSelectedProfileId(initialRequest.profileId);
    }
    if (initialRequest.modelId) {
      setSelectedModelId(initialRequest.modelId);
    }

    const schedule = window.setTimeout(() => {
      const profileId =
        initialRequest.profileId ||
        nextProfiles[0]?.id ||
        selectedProfileId;
      const targets =
        nextCompareMode === 'cross-provider' && initialRequest.modelId
          ? nextProfiles
              .map((profile) => {
                const model = getProfileModels(profile.id, nextModality).find(
                  (item) => item.id === initialRequest.modelId
                );
                return model
                  ? buildBenchmarkTarget(profile.id, profile.name, model)
                  : null;
              })
              .filter(isNonNullTarget)
          : profileId
          ? getProfileModels(profileId, nextModality)
              .map((model) => {
                const profile = nextProfiles.find((item) => item.id === profileId);
                return profile
                  ? buildBenchmarkTarget(profile.id, profile.name, model)
                  : null;
              })
              .filter(isNonNullTarget)
          : [];

      if (!targets.length) {
        return;
      }

      const session = modelBenchmarkService.createSession({
        modality: nextModality,
        compareMode: nextCompareMode,
        promptPresetId: defaultPreset.id,
        prompt: defaultPreset.prompt,
        rankingMode,
        targets,
        source: 'shortcut',
      });

      if (initialRequest.autoRun) {
        void modelBenchmarkService.runSession(session.id);
      }
    }, 120);

    return () => window.clearTimeout(schedule);
  }, [
    initialRequest,
    profiles,
    rankingMode,
    selectedProfileId,
    storeState.ready,
  ]);

  const handleApplyPreset = (presetId: string) => {
    const preset =
      availablePromptPresets.find((item) => item.id === presetId) ||
      getDefaultPromptPreset(modality);
    setPromptPresetId(preset.id);
    setPrompt(preset.prompt);
  };

  const handleCreateAndRun = async () => {
    if (resolvedTargets.length === 0 || !prompt.trim()) {
      return;
    }
    const session = modelBenchmarkService.createSession({
      modality,
      compareMode,
      promptPresetId,
      prompt,
      rankingMode,
      targets: resolvedTargets,
      source: 'manual',
    });
    await modelBenchmarkService.runSession(session.id);
  };

  const handleRangeAwareToggle = (
    targetKey: string,
    currentSelection: string[],
    setSelection: React.Dispatch<React.SetStateAction<string[]>>,
    visibleKeys: string[],
    useShiftKey: boolean
  ) => {
    const shouldSelect = !currentSelection.includes(targetKey);
    setSelection((current) =>
      useShiftKey
        ? applyShiftRangeSelection(
            current,
            visibleKeys,
            pickerAnchorRef.current,
            targetKey,
            shouldSelect
          )
        : shouldSelect
        ? Array.from(new Set([...current, targetKey]))
        : current.filter((item) => item !== targetKey)
    );
    pickerAnchorRef.current = targetKey;
  };

  const focusPickerKey = (targetKey: string) => {
    window.requestAnimationFrame(() => {
      pickerButtonRefs.current[targetKey]?.focus();
    });
  };

  const handlePickerKeyboardShortcut = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    targetKey: string,
    currentSelection: string[],
    setSelection: React.Dispatch<React.SetStateAction<string[]>>,
    visibleKeys: string[]
  ) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      setSelection(visibleKeys);
      pickerAnchorRef.current = visibleKeys[0] || targetKey;
      return;
    }

    if (
      event.key !== 'ArrowDown' &&
      event.key !== 'ArrowUp' &&
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowRight'
    ) {
      return;
    }

    event.preventDefault();
    const currentIndex = visibleKeys.indexOf(targetKey);
    if (currentIndex === -1) {
      return;
    }
    const delta =
      event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = Math.min(
      visibleKeys.length - 1,
      Math.max(0, currentIndex + delta)
    );
    const nextKey = visibleKeys[nextIndex];
    if (!nextKey || nextKey === targetKey) {
      return;
    }

    if (event.shiftKey) {
      const nextSelected = !currentSelection.includes(nextKey);
      setSelection((current) =>
        applyShiftRangeSelection(
          current,
          visibleKeys,
          pickerAnchorRef.current || targetKey,
          nextKey,
          nextSelected
        )
      );
    } else {
      pickerAnchorRef.current = nextKey;
    }

    focusPickerKey(nextKey);
  };

  const handleToggleCrossModel = (modelId: string, useShiftKey = false) => {
    handleRangeAwareToggle(
      modelId,
      selectedModelIds,
      setSelectedModelIds,
      filteredCrossModelModels.map((model) => model.id),
      useShiftKey
    );
  };

  const handleToggleProvider = (profileId: string, useShiftKey = false) => {
    handleRangeAwareToggle(
      profileId,
      selectedProviderIds,
      setSelectedProviderIds,
      filteredCrossProviderCandidates.map((target) => target.profileId),
      useShiftKey
    );
  };

  const handleToggleCustomTargetWithRange = (
    selectionKey: string,
    useShiftKey = false
  ) => {
    handleRangeAwareToggle(
      selectionKey,
      selectedCustomKeys,
      setSelectedCustomKeys,
      filteredCustomTargets.map((target) => target.selectionKey),
      useShiftKey
    );
  };

  const renderEntryPreview = (entry: ModelBenchmarkEntry) => {
    if (entry.modality === 'text') {
      return (
        <pre className="model-benchmark__preview-text">
          {entry.preview.text || '暂无返回'}
        </pre>
      );
    }

    if (entry.modality === 'image' && entry.preview.url) {
      return (
        <img
          className="model-benchmark__preview-image"
          src={entry.preview.url}
          alt={entry.modelLabel}
          loading="lazy"
        />
      );
    }

    if (entry.modality === 'video' && entry.preview.url) {
      return (
        <video
          className="model-benchmark__preview-video"
          src={entry.preview.url}
          controls
          preload="metadata"
        />
      );
    }

    if (entry.modality === 'audio' && entry.preview.url) {
      return (
        <div className="model-benchmark__preview-audio-shell">
          <audio controls preload="none" src={entry.preview.url} />
          {entry.preview.text ? (
            <pre className="model-benchmark__preview-text">
              {entry.preview.text}
            </pre>
          ) : null}
        </div>
      );
    }

    return <div className="model-benchmark__preview-empty">暂无预览</div>;
  };

  const pickerTitle =
    compareMode === 'cross-model'
      ? '选择参测模型'
      : compareMode === 'cross-provider'
      ? '选择参与对比的供应商'
      : '选择目标组合';
  const composerLockedLabel =
    compareMode === 'cross-model'
      ? `已锁定供应商：${activeProfile?.name || '未选择'}`
      : compareMode === 'cross-provider'
      ? `已锁定模型：${selectedModelId || '未选择'}（来自全供应商去重列表）`
      : '手动编排供应商与模型组合';
  const composerNextStep =
    compareMode === 'cross-model'
      ? '下一步：勾选要纳入本轮测试的模型'
      : compareMode === 'cross-provider'
      ? '下一步：从下拉框中多选要参与横向对比的供应商'
      : '下一步：按需筛选并勾选目标组合';
  const crossProviderModelOptions = crossProviderModels.map((model) => ({
    label: getModelOptionLabel(model),
    value: model.id,
  }));
  const crossProviderOptions = crossProviderCandidates.map((target) => ({
    label: `${target.profileName} · ${target.modelLabel}`,
    value: target.profileId,
  }));

  return (
    <div className="model-benchmark">
      <aside className="model-benchmark__sidebar">
        <section className="model-benchmark__hero">
          <div className="model-benchmark__eyebrow">Model Bench</div>
          <h2 className="model-benchmark__hero-title">模型批测工作台</h2>
          <p className="model-benchmark__hero-subtitle">
            把范围先编排清楚，再一键跑完整批，最快找出又快又稳的候选。
          </p>
          <div className="model-benchmark__hero-stats">
            <div className="model-benchmark__hero-stat">
              <strong>{availableProfiles.length}</strong>
              <span>可用供应商</span>
            </div>
            <div className="model-benchmark__hero-stat">
              <strong>{resolvedTargets.length}</strong>
              <span>本轮目标</span>
            </div>
            <div className="model-benchmark__hero-stat">
              <strong>{activeSession?.entries.length || 0}</strong>
              <span>当前结果</span>
            </div>
          </div>
        </section>

        <section className="model-benchmark__panel">
          <div className="model-benchmark__panel-head">
            <div>
              <div className="model-benchmark__panel-title">测试范围编排</div>
              <div className="model-benchmark__panel-desc">
                先锁定比较维度，再直接在同一块区域里完成模型或供应商选择。
              </div>
            </div>
          </div>

          <div className="model-benchmark__segmented">
            {Object.entries(MODALITY_LABELS).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`model-benchmark__segmented-button ${
                  modality === value ? 'model-benchmark__segmented-button--active' : ''
                }`}
                onClick={() => setModality(value as BenchmarkModality)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="model-benchmark__segmented model-benchmark__segmented--stack">
            {Object.entries(MODE_LABELS).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`model-benchmark__segmented-button ${
                  compareMode === value
                    ? 'model-benchmark__segmented-button--active'
                    : ''
                }`}
                onClick={() => setCompareMode(value as BenchmarkCompareMode)}
              >
                <strong>{label}</strong>
                <span>{MODE_DESCRIPTIONS[value as BenchmarkCompareMode]}</span>
              </button>
            ))}
          </div>

          <div className="model-benchmark__field-grid">
            {compareMode === 'cross-model' ? (
              <label className="model-benchmark__field model-benchmark__field--full">
                <span>目标供应商</span>
                <select
                  className="model-benchmark__select"
                  value={selectedProfileId}
                  onChange={(event) => setSelectedProfileId(event.target.value)}
                >
                  {availableProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {compareMode === 'cross-provider' ? (
              <label className="model-benchmark__field model-benchmark__field--full">
                <span>对比模型</span>
                <Select
                  filterable
                  className="model-benchmark__select"
                  value={selectedModelId}
                  options={crossProviderModelOptions}
                  placeholder="搜索并选择要横向对比的模型"
                  onChange={(value) => setSelectedModelId((value as string) || '')}
                />
              </label>
            ) : null}
          </div>

          <div className="model-benchmark__composer-divider" />

          <div className="model-benchmark__panel-head model-benchmark__panel-head--tight">
            <div>
              <div className="model-benchmark__panel-title">{pickerTitle}</div>
              <div className="model-benchmark__panel-desc">
                {composerLockedLabel}
              </div>
              <div className="model-benchmark__composer-hint">
                {composerNextStep}
              </div>
            </div>
            <div className="model-benchmark__picker-toolbar">
              {compareMode === 'cross-model' ? (
                <>
                  <button
                    type="button"
                    className="model-benchmark__toolbar-button"
                    onClick={() =>
                      setSelectedModelIds(activeProfileModels.map((model) => model.id))
                    }
                  >
                    全选
                  </button>
                  <button
                    type="button"
                    className="model-benchmark__toolbar-button"
                    onClick={() => setSelectedModelIds([])}
                  >
                    清空
                  </button>
                </>
              ) : null}

              {compareMode === 'cross-provider' ? (
                <>
                  <button
                    type="button"
                    className="model-benchmark__toolbar-button"
                    onClick={() =>
                      setSelectedProviderIds(
                        crossProviderCandidates.map((target) => target.profileId)
                      )
                    }
                  >
                    全选
                  </button>
                  <button
                    type="button"
                    className="model-benchmark__toolbar-button"
                    onClick={() => setSelectedProviderIds([])}
                  >
                    清空
                  </button>
                </>
              ) : null}

              {compareMode === 'custom' ? (
                <>
                  <button
                    type="button"
                    className="model-benchmark__toolbar-button"
                    onClick={() =>
                      setSelectedCustomKeys(
                        customTargets.map((target) => target.selectionKey)
                      )
                    }
                  >
                    全选
                  </button>
                  <button
                    type="button"
                    className="model-benchmark__toolbar-button"
                    onClick={() =>
                      setSelectedCustomKeys(
                        customTargets
                          .slice(0, MAX_AUTO_CUSTOM_TARGETS)
                          .map((target) => target.selectionKey)
                      )
                    }
                  >
                    推荐 6 个
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {compareMode === 'cross-provider' ? (
            <div className="model-benchmark__multi-select-wrap">
              <label className="model-benchmark__field model-benchmark__field--full">
                <span>参测供应商</span>
                <Select
                  multiple
                  filterable
                  minCollapsedNum={2}
                  popupProps={{ overlayClassName: 'model-benchmark__select-popup' }}
                  className="model-benchmark__multi-select"
                  value={selectedProviderIds}
                  options={crossProviderOptions}
                  placeholder="搜索并多选要参与对比的供应商"
                  onChange={(value) =>
                    setSelectedProviderIds(
                      Array.isArray(value) ? (value as string[]) : []
                    )
                  }
                />
              </label>
            </div>
          ) : (
            <div className="model-benchmark__picker-controls">
              <label className="model-benchmark__search">
                <input
                  type="search"
                  value={pickerQuery}
                  onChange={(event) => setPickerQuery(event.target.value)}
                  placeholder="搜索模型名 / ID / 供应商"
                />
              </label>
              <button
                type="button"
                className={`model-benchmark__toolbar-button ${
                  showSelectedOnly ? 'model-benchmark__toolbar-button--active' : ''
                }`}
                onClick={() => setShowSelectedOnly((current) => !current)}
              >
                {showSelectedOnly ? '显示全部' : '仅看已选'}
              </button>
            </div>
          )}

          <div className="model-benchmark__picker-summary">
            <strong>{resolvedTargets.length}</strong>
            <span>
              已加入本轮批测，当前显示{' '}
              {compareMode === 'cross-model'
                ? filteredCrossModelModels.length
                : compareMode === 'cross-provider'
                ? filteredCrossProviderCandidates.length
                : filteredCustomTargets.length}
            </span>
          </div>

          <div className="model-benchmark__picker-hint">
            {compareMode === 'cross-provider'
              ? '先锁定模型，再在下拉框里多选供应商做横向对比。'
              : '支持模糊检索，按住 Shift 点击可连续多选或连续取消，键盘也可操作。'}
          </div>

          {compareMode !== 'cross-provider' ? (
            <div className="model-benchmark__picker-grid">
            {compareMode === 'cross-model'
              ? filteredCrossModelModels.map((model) => {
                  const active = selectedModelIds.includes(model.id);
                  return (
                    <button
                      key={model.id}
                      type="button"
                      className={`model-benchmark__picker-card ${
                        active ? 'model-benchmark__picker-card--active' : ''
                      }`}
                      ref={(node) => {
                        pickerButtonRefs.current[model.id] = node;
                      }}
                      onClick={(event) =>
                        handleToggleCrossModel(model.id, event.shiftKey)
                      }
                      onKeyDown={(event) =>
                        handlePickerKeyboardShortcut(
                          event,
                          model.id,
                          selectedModelIds,
                          setSelectedModelIds,
                          visiblePickerKeys
                        )
                      }
                    >
                      <div className="model-benchmark__picker-card-main">
                        <div className="model-benchmark__picker-card-title">
                          {getModelDisplayName(model)}
                        </div>
                        <div className="model-benchmark__picker-card-meta">
                          {model.id}
                        </div>
                      </div>
                      <span className="model-benchmark__picker-card-state">
                        {active ? '已加入' : '点击加入'}
                      </span>
                    </button>
                  );
                })
              : null}

            {compareMode === 'cross-provider'
              ? filteredCrossProviderCandidates.map((target) => {
                  const active = selectedProviderIds.includes(target.profileId);
                  return (
                    <button
                      key={target.selectionKey}
                      type="button"
                      className={`model-benchmark__picker-card ${
                        active ? 'model-benchmark__picker-card--active' : ''
                      }`}
                      ref={(node) => {
                        pickerButtonRefs.current[target.profileId] = node;
                      }}
                      onClick={(event) =>
                        handleToggleProvider(target.profileId, event.shiftKey)
                      }
                      onKeyDown={(event) =>
                        handlePickerKeyboardShortcut(
                          event,
                          target.profileId,
                          selectedProviderIds,
                          setSelectedProviderIds,
                          visiblePickerKeys
                        )
                      }
                    >
                      <div className="model-benchmark__picker-card-main">
                        <div className="model-benchmark__picker-card-title">
                          {target.profileName}
                        </div>
                        <div className="model-benchmark__picker-card-meta">
                          {target.modelLabel}
                        </div>
                      </div>
                      <span className="model-benchmark__picker-card-state">
                        {active ? '参与对比' : '未参与'}
                      </span>
                    </button>
                  );
                })
              : null}

            {compareMode === 'custom'
              ? filteredCustomTargets.map((target) => {
                  const active = selectedCustomKeys.includes(target.selectionKey);
                  return (
                    <button
                      key={target.selectionKey}
                      type="button"
                      className={`model-benchmark__picker-card ${
                        active ? 'model-benchmark__picker-card--active' : ''
                      }`}
                      ref={(node) => {
                        pickerButtonRefs.current[target.selectionKey] = node;
                      }}
                      onClick={(event) =>
                        handleToggleCustomTargetWithRange(
                          target.selectionKey,
                          event.shiftKey
                        )
                      }
                      onKeyDown={(event) =>
                        handlePickerKeyboardShortcut(
                          event,
                          target.selectionKey,
                          selectedCustomKeys,
                          setSelectedCustomKeys,
                          visiblePickerKeys
                        )
                      }
                    >
                      <div className="model-benchmark__picker-card-main">
                        <div className="model-benchmark__picker-card-title">
                          {target.modelLabel}
                        </div>
                        <div className="model-benchmark__picker-card-meta">
                          {target.profileName}
                        </div>
                      </div>
                      <span className="model-benchmark__picker-card-state">
                        {active ? '已加入' : '点击加入'}
                      </span>
                    </button>
                  );
                })
              : null}
            {compareMode === 'cross-model' && filteredCrossModelModels.length === 0 ? (
              <div className="model-benchmark__picker-empty">
                没有匹配的模型，试试换关键词或关闭“仅看已选”。
              </div>
            ) : null}
            {compareMode === 'cross-provider' &&
            filteredCrossProviderCandidates.length === 0 ? (
              <div className="model-benchmark__picker-empty">
                没有匹配的供应商，试试换关键词或关闭“仅看已选”。
              </div>
            ) : null}
            {compareMode === 'custom' && filteredCustomTargets.length === 0 ? (
              <div className="model-benchmark__picker-empty">
                没有匹配的目标组合，试试换关键词或关闭“仅看已选”。
              </div>
            ) : null}
            </div>
          ) : null}
        </section>

        <section className="model-benchmark__panel">
          <div className="model-benchmark__panel-head">
            <div>
              <div className="model-benchmark__panel-title">低成本提示词</div>
              <div className="model-benchmark__panel-desc">
                默认用最省钱样本先做第一轮筛选，后续再放大测试强度。
              </div>
            </div>
          </div>
          <div className="model-benchmark__preset-list">
            {availablePromptPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`model-benchmark__preset-chip ${
                  preset.id === promptPresetId
                    ? 'model-benchmark__preset-chip--active'
                    : ''
                }`}
                onClick={() => handleApplyPreset(preset.id)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <textarea
            className="model-benchmark__prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={5}
          />
        </section>

        <section className="model-benchmark__panel model-benchmark__panel--accent">
          <div className="model-benchmark__panel-head">
            <div>
              <div className="model-benchmark__panel-title">本轮批测队列</div>
              <div className="model-benchmark__panel-desc">
                已编排 {resolvedTargets.length} 个目标，默认并发 2。
              </div>
            </div>
            <div className="model-benchmark__queue-count">
              <strong>{resolvedTargets.length}</strong>
              <span>个目标</span>
            </div>
          </div>
          <div className="model-benchmark__queue-grid">
            {queuePreviewTargets.map((target) => (
              <div key={target.selectionKey} className="model-benchmark__queue-card">
                <div className="model-benchmark__queue-card-copy">
                  <strong title={target.modelLabel}>{target.modelLabel}</strong>
                  <span title={target.profileName}>{target.profileName}</span>
                </div>
                <em className="model-benchmark__queue-card-badge">待测</em>
              </div>
            ))}
            {resolvedTargets.length > QUEUE_PREVIEW_LIMIT ? (
              <div className="model-benchmark__queue-card model-benchmark__queue-card--more">
                还有 {resolvedTargets.length - QUEUE_PREVIEW_LIMIT} 个目标待跑
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="model-benchmark__primary-button"
            onClick={handleCreateAndRun}
            disabled={!storeState.ready || resolvedTargets.length === 0 || !prompt.trim()}
          >
            开始整批测试
          </button>
        </section>

        <section className="model-benchmark__panel model-benchmark__panel--sessions">
          <div className="model-benchmark__panel-head">
            <div>
              <div className="model-benchmark__panel-title">历史会话</div>
              <div className="model-benchmark__panel-desc">
                会话与正常任务历史隔离，便于集中筛模型。
              </div>
            </div>
          </div>
          <div className="model-benchmark__session-list">
            {storeState.sessions.map((session) => (
              <div key={session.id} className="model-benchmark__session-row">
                <button
                  type="button"
                  className={`model-benchmark__session-item ${
                    session.id === storeState.activeSessionId
                      ? 'model-benchmark__session-item--active'
                      : ''
                  }`}
                  onClick={() => modelBenchmarkService.setActiveSession(session.id)}
                >
                  <span className="model-benchmark__session-title">{session.title}</span>
                  <span className="model-benchmark__session-meta">
                    {MODE_LABELS[session.compareMode]} · {session.entries.length} 项 ·{' '}
                    {SESSION_STATUS_LABELS[session.status]}
                  </span>
                </button>
                <button
                  type="button"
                  className="model-benchmark__session-delete"
                  onClick={() => modelBenchmarkService.removeSession(session.id)}
                  aria-label={`删除会话 ${session.title}`}
                  title="删除会话"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        </section>
      </aside>

      <main className="model-benchmark__main">
        <div className="model-benchmark__main-shell">
          <div className="model-benchmark__main-head">
            <div>
              <div className="model-benchmark__eyebrow">
                {activeSession ? MODE_LABELS[activeSession.compareMode] : 'Result Board'}
              </div>
              <h3>{activeSession ? activeSession.title : '还没有测试结果'}</h3>
              <p className="model-benchmark__main-desc">
                {activeSession
                  ? '结果按当前排序方式重排，支持继续人工打分、收藏和淘汰。'
                  : '先在左侧明确测试范围，确保本轮真的是“批量”而不是单条试跑。'}
              </p>
            </div>
            {activeSession ? (
              <div className="model-benchmark__summary-strip">
                <div className="model-benchmark__summary-card">
                  <strong>{sessionSummary.total}</strong>
                  <span>总目标</span>
                </div>
                <div className="model-benchmark__summary-card">
                  <strong>{sessionSummary.completed}</strong>
                  <span>成功</span>
                </div>
                <div className="model-benchmark__summary-card">
                  <strong>{sessionSummary.failed}</strong>
                  <span>失败</span>
                </div>
                <div className="model-benchmark__summary-card">
                  <strong>{RANKING_LABELS[activeSession.rankingMode]}</strong>
                  <span>{SESSION_STATUS_LABELS[activeSession.status]}</span>
                </div>
              </div>
            ) : null}
          </div>

          {activeSession ? (
            <>
              {topEntry ? (
                <section className="model-benchmark__spotlight">
                  <div className="model-benchmark__spotlight-copy">
                    <div className="model-benchmark__eyebrow">当前第一名</div>
                    <h4>{topEntry.modelLabel}</h4>
                    <p>
                      来自 {topEntry.profileName}，首响 {formatDuration(topEntry.firstResponseMs)}
                      ，总耗时 {formatDuration(topEntry.totalDurationMs)}。
                    </p>
                  </div>
                  <div className="model-benchmark__spotlight-meta">
                    <span>{MODALITY_LABELS[topEntry.modality]}</span>
                    <span>{topEntry.favorite ? '已收藏' : '可继续观察'}</span>
                    <span>{topEntry.userScore ? `${topEntry.userScore} 分` : '待人工打分'}</span>
                  </div>
                </section>
              ) : null}

              <div className="model-benchmark__result-grid">
                {sortedEntries.map((entry, index) => (
                  <article
                    key={entry.id}
                    className={`model-benchmark__result-card model-benchmark__result-card--${entry.status}`}
                  >
                    <header className="model-benchmark__result-head">
                      <div className="model-benchmark__result-rank">#{index + 1}</div>
                      <div className="model-benchmark__result-heading">
                        <div className="model-benchmark__result-title">
                          {entry.modelLabel}
                        </div>
                        <div className="model-benchmark__result-subtitle">
                          {entry.profileName}
                        </div>
                      </div>
                      <span
                        className={`model-benchmark__status model-benchmark__status--${entry.status}`}
                      >
                        {entry.status === 'completed'
                          ? '完成'
                          : entry.status === 'failed'
                          ? '失败'
                          : entry.status === 'running'
                          ? '测试中'
                          : '等待中'}
                      </span>
                    </header>

                    <div className="model-benchmark__result-metrics">
                      <span>首响 {formatDuration(entry.firstResponseMs)}</span>
                      <span>总耗时 {formatDuration(entry.totalDurationMs)}</span>
                      <span>
                        成本{' '}
                        {entry.estimatedCost === null
                          ? '未知'
                          : `¥${entry.estimatedCost.toFixed(4)}`}
                      </span>
                    </div>

                    <div className="model-benchmark__preview">
                      {renderEntryPreview(entry)}
                    </div>

                    {entry.errorSummary ? (
                      <div className="model-benchmark__error">{entry.errorSummary}</div>
                    ) : null}

                    <div className="model-benchmark__feedback">
                      <div className="model-benchmark__score-row">
                        {[1, 2, 3, 4, 5].map((score) => (
                          <button
                            key={score}
                            type="button"
                            className={`model-benchmark__score-chip ${
                              entry.userScore === score
                                ? 'model-benchmark__score-chip--active'
                                : ''
                            }`}
                            onClick={() =>
                              modelBenchmarkService.setEntryFeedback(
                                activeSession.id,
                                entry.id,
                                {
                                  userScore: entry.userScore === score ? null : score,
                                }
                              )
                            }
                          >
                            {score}分
                          </button>
                        ))}
                      </div>
                      <div className="model-benchmark__action-row">
                        <button
                          type="button"
                          className={`model-benchmark__ghost-button ${
                            entry.favorite
                              ? 'model-benchmark__ghost-button--active'
                              : ''
                          }`}
                          onClick={() =>
                            modelBenchmarkService.setEntryFeedback(
                              activeSession.id,
                              entry.id,
                              {
                                favorite: !entry.favorite,
                              }
                            )
                          }
                        >
                          收藏
                        </button>
                        <button
                          type="button"
                          className={`model-benchmark__ghost-button ${
                            entry.rejected
                              ? 'model-benchmark__ghost-button--danger'
                              : ''
                          }`}
                          onClick={() =>
                            modelBenchmarkService.setEntryFeedback(
                              activeSession.id,
                              entry.id,
                              {
                                rejected: !entry.rejected,
                              }
                            )
                          }
                        >
                          淘汰
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="model-benchmark__empty">
              先在左侧选定“同供应商多模型”或“同模型跨供应商”，把批测目标编满后再开跑。
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default ModelBenchmarkWorkbench;
