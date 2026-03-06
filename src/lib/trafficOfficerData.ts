// Comprehensive Traffic Officer Data Management System
// This module provides all data structures and simulation for traffic management

export interface TrafficSignal {
    id: string;
    name: string;
    location: string;
    coordinates: [number, number];
    status: 'operational' | 'warning' | 'offline' | 'maintenance';
    currentPhase: 'red' | 'yellow' | 'green';
    timings: {
        redDuration: number;
        yellowDuration: number;
        greenDuration: number;
    };
    adaptiveMode: boolean;
    lastUpdated: string;
    trafficDensity: number;
    vehicleCount: number;
}

export interface Officer {
    id: string;
    name: string;
    badgeNumber: string;
    rank: string;
    status: 'on-duty' | 'off-duty' | 'on-call' | 'deployed' | 'break';
    location: {
        coordinates: [number, number];
        area: string;
    };
    assignment?: string;
    shift: {
        start: string;
        end: string;
    };
    contact: {
        phone: string;
        radio: string;
    };
    performance: {
        violationsIssued: number;
        incidentsHandled: number;
        avgResponseTime: number; // in minutes
    };
    equipment: string[];
}

export interface Incident {
    id: string;
    type: 'accident' | 'breakdown' | 'road-closure' | 'event' | 'hazard' | 'congestion' | 'sos' | 'pothole';
    severity: 'low' | 'medium' | 'high' | 'critical';
    status: 'reported' | 'assigned' | 'in-progress' | 'resolved' | 'closed';
    location: {
        coordinates: [number, number];
        address: string;
        landmark: string;
    };
    reportedBy: string;
    reportedAt: string;
    assignedOfficers: string[];
    description: string;
    timeline: {
        reported: string;
        assigned?: string;
        arrived?: string;
        resolved?: string;
    };
    affectedLanes: number;
    estimatedClearanceTime?: string;
    notes: string[];
    reporterPhone?: string;
}

export interface ViolationExtended {
    id: string;
    type: 'speeding' | 'helmet' | 'seatbelt' | 'signal-jump' | 'wrong-way' | 'parking' | 'overloading' | 'drunk-driving' | 'mobile-use';
    vehicleNo: string;
    vehicleType: 'car' | 'bike' | 'truck' | 'auto' | 'bus';
    location: string;
    coordinates: [number, number];
    timestamp: string;
    detectedBy: 'camera' | 'officer' | 'sensor';
    officerId?: string;
    evidence: {
        images: string[];
        video?: string;
        speed?: number;
        speedLimit?: number;
    };
    fineAmount: number;
    status: 'pending' | 'issued' | 'paid' | 'contested' | 'dismissed';
    issuedDate?: string;
    paidDate?: string;
    driverDetails?: {
        name: string;
        license: string;
        phone: string;
    };
}

export interface Alert {
    id: string;
    type: 'violation' | 'incident' | 'system' | 'weather' | 'congestion';
    priority: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    location?: string;
    coordinates?: [number, number];
    timestamp: string;
    read: boolean;
    reporterPhone?: string;
}

// Mock Traffic Signals Data
export const mockTrafficSignals: TrafficSignal[] = [
    {
        id: 'SIG-001',
        name: 'Master Canteen Square',
        location: 'Master Canteen, Bhubaneswar',
        coordinates: [20.2667, 85.8428],
        status: 'operational',
        currentPhase: 'green',
        timings: { redDuration: 60, yellowDuration: 5, greenDuration: 45 },
        adaptiveMode: true,
        lastUpdated: new Date().toISOString(),
        trafficDensity: 7.5,
        vehicleCount: 142
    },
    {
        id: 'SIG-002',
        name: 'Jayadev Vihar Square',
        location: 'Jayadev Vihar, Bhubaneswar',
        coordinates: [20.2913, 85.8166],
        status: 'operational',
        currentPhase: 'red',
        timings: { redDuration: 55, yellowDuration: 5, greenDuration: 50 },
        adaptiveMode: true,
        lastUpdated: new Date().toISOString(),
        trafficDensity: 8.2,
        vehicleCount: 198
    },
    {
        id: 'SIG-003',
        name: 'Rasulgarh Square',
        location: 'Rasulgarh, Bhubaneswar',
        coordinates: [20.2644, 85.8281],
        status: 'warning',
        currentPhase: 'yellow',
        timings: { redDuration: 65, yellowDuration: 5, greenDuration: 40 },
        adaptiveMode: false,
        lastUpdated: new Date().toISOString(),
        trafficDensity: 9.1,
        vehicleCount: 256
    },
    {
        id: 'SIG-004',
        name: 'Patia Square',
        location: 'Patia, Bhubaneswar',
        coordinates: [20.3553, 85.8197],
        status: 'offline',
        currentPhase: 'red',
        timings: { redDuration: 60, yellowDuration: 5, greenDuration: 45 },
        adaptiveMode: false,
        lastUpdated: new Date(Date.now() - 3600000).toISOString(),
        trafficDensity: 0,
        vehicleCount: 0
    },
    {
        id: 'SIG-005',
        name: 'Vani Vihar Square',
        location: 'Vani Vihar, Bhubaneswar',
        coordinates: [20.2961, 85.8245],
        status: 'operational',
        currentPhase: 'green',
        timings: { redDuration: 50, yellowDuration: 5, greenDuration: 55 },
        adaptiveMode: true,
        lastUpdated: new Date().toISOString(),
        trafficDensity: 6.8,
        vehicleCount: 167
    },
    {
        id: 'SIG-006',
        name: 'Kalpana Square',
        location: 'Kalpana, Bhubaneswar',
        coordinates: [20.2812, 85.8352],
        status: 'operational',
        currentPhase: 'red',
        timings: { redDuration: 70, yellowDuration: 5, greenDuration: 35 },
        adaptiveMode: true,
        lastUpdated: new Date().toISOString(),
        trafficDensity: 8.9,
        vehicleCount: 223
    },
    {
        id: 'SIG-007',
        name: 'Acharya Vihar Square',
        location: 'Acharya Vihar, Bhubaneswar',
        coordinates: [20.3089, 85.8156],
        status: 'operational',
        currentPhase: 'green',
        timings: { redDuration: 55, yellowDuration: 5, greenDuration: 50 },
        adaptiveMode: false,
        lastUpdated: new Date().toISOString(),
        trafficDensity: 5.4,
        vehicleCount: 134
    },
    {
        id: 'SIG-008',
        name: 'Nayapalli Square',
        location: 'Nayapalli, Bhubaneswar',
        coordinates: [20.2889, 85.8089],
        status: 'maintenance',
        currentPhase: 'yellow',
        timings: { redDuration: 60, yellowDuration: 5, greenDuration: 45 },
        adaptiveMode: false,
        lastUpdated: new Date(Date.now() - 1800000).toISOString(),
        trafficDensity: 4.2,
        vehicleCount: 89
    }
];

// Mock Officers Data
export const mockOfficers: Officer[] = [
    {
        id: 'OFF-001',
        name: 'Rajesh Kumar',
        badgeNumber: 'TF-1001',
        rank: 'Inspector',
        status: 'on-duty',
        location: {
            coordinates: [20.2667, 85.8428],
            area: 'Master Canteen'
        },
        assignment: 'Traffic Control - Master Canteen',
        shift: { start: '08:00', end: '16:00' },
        contact: { phone: '+91-9876543210', radio: 'CH-1' },
        performance: {
            violationsIssued: 45,
            incidentsHandled: 12,
            avgResponseTime: 8.5
        },
        equipment: ['Radio', 'Speed Gun', 'Body Camera']
    },
    {
        id: 'OFF-002',
        name: 'Priya Sharma',
        badgeNumber: 'TF-1002',
        rank: 'Sub-Inspector',
        status: 'deployed',
        location: {
            coordinates: [20.2913, 85.8166],
            area: 'Jayadev Vihar'
        },
        assignment: 'Incident Response - INC-003',
        shift: { start: '08:00', end: '16:00' },
        contact: { phone: '+91-9876543211', radio: 'CH-1' },
        performance: {
            violationsIssued: 38,
            incidentsHandled: 18,
            avgResponseTime: 6.2
        },
        equipment: ['Radio', 'First Aid Kit', 'Body Camera']
    },
    {
        id: 'OFF-003',
        name: 'Amit Patel',
        badgeNumber: 'TF-1003',
        rank: 'Constable',
        status: 'on-duty',
        location: {
            coordinates: [20.2644, 85.8281],
            area: 'Rasulgarh'
        },
        assignment: 'Patrol - Rasulgarh Zone',
        shift: { start: '08:00', end: '16:00' },
        contact: { phone: '+91-9876543212', radio: 'CH-2' },
        performance: {
            violationsIssued: 52,
            incidentsHandled: 9,
            avgResponseTime: 10.1
        },
        equipment: ['Radio', 'Breathalyzer', 'Speed Gun']
    },
    {
        id: 'OFF-004',
        name: 'Sunita Rao',
        badgeNumber: 'TF-1004',
        rank: 'Head Constable',
        status: 'break',
        location: {
            coordinates: [20.2812, 85.8352],
            area: 'Kalpana Square'
        },
        shift: { start: '08:00', end: '16:00' },
        contact: { phone: '+91-9876543213', radio: 'CH-2' },
        performance: {
            violationsIssued: 41,
            incidentsHandled: 14,
            avgResponseTime: 7.8
        },
        equipment: ['Radio', 'Body Camera']
    },
    {
        id: 'OFF-005',
        name: 'Vikram Singh',
        badgeNumber: 'TF-1005',
        rank: 'Inspector',
        status: 'on-duty',
        location: {
            coordinates: [20.3089, 85.8156],
            area: 'Acharya Vihar'
        },
        assignment: 'Traffic Control - Acharya Vihar',
        shift: { start: '16:00', end: '00:00' },
        contact: { phone: '+91-9876543214', radio: 'CH-3' },
        performance: {
            violationsIssued: 67,
            incidentsHandled: 21,
            avgResponseTime: 5.9
        },
        equipment: ['Radio', 'Speed Gun', 'Breathalyzer', 'Body Camera']
    },
    {
        id: 'OFF-006',
        name: 'Meena Desai',
        badgeNumber: 'TF-1006',
        rank: 'Sub-Inspector',
        status: 'off-duty',
        location: {
            coordinates: [20.2889, 85.8089],
            area: 'Nayapalli'
        },
        shift: { start: '00:00', end: '08:00' },
        contact: { phone: '+91-9876543215', radio: 'CH-3' },
        performance: {
            violationsIssued: 33,
            incidentsHandled: 11,
            avgResponseTime: 9.3
        },
        equipment: ['Radio', 'Body Camera']
    }
];

// Mock Incidents Data
export const mockIncidents: Incident[] = [
    {
        id: 'INC-001',
        type: 'accident',
        severity: 'high',
        status: 'in-progress',
        location: {
            coordinates: [20.2913, 85.8166],
            address: 'Jayadev Vihar Square, Near KIIT University',
            landmark: 'Jayadev Vihar Square'
        },
        reportedBy: 'Citizen - Sarah Connor',
        reportedAt: new Date(Date.now() - 1200000).toISOString(),
        assignedOfficers: ['OFF-002', 'OFF-005'],
        description: 'Two-vehicle collision, minor injuries reported',
        timeline: {
            reported: new Date(Date.now() - 1200000).toISOString(),
            assigned: new Date(Date.now() - 1080000).toISOString(),
            arrived: new Date(Date.now() - 900000).toISOString()
        },
        affectedLanes: 2,
        estimatedClearanceTime: new Date(Date.now() + 1800000).toISOString(),
        notes: ['Ambulance dispatched', 'Tow truck requested', 'Traffic being diverted']
    },
    {
        id: 'INC-002',
        type: 'breakdown',
        severity: 'medium',
        status: 'assigned',
        location: {
            coordinates: [20.2644, 85.8281],
            address: 'Rasulgarh Square, Main Road',
            landmark: 'Rasulgarh Square'
        },
        reportedBy: 'Officer - Amit Patel',
        reportedAt: new Date(Date.now() - 600000).toISOString(),
        assignedOfficers: ['OFF-003'],
        description: 'Heavy truck breakdown blocking right lane',
        timeline: {
            reported: new Date(Date.now() - 600000).toISOString(),
            assigned: new Date(Date.now() - 540000).toISOString()
        },
        affectedLanes: 1,
        estimatedClearanceTime: new Date(Date.now() + 2400000).toISOString(),
        notes: ['Tow truck en route', 'Traffic slowing in area']
    },
    {
        id: 'INC-003',
        type: 'road-closure',
        severity: 'critical',
        status: 'reported',
        location: {
            coordinates: [20.2667, 85.8428],
            address: 'Master Canteen Square, NH-16',
            landmark: 'Master Canteen'
        },
        reportedBy: 'Control Room',
        reportedAt: new Date(Date.now() - 300000).toISOString(),
        assignedOfficers: [],
        description: 'Water main break, road flooding',
        timeline: {
            reported: new Date(Date.now() - 300000).toISOString()
        },
        affectedLanes: 4,
        notes: ['Municipal corporation notified', 'Diversion route being set up']
    },
    {
        id: 'INC-004',
        type: 'event',
        severity: 'low',
        status: 'resolved',
        location: {
            coordinates: [20.2812, 85.8352],
            address: 'Kalpana Square, Market Area',
            landmark: 'Kalpana Square'
        },
        reportedBy: 'Officer - Sunita Rao',
        reportedAt: new Date(Date.now() - 7200000).toISOString(),
        assignedOfficers: ['OFF-004'],
        description: 'Local festival procession',
        timeline: {
            reported: new Date(Date.now() - 7200000).toISOString(),
            assigned: new Date(Date.now() - 7000000).toISOString(),
            arrived: new Date(Date.now() - 6800000).toISOString(),
            resolved: new Date(Date.now() - 3600000).toISOString()
        },
        affectedLanes: 2,
        notes: ['Procession completed', 'Traffic flow restored']
    }
];

// Mock Extended Violations
export const mockExtendedViolations: ViolationExtended[] = [
    {
        id: 'VIO-001',
        type: 'speeding',
        vehicleNo: 'OD-02-AB-1234',
        vehicleType: 'car',
        location: 'Master Canteen Square',
        coordinates: [20.2667, 85.8428],
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        detectedBy: 'camera',
        evidence: {
            images: ['https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&q=80&w=1000'],
            speed: 85,
            speedLimit: 50
        },
        fineAmount: 1000,
        status: 'pending'
    },
    {
        id: 'VIO-002',
        type: 'helmet',
        vehicleNo: 'OD-05-XY-9876',
        vehicleType: 'bike',
        location: 'Jayadev Vihar Square',
        coordinates: [20.2913, 85.8166],
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        detectedBy: 'officer',
        officerId: 'OFF-002',
        evidence: {
            images: ['https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&q=80&w=1000']
        },
        fineAmount: 500,
        status: 'paid',
        issuedDate: new Date(Date.now() - 7000000).toISOString(),
        paidDate: new Date(Date.now() - 3600000).toISOString(),
        driverDetails: {
            name: 'Rahul Verma',
            license: 'OD0520230012345',
            phone: '+91-9988776655'
        }
    },
    {
        id: 'VIO-003',
        type: 'signal-jump',
        vehicleNo: 'OD-33-ZZ-5555',
        vehicleType: 'auto',
        location: 'Rasulgarh Square',
        coordinates: [20.2644, 85.8281],
        timestamp: new Date(Date.now() - 10800000).toISOString(),
        detectedBy: 'camera',
        evidence: {
            images: ['https://images.unsplash.com/photo-1597762470488-387751f538c6?auto=format&fit=crop&q=80&w=1000'],
            video: 'violation_003.mp4'
        },
        fineAmount: 2000,
        status: 'contested',
        issuedDate: new Date(Date.now() - 10000000).toISOString()
    },
    {
        id: 'VIO-004',
        type: 'seatbelt',
        vehicleNo: 'OD-03-MN-4567',
        vehicleType: 'car',
        location: 'Patia Square',
        coordinates: [20.3553, 85.8197],
        timestamp: new Date(Date.now() - 14400000).toISOString(),
        detectedBy: 'officer',
        officerId: 'OFF-001',
        evidence: {
            images: ['https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&q=80&w=1000']
        },
        fineAmount: 1000,
        status: 'issued',
        issuedDate: new Date(Date.now() - 14000000).toISOString(),
        driverDetails: {
            name: 'Anjali Mishra',
            license: 'OD0320230098765',
            phone: '+91-9876543200'
        }
    },
    {
        id: 'VIO-005',
        type: 'wrong-way',
        vehicleNo: 'OD-07-PQ-7890',
        vehicleType: 'bike',
        location: 'Kalpana Square',
        coordinates: [20.2812, 85.8352],
        timestamp: new Date(Date.now() - 5400000).toISOString(),
        detectedBy: 'camera',
        evidence: {
            images: ['https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&q=80&w=1000']
        },
        fineAmount: 1500,
        status: 'pending'
    },
    {
        id: 'VIO-006',
        type: 'mobile-use',
        vehicleNo: 'OD-02-RS-3456',
        vehicleType: 'car',
        location: 'Vani Vihar Square',
        coordinates: [20.2961, 85.8245],
        timestamp: new Date(Date.now() - 1800000).toISOString(),
        detectedBy: 'officer',
        officerId: 'OFF-005',
        evidence: {
            images: ['https://images.unsplash.com/photo-1519003722824-194d4455a60c?auto=format&fit=crop&q=80&w=1000']
        },
        fineAmount: 1000,
        status: 'issued',
        issuedDate: new Date(Date.now() - 1700000).toISOString(),
        driverDetails: {
            name: 'Suresh Nayak',
            license: 'OD0220230045678',
            phone: '+91-9123456789'
        }
    }
];

// Mock Alerts
export const mockAlerts: Alert[] = [
    {
        id: 'ALT-001',
        type: 'incident',
        priority: 'high',
        message: 'Accident reported at Jayadev Vihar Square - 2 vehicles involved',
        location: 'Jayadev Vihar Square',
        timestamp: new Date(Date.now() - 1200000).toISOString(),
        read: false
    },
    {
        id: 'ALT-002',
        type: 'congestion',
        priority: 'medium',
        message: 'Heavy traffic detected at Rasulgarh Square - Density: 9.1',
        location: 'Rasulgarh Square',
        timestamp: new Date(Date.now() - 900000).toISOString(),
        read: false
    },
    {
        id: 'ALT-003',
        type: 'system',
        priority: 'critical',
        message: 'Signal offline at Patia Square - Manual control required',
        location: 'Patia Square',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        read: true
    },
    {
        id: 'ALT-004',
        type: 'violation',
        priority: 'low',
        message: 'Speeding violation detected - OD-02-AB-1234 at 85 km/h',
        location: 'Master Canteen Square',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        read: true
    },
    {
        id: 'ALT-005',
        type: 'weather',
        priority: 'medium',
        message: 'Heavy rain expected in 2 hours - Prepare for reduced visibility',
        timestamp: new Date(Date.now() - 600000).toISOString(),
        read: false
    }
];

// Real-time Data Simulation
export class TrafficDataSimulator {
    private updateInterval: NodeJS.Timeout | null = null;

    startSimulation(updateCallback: () => void, intervalMs: number = 5000) {
        this.updateInterval = setInterval(() => {
            this.updateTrafficData();
            updateCallback();
        }, intervalMs);
    }

    stopSimulation() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    private updateTrafficData() {
        // Update signal phases and traffic density
        mockTrafficSignals.forEach(signal => {
            if (signal.status === 'operational') {
                // Cycle through phases
                const phases: ('red' | 'yellow' | 'green')[] = ['red', 'yellow', 'green'];
                const currentIndex = phases.indexOf(signal.currentPhase);
                signal.currentPhase = phases[(currentIndex + 1) % phases.length];

                // Vary traffic density slightly
                signal.trafficDensity = Math.max(0, Math.min(10, signal.trafficDensity + (Math.random() - 0.5) * 0.5));
                signal.vehicleCount = Math.floor(signal.trafficDensity * 25 + Math.random() * 20);
                signal.lastUpdated = new Date().toISOString();
            }
        });

        // Update officer locations slightly (simulate movement)
        mockOfficers.forEach(officer => {
            if (officer.status === 'on-duty' || officer.status === 'deployed') {
                officer.location.coordinates = [
                    officer.location.coordinates[0] + (Math.random() - 0.5) * 0.001,
                    officer.location.coordinates[1] + (Math.random() - 0.5) * 0.001
                ];
            }
        });
    }
}

// LocalStorage Management
export const TrafficDataStore = {
    saveSignals: (signals: TrafficSignal[]) => {
        localStorage.setItem('traffic_signals', JSON.stringify(signals));
    },

    loadSignals: (): TrafficSignal[] => {
        const data = localStorage.getItem('traffic_signals');
        return data ? JSON.parse(data) : mockTrafficSignals;
    },

    saveOfficers: (officers: Officer[]) => {
        localStorage.setItem('traffic_officers', JSON.stringify(officers));
    },

    loadOfficers: (): Officer[] => {
        const data = localStorage.getItem('traffic_officers');
        return data ? JSON.parse(data) : mockOfficers;
    },

    saveIncidents: (incidents: Incident[]) => {
        localStorage.setItem('traffic_incidents', JSON.stringify(incidents));
    },

    loadIncidents: (): Incident[] => {
        const data = localStorage.getItem('traffic_incidents');
        return data ? JSON.parse(data) : mockIncidents;
    },

    saveViolations: (violations: ViolationExtended[]) => {
        localStorage.setItem('traffic_violations', JSON.stringify(violations));
    },

    loadViolations: (): ViolationExtended[] => {
        const data = localStorage.getItem('traffic_violations');
        return data ? JSON.parse(data) : mockExtendedViolations;
    },

    saveAlerts: (alerts: Alert[]) => {
        localStorage.setItem('traffic_alerts', JSON.stringify(alerts));
    },

    loadAlerts: (): Alert[] => {
        const data = localStorage.getItem('traffic_alerts');
        return data ? JSON.parse(data) : mockAlerts;
    },

    clearAll: () => {
        localStorage.removeItem('traffic_signals');
        localStorage.removeItem('traffic_officers');
        localStorage.removeItem('traffic_incidents');
        localStorage.removeItem('traffic_violations');
        localStorage.removeItem('traffic_alerts');
    },

    addIncident: (incident: Incident) => {
        const incidents = TrafficDataStore.loadIncidents();
        TrafficDataStore.saveIncidents([incident, ...incidents]);
    },

    addAlert: (alert: Alert) => {
        const alerts = TrafficDataStore.loadAlerts();
        TrafficDataStore.saveAlerts([alert, ...alerts]);
    }
};
