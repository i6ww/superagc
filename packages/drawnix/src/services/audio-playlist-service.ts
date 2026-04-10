import localforage from 'localforage';
import {
  AUDIO_PLAYLIST_FAVORITES_ID,
  type AudioPlaylist,
  type AudioPlaylistItem,
} from '../types/audio-playlist.types';

const PLAYLIST_META_STORE = 'audio_playlists';
const PLAYLIST_ITEMS_STORE = 'audio_playlist_items';

class AudioPlaylistService {
  private playlistStore: LocalForage | null = null;
  private playlistItemsStore: LocalForage | null = null;

  async initialize(): Promise<void> {
    if (!this.playlistStore) {
      this.playlistStore = localforage.createInstance({
        name: 'aitu-audio-playlists',
        storeName: PLAYLIST_META_STORE,
      });
    }

    if (!this.playlistItemsStore) {
      this.playlistItemsStore = localforage.createInstance({
        name: 'aitu-audio-playlists',
        storeName: PLAYLIST_ITEMS_STORE,
      });
    }

    await this.ensureFavoritesPlaylist();
  }

  private ensureInitialized(): void {
    if (!this.playlistStore || !this.playlistItemsStore) {
      throw new Error('AudioPlaylistService not initialized');
    }
  }

  private getNow(): number {
    return Date.now();
  }

  private async ensureFavoritesPlaylist(): Promise<void> {
    this.ensureInitialized();
    const existing = await this.playlistStore!.getItem<AudioPlaylist>(
      AUDIO_PLAYLIST_FAVORITES_ID
    );
    if (existing) {
      return;
    }

    const now = this.getNow();
    const playlist: AudioPlaylist = {
      id: AUDIO_PLAYLIST_FAVORITES_ID,
      name: '收藏',
      createdAt: now,
      updatedAt: now,
      isSystem: true,
    };
    await this.playlistStore!.setItem(playlist.id, playlist);
    await this.playlistItemsStore!.setItem(playlist.id, []);
  }

  async listPlaylists(): Promise<AudioPlaylist[]> {
    this.ensureInitialized();
    const keys = await this.playlistStore!.keys();
    const playlists = await Promise.all(
      keys.map((key) => this.playlistStore!.getItem<AudioPlaylist>(key))
    );
    return playlists
      .filter((playlist): playlist is AudioPlaylist => !!playlist)
      .sort((left, right) => {
        if (left.id === AUDIO_PLAYLIST_FAVORITES_ID) return -1;
        if (right.id === AUDIO_PLAYLIST_FAVORITES_ID) return 1;
        return right.updatedAt - left.updatedAt;
      });
  }

  async getPlaylistItems(playlistId: string): Promise<AudioPlaylistItem[]> {
    this.ensureInitialized();
    return (
      (await this.playlistItemsStore!.getItem<AudioPlaylistItem[]>(
        playlistId
      )) || []
    );
  }

  async listPlaylistItems(): Promise<Record<string, AudioPlaylistItem[]>> {
    const playlists = await this.listPlaylists();
    const pairs = await Promise.all(
      playlists.map(
        async (playlist) =>
          [playlist.id, await this.getPlaylistItems(playlist.id)] as const
      )
    );
    return Object.fromEntries(pairs);
  }

  async createPlaylist(name: string): Promise<AudioPlaylist> {
    this.ensureInitialized();
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('播放列表名称不能为空');
    }
    const existing = await this.listPlaylists();
    if (existing.some((playlist) => playlist.name === trimmedName)) {
      throw new Error('播放列表名称已存在');
    }
    const now = this.getNow();
    const playlist: AudioPlaylist = {
      id: crypto.randomUUID(),
      name: trimmedName,
      createdAt: now,
      updatedAt: now,
    };
    await this.playlistStore!.setItem(playlist.id, playlist);
    await this.playlistItemsStore!.setItem(playlist.id, []);
    return playlist;
  }

  async renamePlaylist(playlistId: string, name: string): Promise<void> {
    this.ensureInitialized();
    const playlist = await this.playlistStore!.getItem<AudioPlaylist>(
      playlistId
    );
    if (!playlist) {
      throw new Error('播放列表不存在');
    }
    if (playlist.isSystem) {
      throw new Error('系统播放列表不支持重命名');
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('播放列表名称不能为空');
    }
    const existing = await this.listPlaylists();
    if (
      existing.some(
        (item) => item.id !== playlistId && item.name === trimmedName
      )
    ) {
      throw new Error('播放列表名称已存在');
    }
    await this.playlistStore!.setItem(playlistId, {
      ...playlist,
      name: trimmedName,
      updatedAt: this.getNow(),
    });
  }

  async deletePlaylist(playlistId: string): Promise<void> {
    this.ensureInitialized();
    const playlist = await this.playlistStore!.getItem<AudioPlaylist>(
      playlistId
    );
    if (!playlist) {
      return;
    }
    if (playlist.isSystem) {
      throw new Error('系统播放列表不可删除');
    }
    await this.playlistStore!.removeItem(playlistId);
    await this.playlistItemsStore!.removeItem(playlistId);
  }

  async addAssetToPlaylist(assetId: string, playlistId: string): Promise<void> {
    this.ensureInitialized();
    const playlist = await this.playlistStore!.getItem<AudioPlaylist>(
      playlistId
    );
    if (!playlist) {
      throw new Error('播放列表不存在');
    }
    const items = await this.getPlaylistItems(playlistId);
    if (items.some((item) => item.assetId === assetId)) {
      return;
    }
    const nextItems: AudioPlaylistItem[] = [
      {
        playlistId,
        assetId,
        addedAt: this.getNow(),
      },
      ...items,
    ];
    await this.playlistItemsStore!.setItem(playlistId, nextItems);
    await this.playlistStore!.setItem(playlistId, {
      ...playlist,
      updatedAt: this.getNow(),
    });
  }

  async removeAssetFromPlaylist(
    assetId: string,
    playlistId: string
  ): Promise<void> {
    this.ensureInitialized();
    const playlist = await this.playlistStore!.getItem<AudioPlaylist>(
      playlistId
    );
    if (!playlist) {
      return;
    }
    const items = await this.getPlaylistItems(playlistId);
    const nextItems = items.filter((item) => item.assetId !== assetId);
    await this.playlistItemsStore!.setItem(playlistId, nextItems);
    await this.playlistStore!.setItem(playlistId, {
      ...playlist,
      updatedAt: this.getNow(),
    });
  }

  async removeAssetFromAllPlaylists(assetId: string): Promise<void> {
    const playlists = await this.listPlaylists();
    await Promise.all(
      playlists.map((playlist) =>
        this.removeAssetFromPlaylist(assetId, playlist.id)
      )
    );
  }

  async toggleFavorite(assetId: string): Promise<boolean> {
    const items = await this.getPlaylistItems(AUDIO_PLAYLIST_FAVORITES_ID);
    const exists = items.some((item) => item.assetId === assetId);
    if (exists) {
      await this.removeAssetFromPlaylist(
        assetId,
        AUDIO_PLAYLIST_FAVORITES_ID
      );
      return false;
    }
    await this.addAssetToPlaylist(assetId, AUDIO_PLAYLIST_FAVORITES_ID);
    return true;
  }
}

export const audioPlaylistService = new AudioPlaylistService();
