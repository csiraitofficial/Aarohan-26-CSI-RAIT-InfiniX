/**
 * Simulation Store - Shared state for vehicle counts between simulation-new and Analytics
 * Implements a simple event-based store pattern
 */

export interface VehicleCounts {
    cars: number;
    bikes: number;
    trucks: number;
    total: number;
    timestamp: number;
}

export interface PredictionPoint {
    time: string;
    actual: number | null;
    predicted: number;
}

// ============================================================================
// SIMULATION STATE MANAGEMENT
// ============================================================================

export interface SimulationState {
    running: boolean;
    step: number;
    connected: boolean;
    useOptimizationMode: boolean;
}

// Global simulation state that persists across page navigation
let simulationState: SimulationState = {
    running: false,
    step: 0,
    connected: false,
    useOptimizationMode: false,
};

const simulationListeners: Set<() => void> = new Set();
let pollInterval: ReturnType<typeof setInterval> | null = null;

export function getSimulationState(): SimulationState {
    return { ...simulationState };
}

export function setSimulationState(updates: Partial<SimulationState>): void {
    simulationState = { ...simulationState, ...updates };
    simulationListeners.forEach(l => l());
}

export function subscribeSimulation(listener: () => void): () => void {
    simulationListeners.add(listener);
    return () => simulationListeners.delete(listener);
}

export function setPollInterval(interval: ReturnType<typeof setInterval> | null): void {
    if (pollInterval) {
        clearInterval(pollInterval);
    }
    pollInterval = interval;
}

export function getPollInterval(): ReturnType<typeof setInterval> | null {
    return pollInterval;
}

// ============================================================================
// VEHICLE COUNTS FOR ANALYTICS
// ============================================================================

// Rolling history of vehicle counts (last 60 data points)
const MAX_HISTORY = 60;
const history: VehicleCounts[] = [];
const listeners: Set<() => void> = new Set();

// Current smoothed values for prediction
let smoothedTotal = 0;
const SMOOTHING_FACTOR = 0.3; // Exponential smoothing alpha


/**
 * Push new vehicle counts to the store
 */
export function pushVehicleCounts(counts: Omit<VehicleCounts, 'timestamp' | 'total'>): void {
    const total = counts.cars + counts.bikes + counts.trucks;
    const dataPoint: VehicleCounts = {
        ...counts,
        total,
        timestamp: Date.now()
    };

    // Update history
    history.push(dataPoint);
    if (history.length > MAX_HISTORY) {
        history.shift();
    }

    // Update exponential smoothing
    if (smoothedTotal === 0) {
        smoothedTotal = total;
    } else {
        smoothedTotal = SMOOTHING_FACTOR * total + (1 - SMOOTHING_FACTOR) * smoothedTotal;
    }

    // Notify listeners
    listeners.forEach(listener => listener());
}

/**
 * Get the history of vehicle counts
 */
export function getHistory(): VehicleCounts[] {
    return [...history];
}

/**
 * Get the latest counts
 */
export function getLatestCounts(): VehicleCounts | null {
    return history.length > 0 ? history[history.length - 1] : null;
}

/**
 * Generate LSTM-style predictions using exponential smoothing
 * This simulates what an LSTM would predict based on recent trends
 */
export function generatePredictions(): PredictionPoint[] {
    const latest = getLatestCounts();
    if (!latest) {
        return [
            { time: 'Now', actual: 0, predicted: 0 },
            { time: '+15m', actual: null, predicted: 0 },
            { time: '+30m', actual: null, predicted: 0 },
            { time: '+45m', actual: null, predicted: 0 },
            { time: '+60m', actual: null, predicted: 0 },
        ];
    }

    // Calculate trend from history
    let trend = 0;
    if (history.length >= 5) {
        const recent = history.slice(-5);
        const oldAvg = (recent[0].total + recent[1].total) / 2;
        const newAvg = (recent[3].total + recent[4].total) / 2;
        trend = (newAvg - oldAvg) / 3; // Per step trend
    }

    // Generate predictions with some randomness (simulating uncertainty)
    const noise = () => (Math.random() - 0.5) * 2;

    return [
        { time: 'Now', actual: latest.total, predicted: Math.round(smoothedTotal) },
        { time: '+15m', actual: null, predicted: Math.max(0, Math.round(smoothedTotal + trend * 3 + noise())) },
        { time: '+30m', actual: null, predicted: Math.max(0, Math.round(smoothedTotal + trend * 6 + noise() * 1.5)) },
        { time: '+45m', actual: null, predicted: Math.max(0, Math.round(smoothedTotal + trend * 9 + noise() * 2)) },
        { time: '+60m', actual: null, predicted: Math.max(0, Math.round(smoothedTotal + trend * 12 + noise() * 2.5)) },
    ];
}

/**
 * Subscribe to store updates
 */
export function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/**
 * Clear all data (for testing)
 */
export function clearStore(): void {
    history.length = 0;
    smoothedTotal = 0;
    listeners.forEach(listener => listener());
}

/**
 * Synthesize vehicle counts from signal queues
 * Estimates vehicle types (Cars ~60%, Bikes ~30%, Trucks ~10%)
 */
export function synthesizeVehicleCounts(signals: any[]): Omit<VehicleCounts, 'timestamp' | 'total'> {
    let totalQueue = 0;

    // Sum up total queue length from all signals
    for (const signal of signals) {
        if (signal.queues) {
            totalQueue += (signal.queues.total || 0);
        }
    }

    // Heuristic distribution
    // This is an estimation since the backend only provides queue lengths (PCU-like)
    return {
        cars: Math.round(totalQueue * 0.6),
        bikes: Math.round(totalQueue * 0.3),
        trucks: Math.round(totalQueue * 0.1)
    };
}

/**
 * Check if backend is running
 */
export async function checkBackendStatus(serverUrl: string): Promise<boolean> {
    try {
        const res = await fetch(`${serverUrl}/api/sim/status`);
        if (!res.ok) return false;
        const data = await res.json();
        return data.running === true;
    } catch (e) {
        return false;
    }
}

/**
 * Fetch latest step from backend and push to store
 */
export async function fetchAndPushCounts(serverUrl: string): Promise<void> {
    try {
        const res = await fetch(`${serverUrl}/api/sim/step`);
        if (!res.ok) return;

        const data = await res.json();
        const counts = synthesizeVehicleCounts(data.signals || []);
        pushVehicleCounts(counts);

        // Also update simulation state if possible
        if (data.t !== undefined) {
            setSimulationState({
                running: true,
                step: data.t,
                connected: true
            });
        }
    } catch (e) {
        console.warn("Failed to fetch counts", e);
    }
}
