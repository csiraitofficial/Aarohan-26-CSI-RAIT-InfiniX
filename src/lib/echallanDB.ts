import { Violation, Challan } from './violationTypes';

// Mock database for violations and challans
class EChallanDatabase {
    private violations: Violation[] = [];
    private challans: Challan[] = [];

    // Violations
    addViolation(violation: Violation) {
        this.violations.push(violation);
        return violation;
    }

    getViolations() {
        return [...this.violations];
    }

    getViolationById(id: string) {
        return this.violations.find(v => v.id === id);
    }

    // Challans
    addChallan(challan: Challan) {
        this.challans.push(challan);
        return challan;
    }

    getChallans() {
        return [...this.challans];
    }

    getChallanByNumber(challanNumber: string) {
        return this.challans.find(c => c.challanNumber === challanNumber);
    }

    getChallansByVehicle(vehicleNumber: string) {
        return this.challans.filter(c => c.vehicleNumber === vehicleNumber);
    }

    updateChallanStatus(challanNumber: string, status: Challan['status'], paymentData?: { paymentDate: Date; paymentReference: string }) {
        const challan = this.getChallanByNumber(challanNumber);
        if (challan) {
            challan.status = status;
            if (paymentData) {
                challan.paymentDate = paymentData.paymentDate;
                challan.paymentReference = paymentData.paymentReference;
            }
        }
        return challan;
    }

    // Statistics
    getStats() {
        const total = this.challans.length;
        const paid = this.challans.filter(c => c.status === 'paid').length;
        const unpaid = this.challans.filter(c => c.status === 'unpaid').length;
        const totalRevenue = this.challans
            .filter(c => c.status === 'paid')
            .reduce((sum, c) => sum + c.totalAmount, 0);

        return {
            totalChallans: total,
            paidChallans: paid,
            unpaidChallans: unpaid,
            totalRevenue,
            recentViolations: this.violations.slice(-10).reverse()
        };
    }
}

// Singleton instance
export const echallanDB = new EChallanDatabase();
