/**
 * ============================================================================
 * BULLETPROOF ALBUM ART & OFFLINE COVER UTILITIES
 * ============================================================================
 * 
 * Provides local vector SVG album arts and bulletproof error fallback
 * so songs NEVER show broken image icons, even when offline.
 */

export const LOCAL_ALBUM_COVERS = [
  '/Images/cover-1.svg',
  '/Images/cover-2.svg',
  '/Images/cover-3.svg',
  '/Images/cover-4.svg',
] as const;

export const DEFAULT_ALBUM_ART = '/Images/cover-default.svg';

/**
 * Self-contained inline SVG Data URI that requires zero network requests
 * and can never fail to load or 404.
 */
export const INLINE_FALLBACK_COVER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg width="400" height="400" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="400" height="400" rx="32" fill="#120a1f"/>
    <circle cx="200" cy="200" r="140" stroke="#8b5cf6" stroke-width="3" stroke-opacity="0.6"/>
    <circle cx="200" cy="200" r="110" stroke="rgba(255,255,255,0.1)" stroke-width="1.5" stroke-dasharray="6 6"/>
    <circle cx="200" cy="200" r="50" fill="#8b5cf6" fill-opacity="0.25" stroke="#8b5cf6" stroke-width="2"/>
    <circle cx="200" cy="200" r="12" fill="#120a1f" stroke="#ec4899" stroke-width="2"/>
    <g transform="translate(182, 172) scale(1.5)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" fill="#ffffff" />
      <circle cx="18" cy="16" r="3" fill="#ffffff" />
    </g>
  </svg>`
);

/**
 * Deterministically assigns a local cover based on song ID or index
 */
export function getLocalCoverForSong(seed: string | number): string {
  if (typeof seed === 'number') {
    return LOCAL_ALBUM_COVERS[Math.abs(seed) % LOCAL_ALBUM_COVERS.length];
  }
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return LOCAL_ALBUM_COVERS[Math.abs(hash) % LOCAL_ALBUM_COVERS.length];
}

/**
 * Universal error handler for <img> elements.
 * Automatically swaps out broken images with a guaranteed local / inline fallback.
 */
export function handleAlbumArtError(event: React.SyntheticEvent<HTMLImageElement>): void {
  const img = event.currentTarget;
  // Prevent infinite error loop
  img.onerror = null;

  // Try local default cover first, or directly inline SVG data URI if already failed
  if (img.src && (img.src.endsWith(DEFAULT_ALBUM_ART) || img.src.includes('cover-default.svg'))) {
    img.src = INLINE_FALLBACK_COVER;
  } else {
    img.src = DEFAULT_ALBUM_ART;
  }
}
