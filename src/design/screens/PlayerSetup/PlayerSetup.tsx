import React, { useState, useEffect } from 'react';
import { Plus, X, Play } from 'lucide-react';
import LottieModule from 'lottie-react';
// Handle Vite CJS/ESM interop
const Lottie = (LottieModule as any).default || LottieModule;
import styles from './PlayerSetup.module.scss';

interface PlayerSetupProps {
  initialPlayers?: string[];
  onStartGame: (players: string[]) => void;
}

export const PlayerSetup: React.FC<PlayerSetupProps> = ({ initialPlayers = [], onStartGame }) => {
  const [players, setPlayers] = useState<string[]>(initialPlayers);
  const [inputValue, setInputValue] = useState('');
  const [animationData, setAnimationData] = useState<any>(null);

  useEffect(() => {
    fetch('/AnimatedIcons/People.json')
      .then((res) => res.json())
      .then((data) => setAnimationData(data))
      .catch((err) => console.error('Failed to load animation', err));
  }, []);

  const handleAddPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    const name = inputValue.trim();
    if (name && !players.includes(name)) {
      setPlayers([...players, name]);
      setInputValue('');
    }
  };

  const handleRemovePlayer = (nameToRemove: string) => {
    setPlayers(players.filter(p => p !== nameToRemove));
  };

  return (
    <div className={styles.screenContainer}>
      <div className={styles.setupCard}>
        <div className={styles.header}>
          {animationData && (
            <Lottie animationData={animationData} loop={true} style={{ width: 80, height: 80, marginTop: -20 }} />
          )}
          <h2>Add Players</h2>
        </div>

        <form onSubmit={handleAddPlayer} className={styles.inputGroup}>
          <input
            type="text"
            placeholder="Enter player name..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className={styles.input}
          />
          <button type="submit" className={styles.addBtn} disabled={!inputValue.trim()}>
            <Plus size={20} />
            Add
          </button>
        </form>

        <div className={styles.playerList}>
          {players.length === 0 ? (
            <div className={styles.emptyState}>No players added yet. Add at least one to start!</div>
          ) : (
            players.map((player) => (
              <div key={player} className={styles.playerTag}>
                <span>{player}</span>
                <button onClick={() => handleRemovePlayer(player)} className={styles.removeBtn}>
                  <X size={16} />
                </button>
              </div>
            ))
          )}
        </div>

        <button 
          className={styles.startBtn} 
          onClick={() => onStartGame(players)}
          disabled={players.length === 0}
        >
          <Play size={20} />
          Continue to Game
        </button>
      </div>
    </div>
  );
};
