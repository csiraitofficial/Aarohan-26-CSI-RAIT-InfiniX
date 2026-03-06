import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import { echallanDB } from "@/lib/echallanDB";
import { VIOLATION_TYPES } from "@/lib/violationTypes";
import { FileText, Search, AlertCircle, IndianRupee, CheckCircle } from "lucide-react";
import { ViolationSimulator } from "@/components/EChallan/ViolationSimulator";

export default function EChallan() {
    const [stats, setStats] = useState(echallanDB.getStats());
    const [searchQuery, setSearchQuery] = useState("");
    const [challans, setChallans] = useState(echallanDB.getChallans());

    useEffect(() => {
        const interval = setInterval(() => {
            setStats(echallanDB.getStats());
            setChallans(echallanDB.getChallans());
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    const filteredChallans = challans.filter(c =>
        c.vehicleNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.challanNumber.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-foreground">e-Challan System</h1>
                <p className="text-muted-foreground mt-1">
                    Digital traffic violation management and challan generation
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <GlassCard className="p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-lg bg-blue-500/20">
                            <FileText className="h-6 w-6 text-blue-500" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Total Challans</p>
                            <h3 className="text-2xl font-bold">{stats.totalChallans}</h3>
                        </div>
                    </div>
                </GlassCard>

                <GlassCard className="p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-lg bg-green-500/20">
                            <CheckCircle className="h-6 w-6 text-green-500" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Paid</p>
                            <h3 className="text-2xl font-bold">{stats.paidChallans}</h3>
                        </div>
                    </div>
                </GlassCard>

                <GlassCard className="p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-lg bg-red-500/20">
                            <AlertCircle className="h-6 w-6 text-red-500" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Unpaid</p>
                            <h3 className="text-2xl font-bold">{stats.unpaidChallans}</h3>
                        </div>
                    </div>
                </GlassCard>

                <GlassCard className="p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-lg bg-purple-500/20">
                            <IndianRupee className="h-6 w-6 text-purple-500" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Revenue</p>
                            <h3 className="text-2xl font-bold">₹{stats.totalRevenue.toLocaleString()}</h3>
                        </div>
                    </div>
                </GlassCard>
            </div>

            <Card className="p-4">
                <div className="flex items-center gap-2">
                    <Search className="h-5 w-5 text-muted-foreground" />
                    <Input
                        placeholder="Search by vehicle number or challan number..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="border-none shadow-none focus-visible:ring-0"
                    />
                </div>
            </Card>

            <ViolationSimulator />

            <Card className="p-6">
                <h2 className="text-xl font-semibold mb-4">Recent Violations</h2>
                <div className="space-y-3">
                    {stats.recentViolations.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">
                            No violations detected yet. Use the demo generator to create test violations.
                        </p>
                    ) : (
                        stats.recentViolations.map((violation) => (
                            <div
                                key={violation.id}
                                className="flex items-center justify-between p-4 rounded-lg bg-muted/50"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="p-2 rounded-lg bg-red-500/20">
                                        <AlertCircle className="h-5 w-5 text-red-500" />
                                    </div>
                                    <div>
                                        <p className="font-medium">{violation.vehicleNumber}</p>
                                        <p className="text-sm text-muted-foreground">
                                            {VIOLATION_TYPES[violation.type].name}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-medium">
                                        {violation.timestamp.toLocaleTimeString()}
                                    </p>
                                    <p className="text-xs text-muted-foreground">{violation.location}</p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Card>

            <Card className="p-6">
                <h2 className="text-xl font-semibold mb-4">All Challans</h2>
                <div className="space-y-3">
                    {filteredChallans.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">
                            No challans found.
                        </p>
                    ) : (
                        filteredChallans.map((challan) => (
                            <div
                                key={challan.id}
                                className="flex items-center justify-between p-4 rounded-lg border"
                            >
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <p className="font-medium">{challan.challanNumber}</p>
                                        <span
                                            className={`px-2 py-0.5 rounded text-xs font-medium ${challan.status === 'paid'
                                                    ? 'bg-green-500/20 text-green-600'
                                                    : 'bg-red-500/20 text-red-600'
                                                }`}
                                        >
                                            {challan.status.toUpperCase()}
                                        </span>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        {challan.vehicleNumber} • {VIOLATION_TYPES[challan.violationType].name}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {challan.location} • {challan.issueDate.toLocaleDateString()}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-lg font-bold">₹{challan.totalAmount}</p>
                                    {challan.status === 'unpaid' && (
                                        <Button size="sm" className="mt-2">
                                            Pay Now
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Card>
        </div>
    );
}
