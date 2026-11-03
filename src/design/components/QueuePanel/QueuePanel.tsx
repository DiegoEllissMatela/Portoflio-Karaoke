import React, { useState, useMemo, useEffect } from 'react';
import { ListMusic, Search, X, Plus, Music, Shuffle } from 'lucide-react';
import type { KaraokeState, AudioControls, AppState } from '../../../logic/types/logicTypes';
import styles from './QueuePanel.module.scss';

interface QueuePanelProps {
  state: KaraokeState;
  controls: AudioControls;
  appState?: AppState;
}

export const QueuePanel: React.FC<QueuePanelProps> = ({ state, controls, appState }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [displayLimit, setDisplayLimit] = useState(40);

  // Debounce search query by 180ms to avoid re-filtering 48k items on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 180);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset limit when query changes
  useEffect(() => {
    setDisplayLimit(40);
  }, [debouncedQuery]);

  const songPool = state.playlist.length > 0 ? state.playlist : (state.allAvailableSongs || []);

  // Filter using pre-lowercased searchKey (0 runtime allocations)
  const filteredSongs = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return songPool;
    return songPool.filter((song) => {
      const key = song.searchKey || `${song.title} ${song.artist}`.toLowerCase();
      return key.includes(q);
    });
  }, [songPool, debouncedQuery]);

  const visibleSongs = useMemo(() => {
    return filteredSongs.slice(0, displayLimit);
  }, [filteredSongs, displayLimit]);


  return (
    <aside
      className={styles.sidebarContainer}
      style={appState?.mainContentMaxHeight && appState.mainContentMaxHeight > 0 ? { maxHeight: `${appState.mainContentMaxHeight}px` } : undefined}
    >
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <ListMusic size={20} className={styles.titleIcon} />
          <h3 className={styles.title}>Song Queue</h3>
        </div>
        <button
          type="button"
          className={styles.headerShuffleBtn}
          onClick={() => controls.shufflePlaylist()}
          title="Shuffle songs with balanced artist separation"
        >
          <Shuffle size={18} />
        </button>
      </div>

      {/* Queued Songs Section */}
      <div className={styles.queuedSection}>
        <div className={styles.sectionLabel}>
          <span>Up Next in Queue</span>
          {state.songQueue && state.songQueue.length > 0 && (
            <button
              type="button"
              className={styles.clearQueueBtn}
              onClick={() => controls.clearQueue()}
              title="Clear all queued songs"
            >
              Clear
            </button>
          )}
        </div>
        <div className={styles.queuedList}>
          {/* Host manual queue */}
          {state.songQueue && state.songQueue.length > 0 ? (
            state.songQueue.map((song, idx) => (
              <div key={`${song.id}-${idx}`} className={styles.queuedItem}>
                <span className={styles.itemIndex}>{idx + 1}</span>
                <div className={styles.itemMeta}>
                  <span className={styles.itemTitle}>{song.title}</span>
                  <span className={styles.itemArtist}>{song.artist}</span>
                </div>
                <button
                  type="button"
                  className={styles.removeItemBtn}
                  onClick={() => controls.removeFromQueue(idx)}
                  title="Remove from queue"
                >
                  <X size={14} />
                </button>
              </div>
            ))
          ) : null}

          {/* Mobile phone player queues */}
          {Object.entries(appState?.playerQueues || {}).map(([player, songs]) =>
            songs.map((song, sIdx) => (
              <div key={`remote-${player}-${song.id}-${sIdx}`} className={styles.queuedItem} style={{ borderLeft: '3px solid #06b6d4' }}>
                <span className={styles.itemIndex} style={{ color: '#06b6d4' }}>🎤</span>
                <div className={styles.itemMeta}>
                  <span className={styles.itemTitle}>{song.title}</span>
                  <span className={styles.itemArtist}>
                    {song.artist} &bull; <strong style={{ color: '#06b6d4' }}>{player}</strong>
                  </span>
                </div>
              </div>
            ))
          )}

          {(!state.songQueue || state.songQueue.length === 0) &&
           (!appState?.playerQueues || Object.values(appState.playerQueues).every(q => !q || q.length === 0)) && (
            <div className={styles.emptyQueueNotice}>
              <span>No songs in queue</span>
              <small>Choose and queue songs below or via mobile QR</small>
            </div>
          )}
        </div>
      </div>

      {/* Direct Add/Queue Songs Section */}
      <div className={styles.addSection}>
        <div className={styles.sectionLabel}>
          <span>Queue a Song</span>
        </div>

        {/* Search Input */}
        <div className={styles.searchWrapper}>
          <Search size={14} className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search song or artist..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className={styles.clearSearchBtn}
              title="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Filtered Song List */}
        <div className={styles.songPoolList}>
          {filteredSongs.length === 0 ? (
            <div className={styles.noSongsNotice}>
              <Music size={18} />
              <span>No songs found</span>
            </div>
          ) : (
            <>
              {visibleSongs.map((song) => {
                const isCurrent = state.currentSong?.id === song.id;
                const queuedCount = (state.songQueue || []).filter((s) => s.id === song.id).length;
                const isQueued = queuedCount > 0;

                return (
                  <div
                    key={song.id}
                    className={`${styles.songCard} ${isCurrent ? styles.activeSongCard : ''}`}
                  >
                    <div className={styles.songCardMeta}>
                      <span className={styles.songCardTitle}>{song.title}</span>
                      <span className={styles.songCardArtist}>{song.artist}</span>
                    </div>
                    {isCurrent && (
                      <span className={styles.playingDot} title="Now Playing" />
                    )}
                    <button
                      type="button"
                      className={`${styles.queueBtn} ${isQueued ? styles.isQueued : ''}`}
                      onClick={() => controls.addToQueue(song)}
                      title={isQueued ? `Queued (${queuedCount}x) - Click to queue again` : `Queue ${song.title}`}
                    >
                      <Plus size={15} />
                      {isQueued && <span>{queuedCount}</span>}
                    </button>
                  </div>
                );
              })}

              {visibleSongs.length < filteredSongs.length && (
                <div className={styles.loadMoreContainer}>
                  <button
                    type="button"
                    className={styles.loadMoreBtn}
                    onClick={() => setDisplayLimit((prev) => prev + 40)}
                  >
                    Load More ({filteredSongs.length - visibleSongs.length} remaining)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </aside>
  );
};
