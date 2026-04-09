import React, { useCallback, useMemo } from 'react';
import { Music4 } from 'lucide-react';
import { AudioTrackList, type AudioTrackListItem } from '../../../components/shared/AudioTrackList';
import {
  isReadingPlaybackSource,
  type PlaybackQueueItem,
} from '../../../services/canvas-audio-playback-service';
import { AssetType, type Asset } from '../../../types/asset.types';
import { useAllTracksPlaybackSources } from '../../../hooks/useAllTracksPlaybackSources';
import type { ReadingPlaybackSource } from '../../../services/reading-playback-source';

interface MusicPlayerQueueListProps {
  showPlaybackQueue: boolean;
  isReadingMode: boolean;
  isAllTracksTab: boolean;
  queueListItems: AudioTrackListItem[];
  audioAssetItems: AudioTrackListItem[];
  queue: PlaybackQueueItem[];
  assets: Asset[];
  activeReadingSourceId?: string;
  playing: boolean;
  getQueueItemId: (item: PlaybackQueueItem, index: number) => string;
  onPlayQueueItem: (itemId: string) => void;
  onPlayAsset: (assetId: string) => void;
  onContextMenu: (assetId: string, x: number, y: number) => void;
  onToggleFavorite: (assetId: string) => void;
  onSetReadingQueue: (queue: ReadingPlaybackSource[]) => void;
  onToggleReadingPlayback: (source: ReadingPlaybackSource) => void;
}

function resolveAssetIdFromQueueItem(
  item: PlaybackQueueItem,
  assets: Asset[]
): string | null {
  if (isReadingPlaybackSource(item)) return null;
  if (item.elementId?.startsWith('asset:')) {
    return item.elementId.slice('asset:'.length);
  }
  return (
    assets.find(
      (asset) => asset.type === AssetType.AUDIO && asset.url === item.audioUrl
    )?.id || null
  );
}

export const MusicPlayerQueueList: React.FC<MusicPlayerQueueListProps> = ({
  showPlaybackQueue,
  isReadingMode,
  isAllTracksTab,
  queueListItems,
  audioAssetItems,
  queue,
  assets,
  activeReadingSourceId,
  playing,
  getQueueItemId,
  onPlayQueueItem,
  onPlayAsset,
  onContextMenu,
  onToggleFavorite,
  onSetReadingQueue,
  onToggleReadingPlayback,
}) => {
  const { noteMetas, loadReadingSource, buildReadingQueue } = useAllTracksPlaybackSources();

  const handlePlayAllTracksItem = useCallback(
    async (noteId: string) => {
      const source = await loadReadingSource(noteId);
      if (!source) return;
      const fullQueue = await buildReadingQueue(noteId);
      onSetReadingQueue(fullQueue);
      onToggleReadingPlayback(source);
    },
    [loadReadingSource, buildReadingQueue, onSetReadingQueue, onToggleReadingPlayback]
  );

  const allTracksListItems = useMemo(
    () =>
      noteMetas.map((meta) => ({
        id: meta.id,
        title: meta.title || '未命名笔记',
        subtitle: new Date(meta.updatedAt).toLocaleDateString('zh-CN'),
        canFavorite: false,
        isActive: activeReadingSourceId?.includes(meta.id) === true,
        isPlaying: playing && activeReadingSourceId?.includes(meta.id) === true,
      })),
    [noteMetas, activeReadingSourceId, playing]
  );

  if (isAllTracksTab && !showPlaybackQueue) {
    if (allTracksListItems.length === 0) {
      return (
        <div className="music-player-tool__empty">
          <Music4 size={18} />
          <span>知识库还没有笔记</span>
        </div>
      );
    }
    return (
      <AudioTrackList
        items={allTracksListItems}
        onSelect={(item) => void handlePlayAllTracksItem(item.id)}
        onTogglePlayback={(item) => void handlePlayAllTracksItem(item.id)}
        showPlaybackIndicator
      />
    );
  }

  if (showPlaybackQueue) {
    return (
      <AudioTrackList
        className="audio-track-list--queue"
        items={queueListItems}
        onSelect={(item) => onPlayQueueItem(item.id)}
        onContextMenu={(item, event) => {
          if (isReadingMode) return;
          const selectedItem = queue.find(
            (queueItem, index) => getQueueItemId(queueItem, index) === item.id
          );
          if (!selectedItem || isReadingPlaybackSource(selectedItem)) return;
          const assetId = resolveAssetIdFromQueueItem(selectedItem, assets);
          if (!assetId) return;
          event.preventDefault();
          event.stopPropagation();
          onContextMenu(assetId, event.clientX, event.clientY);
        }}
        onToggleFavorite={(item) => {
          const selectedItem = queue.find(
            (queueItem, index) => getQueueItemId(queueItem, index) === item.id
          );
          if (!selectedItem || isReadingPlaybackSource(selectedItem)) return;
          const assetId = resolveAssetIdFromQueueItem(selectedItem, assets);
          if (assetId) onToggleFavorite(assetId);
        }}
        onTogglePlayback={(item) => onPlayQueueItem(item.id)}
        showFavoriteButton={!isReadingMode}
        showPlaybackIndicator
      />
    );
  }

  if (audioAssetItems.length === 0) {
    return (
      <div className="music-player-tool__empty">
        <Music4 size={18} />
        <span>当前列表里还没有音频</span>
      </div>
    );
  }

  return (
    <AudioTrackList
      items={audioAssetItems}
      onSelect={(item) => onPlayAsset(item.id)}
      onContextMenu={(item, event) => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenu(item.id, event.clientX, event.clientY);
      }}
      onToggleFavorite={(item) => onToggleFavorite(item.id)}
      onTogglePlayback={(item) => onPlayAsset(item.id)}
      showFavoriteButton
      showPlaybackIndicator
    />
  );
};
