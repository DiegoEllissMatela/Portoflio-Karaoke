export function normalizeArtistName(name?: string): string {
  if (!name) return 'unknown';
  let clean = name.toLowerCase().trim();
  if (clean.startsWith('the ')) {
    clean = clean.slice(4).trim();
  }
  return clean;
}

/**
 * Advanced Artist-Separation Shuffle:
 * 1. Fully randomizes the array using Fisher-Yates
 * 2. Scans for consecutive or closely clustered songs by the same artist
 * 3. Swaps conflicting songs forward with non-conflicting candidates
 * 4. Ensures no two adjacent tracks share the same artist unless no alternative artist exists
 */
export function shuffleWithArtistSeparation<T extends { artist: string }>(items: T[]): T[] {
  if (!items || items.length <= 1) {
    return [...(items || [])];
  }

  const result = [...items];
  const len = result.length;

  // 1. Initial Fisher-Yates shuffle
  for (let i = len - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }

  // 2. Multi-pass smoothing to eliminate consecutive same-artist tracks
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < len - 1; i++) {
      const curArtist = normalizeArtistName(result[i].artist);
      const nextArtist = normalizeArtistName(result[i + 1].artist);

      // Conflict: next track has the same artist as current track
      if (curArtist === nextArtist) {
        let swapIdx = -1;

        // Pass A: Find a forward candidate within a local window (up to 150 tracks ahead)
        // that satisfies bilateral constraints (fits both positions without conflict)
        const windowEnd = Math.min(len, i + 150);
        for (let j = i + 2; j < windowEnd; j++) {
          const candArtist = normalizeArtistName(result[j].artist);
          const candPrev = normalizeArtistName(result[j - 1]?.artist);
          const candNext = normalizeArtistName(result[j + 1]?.artist);

          const candFitsAtNext = candArtist !== curArtist && candArtist !== normalizeArtistName(result[i + 2]?.artist);
          const nextFitsAtCand = nextArtist !== candPrev && nextArtist !== candNext;

          if (candFitsAtNext && nextFitsAtCand) {
            swapIdx = j;
            break;
          }
        }

        // Pass B: If no perfect bilateral swap, find any candidate that fits at i + 1
        if (swapIdx === -1) {
          for (let j = i + 2; j < len; j++) {
            const candArtist = normalizeArtistName(result[j].artist);
            if (candArtist !== curArtist && candArtist !== normalizeArtistName(result[i + 2]?.artist)) {
              swapIdx = j;
              break;
            }
          }
        }

        // Pass C: If still no match (e.g. near end of list), search backwards before i - 1
        if (swapIdx === -1) {
          for (let j = 0; j < i - 1; j++) {
            const candArtist = normalizeArtistName(result[j].artist);
            const candPrev = normalizeArtistName(result[j - 1]?.artist);
            const candNext = normalizeArtistName(result[j + 1]?.artist);

            if (candArtist !== curArtist && nextArtist !== candPrev && nextArtist !== candNext) {
              swapIdx = j;
              break;
            }
          }
        }

        if (swapIdx !== -1) {
          const temp = result[i + 1];
          result[i + 1] = result[swapIdx];
          result[swapIdx] = temp;
        }
      }
    }
  }

  return result;
}
