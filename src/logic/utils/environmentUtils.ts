/**
 * Detects whether the application is running in a local environment
 * (localhost, local LAN IP, file://, or Electron desktop wrapper)
 * vs a static cloud web host (e.g., Vercel, Netlify, GitHub Pages).
 */
export function isLocalEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const { hostname, protocol } = window.location;
  if (protocol === 'file:') return true;
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local')
  ) {
    return true;
  }
  // Private local area network ranges (e.g., 192.168.x.x, 10.x.x.x, 172.16-31.x.x)
  if (/^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) {
    return true;
  }
  // Electron environment detection
  if (
    typeof (window as any).electron !== 'undefined' ||
    typeof (window as any).electronAPI !== 'undefined'
  ) {
    return true;
  }
  return false;
}

