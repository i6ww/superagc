export const AUDIO_PLAYLIST_FAVORITES_ID = 'favorites';
export const AUDIO_PLAYLIST_ALL_ID = 'all-audio';
export const AUDIO_PLAYLIST_ALL_TRACKS_ID = 'all-tracks';

export interface AudioPlaylist {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  isSystem?: boolean;
}

export interface AudioPlaylistItem {
  playlistId: string;
  assetId: string;
  addedAt: number;
}

export interface AudioPlaylistContextValue {
  loading: boolean;
  playlists: AudioPlaylist[];
  playlistItems: Record<string, AudioPlaylistItem[]>;
  favoriteAssetIds: Set<string>;
  loadPlaylists: () => Promise<void>;
  createPlaylist: (name: string) => Promise<AudioPlaylist>;
  renamePlaylist: (playlistId: string, name: string) => Promise<void>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  addAssetToPlaylist: (assetId: string, playlistId: string) => Promise<void>;
  removeAssetFromPlaylist: (assetId: string, playlistId: string) => Promise<void>;
  removeAssetFromAllPlaylists: (assetId: string) => Promise<void>;
  toggleFavorite: (assetId: string) => Promise<boolean>;
  isFavorite: (assetId: string) => boolean;
  getPlaylistAssetIds: (playlistId: string) => string[];
}
