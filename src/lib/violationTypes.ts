// Violation types and fine amounts based on Indian traffic rules
export const VIOLATION_TYPES = {
    RED_LIGHT: {
        code: 'RL001',
        name: 'Red Light Violation',
        fine: 1000,
        description: 'Crossing red traffic signal',
        section: 'Section 177 MV Act'
    },
    OVERSPEEDING: {
        code: 'SP001',
        name: 'Over Speeding',
        fine: 2000,
        description: 'Exceeding speed limit',
        section: 'Section 183 MV Act'
    },
    NO_HELMET: {
        code: 'NH001',
        name: 'Riding Without Helmet',
        fine: 1000,
        description: 'Two-wheeler without proper helmet',
        section: 'Section 129 MV Act'
    },
    TRIPLE_RIDING: {
        code: 'TR001',
        name: 'Triple Riding',
        fine: 1000,
        description: 'More than 2 persons on two-wheeler',
        section: 'Section 128 MV Act'
    },
    WRONG_PARKING: {
        code: 'WP001',
        name: 'Wrong Parking',
        fine: 500,
        description: 'Parking in no-parking zone',
        section: 'Section 122 MV Act'
    },
    NO_SEATBELT: {
        code: 'SB001',
        name: 'Not Wearing Seatbelt',
        fine: 1000,
        description: 'Driver/passenger without seatbelt',
        section: 'Section 138(3) MV Act'
    },
    MOBILE_WHILE_DRIVING: {
        code: 'MD001',
        name: 'Using Mobile While Driving',
        fine: 1500,
        description: 'Using mobile phone while driving',
        section: 'Section 177 MV Act'
    }
} as const;

export type ViolationType = keyof typeof VIOLATION_TYPES;

export interface Violation {
    id: string;
    type: ViolationType;
    vehicleNumber: string;
    location: string;
    timestamp: Date;
    evidence: string; // Base64 image
    status: 'detected' | 'challan_generated' | 'paid';
}

export interface Challan {
    id: string;
    challanNumber: string;
    violationId: string;
    vehicleNumber: string;
    ownerName?: string;
    ownerContact?: string;
    violationType: ViolationType;
    issueDate: Date;
    dueDate: Date;
    fineAmount: number;
    penaltyAmount: number;
    totalAmount: number;
    status: 'unpaid' | 'paid' | 'cancelled';
    paymentDate?: Date;
    paymentReference?: string;
    location: string;
    evidence: string;
}
