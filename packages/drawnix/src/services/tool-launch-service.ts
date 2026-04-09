import { toolWindowService } from './tool-window-service';
import { canvasAudioPlaybackService, type CanvasAudioPlaybackSource } from './canvas-audio-playback-service';
import { MUSIC_PLAYER_TOOL_ID } from '../tools/tool-ids';
import type { ToolDefinition } from '../types/toolbox.types';

export function openMusicPlayerTool(): boolean {
  const tool: ToolDefinition = {
    id: MUSIC_PLAYER_TOOL_ID,
    name: '音乐播放器',
    description: '从素材库选择音频并后台播放，可与画布播放控件联动',
    icon: '🎵',
    category: 'utilities',
    component: 'music-player',
    defaultWidth: 420,
    defaultHeight: 640,
  };

  toolWindowService.openTool(tool, { autoPin: true });
  return true;
}

interface OpenMusicPlayerAndPlayOptions {
  source: CanvasAudioPlaybackSource;
  queue?: CanvasAudioPlaybackSource[];
  playlist?: {
    playlistId: string;
    playlistName: string;
  };
}

export async function openMusicPlayerToolAndPlay(
  options: OpenMusicPlayerAndPlayOptions
): Promise<boolean> {
  openMusicPlayerTool();

  if (options.queue && options.queue.length > 0) {
    canvasAudioPlaybackService.setQueue(
      options.queue,
      options.playlist
        ? {
            queueSource: 'playlist',
            playlistId: options.playlist.playlistId,
            playlistName: options.playlist.playlistName,
          }
        : undefined
    );
  }

  await canvasAudioPlaybackService.togglePlayback(options.source);
  return true;
}
