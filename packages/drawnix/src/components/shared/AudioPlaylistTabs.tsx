import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Heart, ListMusic, Pencil, Plus, Trash2 } from 'lucide-react';
import classNames from 'classnames';
import type { AudioPlaylist, AudioPlaylistItem } from '../../types/audio-playlist.types';
import {
  AUDIO_PLAYLIST_ALL_ID,
  AUDIO_PLAYLIST_FAVORITES_ID,
} from '../../types/audio-playlist.types';
import './audio-playlist-tabs.scss';

interface AudioPlaylistTabsProps {
  className?: string;
  selectedPlaylistId: string;
  allCount: number;
  playlists: AudioPlaylist[];
  playlistItems: Record<string, AudioPlaylistItem[]>;
  onSelect: (playlistId: string) => void;
  onCreate: () => void;
  onRename?: (playlist: AudioPlaylist) => void;
  onDelete?: (playlist: AudioPlaylist) => void;
  allLabel?: string;
  createLabel?: string;
}

export const AudioPlaylistTabs: React.FC<AudioPlaylistTabsProps> = ({
  className,
  selectedPlaylistId,
  allCount,
  playlists,
  playlistItems,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  allLabel = '全部音频',
  createLabel = '新建播放列表',
}) => {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    playlist: AudioPlaylist;
  } | null>(null);

  const manageable = useMemo(
    () => typeof onRename === 'function' || typeof onDelete === 'function',
    [onDelete, onRename]
  );

  useEffect(() => {
    if (!contextMenu) return;

    const closeMenu = () => setContextMenu(null);
    document.addEventListener('click', closeMenu);
    document.addEventListener('scroll', closeMenu, true);

    return () => {
      document.removeEventListener('click', closeMenu);
      document.removeEventListener('scroll', closeMenu, true);
    };
  }, [contextMenu]);

  return (
    <>
      <div className={classNames('audio-playlist-tabs', className)}>
        <button
          type="button"
          className={classNames('audio-playlist-tabs__chip', {
            'audio-playlist-tabs__chip--active': selectedPlaylistId === AUDIO_PLAYLIST_ALL_ID,
          })}
          onClick={() => onSelect(AUDIO_PLAYLIST_ALL_ID)}
          onContextMenu={
            manageable
              ? (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setContextMenu({
                    x: event.clientX,
                    y: event.clientY,
                    playlist: {
                      id: AUDIO_PLAYLIST_ALL_ID,
                      name: allLabel,
                      createdAt: 0,
                      updatedAt: 0,
                      isSystem: true,
                    },
                  });
                }
              : undefined
          }
        >
          <ListMusic size={14} />
          <span>{allLabel}</span>
          <span className="audio-playlist-tabs__count">{allCount}</span>
        </button>

        {playlists.map((playlist) => {
          const playlistCount = (playlistItems[playlist.id] || []).length;
          const isFavorites = playlist.id === AUDIO_PLAYLIST_FAVORITES_ID;
          const isManageable = manageable;

          return (
            <button
              key={playlist.id}
              type="button"
              className={classNames('audio-playlist-tabs__chip', {
                'audio-playlist-tabs__chip--active': selectedPlaylistId === playlist.id,
              })}
              onClick={() => onSelect(playlist.id)}
              onContextMenu={
                isManageable
                  ? (event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setContextMenu({
                        x: event.clientX,
                        y: event.clientY,
                        playlist,
                      });
                    }
                  : undefined
              }
            >
              {isFavorites ? <Heart size={14} /> : <ListMusic size={14} />}
              <span>{playlist.name}</span>
              <span className="audio-playlist-tabs__count">{playlistCount}</span>
            </button>
          );
        })}

        <button
          type="button"
          className="audio-playlist-tabs__create"
          onClick={onCreate}
        >
          <Plus size={14} />
          <span>{createLabel}</span>
        </button>
      </div>

      {contextMenu &&
        createPortal(
          <div
            className="audio-playlist-tabs__context-menu"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="audio-playlist-tabs__context-item"
              onClick={() => {
                setContextMenu(null);
                onCreate();
              }}
            >
              <Plus size={14} />
              <span>新建播放列表</span>
            </button>

            {!contextMenu.playlist.isSystem && onRename ? (
              <button
                type="button"
                className="audio-playlist-tabs__context-item"
                onClick={() => {
                  setContextMenu(null);
                  onRename(contextMenu.playlist);
                }}
              >
                <Pencil size={14} />
                <span>重命名</span>
              </button>
            ) : null}

            {!contextMenu.playlist.isSystem && onDelete ? (
              <button
                type="button"
                className="audio-playlist-tabs__context-item audio-playlist-tabs__context-item--danger"
                onClick={() => {
                  setContextMenu(null);
                  onDelete(contextMenu.playlist);
                }}
              >
                <Trash2 size={14} />
                <span>删除播放列表</span>
              </button>
            ) : null}
          </div>,
          document.body
        )}
    </>
  );
};
