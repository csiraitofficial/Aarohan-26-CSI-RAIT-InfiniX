import { v4 as uuidv4 } from 'uuid';
import { Violation, Challan, VIOLATION_TYPES, ViolationType } from './violationTypes';
import { echallanDB } from './echallanDB';

/**
 * Generate unique challan number
 */
function generateChallanNumber(): string {
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `CH${timestamp}${random}`;
}

/**
 * Generate e-Challan from violation
 */
export function generateChallan(violation: Violation): Challan {
    const violationInfo = VIOLATION_TYPES[violation.type];
    const issueDate = new Date();
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30); // 30 days to pay

    const challan: Challan = {
        id: uuidv4(),
        challanNumber: generateChallanNumber(),
        violationId: violation.id,
        vehicleNumber: violation.vehicleNumber,
        violationType: violation.type,
        issueDate,
        dueDate,
        fineAmount: violationInfo.fine,
        penaltyAmount: 0,
        totalAmount: violationInfo.fine,
        status: 'unpaid',
        location: violation.location,
        evidence: violation.evidence
    };

    // Update violation status
    violation.status = 'challan_generated';

    // Save to database
    echallanDB.addChallan(challan);

    // Send notification (mock)
    sendChallanNotification(challan);

    return challan;
}

/**
 * Mock SMS/Email notification
 */
function sendChallanNotification(challan: Challan) {
    const violationInfo = VIOLATION_TYPES[challan.violationType];

    const message = `
e-Challan Generated
Challan No: ${challan.challanNumber}
Vehicle: ${challan.vehicleNumber}
Violation: ${violationInfo.name}
Fine: ₹${challan.fineAmount}
Location: ${challan.location}
Due Date: ${challan.dueDate.toLocaleDateString()}
Pay online: https://yatayat.com/pay/${challan.challanNumber}
    `.trim();

    console.log('📱 SMS Sent:', message);

    // In real implementation, this would call SMS/Email API
    return message;
}

/**
 * Calculate penalty for overdue challan
 */
export function calculatePenalty(challan: Challan): number {
    if (challan.status === 'paid') return 0;

    const now = new Date();
    const dueDate = new Date(challan.dueDate);

    if (now <= dueDate) return 0;

    // 10% penalty after due date
    const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    const penaltyPercent = Math.min(daysOverdue * 2, 50); // Max 50% penalty

    return Math.floor(challan.fineAmount * (penaltyPercent / 100));
}

/**
 * Process payment for challan
 */
export function processChallanPayment(
    challanNumber: string,
    paymentReference: string
): Challan | null {
    const challan = echallanDB.getChallanByNumber(challanNumber);

    if (!challan || challan.status === 'paid') {
        return null;
    }

    // Update penalty if overdue
    challan.penaltyAmount = calculatePenalty(challan);
    challan.totalAmount = challan.fineAmount + challan.penaltyAmount;

    // Mark as paid
    echallanDB.updateChallanStatus(challanNumber, 'paid', {
        paymentDate: new Date(),
        paymentReference
    });

    console.log(`✅ Payment processed for ${challanNumber}`);

    return challan;
}
