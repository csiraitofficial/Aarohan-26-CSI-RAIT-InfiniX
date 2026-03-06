/**
 * API Configuration - Dynamic Host Detection
 * 
 * Automatically uses the correct host for API calls:
 * - Via ngrok (HTTPS) → uses relative paths through Vite proxy
 * - On laptop (localhost) → uses localhost:port
 * - On mobile (via LAN IP) → uses the same IP:port
 */

// Detect if we're accessed via ngrok or external tunnel
const isViaTunnel = (): boolean => {
    if (typeof window === 'undefined') return false;
    const hostname = window.location.hostname;
    // ngrok URLs end with .ngrok.io, .ngrok-free.app, etc.
    // Also detect HTTPS which typically means tunneled
    return hostname.includes('ngrok') ||
        hostname.includes('.app') ||
        window.location.protocol === 'https:';
};

// Get the current host
const getApiHost = (): string => {
    if (typeof window !== 'undefined') {
        return window.location.hostname;
    }
    return 'localhost';
};

const API_HOST = getApiHost();
const USE_PROXY = isViaTunnel();

/**
 * API Endpoints Configuration
 * Uses relative paths for ngrok (via Vite proxy), absolute URLs for local access
 */
export const API_CONFIG = {
    // CCTV/Monitoring backend (also handles auth now)
    SIMULATION: USE_PROXY ? '' : `http://${API_HOST}:8785`,

    // Tier 1 Metro City simulation
    TIER1: USE_PROXY ? '' : `http://${API_HOST}:8767`,

    // Tier 2 District City simulation
    TIER2: USE_PROXY ? '' : `http://${API_HOST}:8768`,

    // Analytics/LSTM backend
    ANALYTICS: USE_PROXY ? '' : `http://${API_HOST}:8770`,

    // CCTV/Monitoring backend
    MONITORING: USE_PROXY ? '' : `http://${API_HOST}:8785`,

    // Comparison backend
    COMPARISON: USE_PROXY ? '' : `http://${API_HOST}:8790`,

    // Pothole detection backend
    POTHOLE: USE_PROXY ? '' : `http://${API_HOST}:8765`,
} as const;

/**
 * Helper to build full API URL
 * @param base - Base from API_CONFIG (e.g., API_CONFIG.TIER1)
 * @param path - API path (e.g., "/api/sim/start")
 */
export const buildApiUrl = (base: string, path: string): string => {
    return `${base}${path.startsWith('/') ? path : '/' + path}`;
};

/**
 * Get the current API host (useful for WebSocket connections)
 */
export const getHost = (): string => API_HOST;

/**
 * Build WebSocket URL
 * @param port - Backend port
 * @param path - WebSocket path
 */
export const buildWsUrl = (port: number, path: string): string => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${API_HOST}:${port}${path.startsWith('/') ? path : '/' + path}`;
};

export default API_CONFIG;
