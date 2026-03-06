/**
 * Shared Incident/Alert Sync Service
 * 
 * Syncs incidents and alerts with the backend server so all devices
 * (mobile, laptop, etc.) share the same data.
 */

// Use relative URLs so they go through Vite proxy (works with ngrok)
const API_BASE = "";


export interface SharedIncident {
    id: string;
    type: 'accident' | 'breakdown' | 'road-closure' | 'event' | 'hazard' | 'congestion' | 'sos' | 'pothole';
    severity: 'low' | 'medium' | 'high' | 'critical';
    status: string;
    location: {
        coordinates: [number, number];
        address: string;
        landmark: string;
    };
    reportedBy: string;
    reporterPhone?: string;
    reportedAt: string;
    description: string;
    affectedLanes: number;
    notes: string[];
    assignedOfficers?: string[];
    timeline?: {
        reported: string;
        assigned?: string;
        arrived?: string;
        resolved?: string;
    };
}

export interface SharedAlert {
    id: string;
    type: 'violation' | 'incident' | 'system' | 'weather' | 'congestion';
    priority: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    location?: string;
    coordinates?: [number, number];
    reporterPhone?: string;
    timestamp: string;
    read: boolean;
}

/**
 * Fetch all incidents from the server
 */
export async function fetchIncidents(): Promise<SharedIncident[]> {
    try {
        const res = await fetch(`${API_BASE}/api/incidents`);
        if (!res.ok) return [];
        const data = await res.json();
        return data.incidents || [];
    } catch (e) {
        console.warn("Failed to fetch incidents:", e);
        return [];
    }
}

/**
 * Add a new incident to the server
 */
export async function addIncident(incident: SharedIncident): Promise<boolean> {
    try {
        const res = await fetch(`${API_BASE}/api/incidents`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(incident),
        });
        return res.ok;
    } catch (e) {
        console.error("Failed to add incident:", e);
        return false;
    }
}

/**
 * Delete an incident from the server
 */
export async function deleteIncident(incidentId: string): Promise<boolean> {
    try {
        const res = await fetch(`${API_BASE}/api/incidents/${incidentId}`, {
            method: "DELETE",
        });
        return res.ok;
    } catch (e) {
        console.error("Failed to delete incident:", e);
        return false;
    }
}

/**
 * Fetch all alerts from the server
 */
export async function fetchAlerts(): Promise<SharedAlert[]> {
    try {
        const res = await fetch(`${API_BASE}/api/alerts`);
        if (!res.ok) return [];
        const data = await res.json();
        return data.alerts || [];
    } catch (e) {
        console.warn("Failed to fetch alerts:", e);
        return [];
    }
}

/**
 * Add a new alert to the server
 */
export async function addAlert(alert: SharedAlert): Promise<boolean> {
    try {
        const res = await fetch(`${API_BASE}/api/alerts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(alert),
        });
        return res.ok;
    } catch (e) {
        console.error("Failed to add alert:", e);
        return false;
    }
}

/**
 * Mark an alert as read
 */
export async function markAlertRead(alertId: string): Promise<boolean> {
    try {
        const res = await fetch(`${API_BASE}/api/alerts/${alertId}/read`, {
            method: "PATCH",
        });
        return res.ok;
    } catch (e) {
        console.error("Failed to mark alert as read:", e);
        return false;
    }
}

/**
 * Delete an alert from the server
 */
export async function deleteAlert(alertId: string): Promise<boolean> {
    try {
        const res = await fetch(`${API_BASE}/api/alerts/${alertId}`, {
            method: "DELETE",
        });
        return res.ok;
    } catch (e) {
        console.error("Failed to delete alert:", e);
        return false;
    }
}
