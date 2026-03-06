import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { mockViolations } from "@/lib/mockData";
import {
    Search, Filter, Eye, AlertTriangle, CheckCircle, XCircle, FileText, TrendingUp,
    Download, Calendar, MapPin, DollarSign, BarChart3, PieChart, Users, Clock,
    ChevronLeft, ChevronRight, SortAsc, SortDesc, Sparkles
} from "lucide-react";

const Violations = () => {
    const [searchTerm, setSearchTerm] = useState("");
    const [filterType, setFilterType] = useState("all");
    const [filterStatus, setFilterStatus] = useState("all");
    const [filterLocation, setFilterLocation] = useState("all");
    const [sortBy, setSortBy] = useState("date-desc");
    const [currentPage, setCurrentPage] = useState(1);
    const [dateFilter, setDateFilter] = useState("all");
    const itemsPerPage = 12;

    // Calculate analytics
    const analytics = useMemo(() => {
        const total = mockViolations.length;
        const paid = mockViolations.filter(v => v.status === "paid").length;
        const pending = mockViolations.filter(v => v.status === "pending").length;
        const contested = mockViolations.filter(v => v.status === "contested").length;

        const totalRevenue = mockViolations
            .filter(v => v.status === "paid")
            .reduce((sum, v) => sum + v.fineAmount, 0);

        const pendingRevenue = mockViolations
            .filter(v => v.status === "pending")
            .reduce((sum, v) => sum + v.fineAmount, 0);

        const contestedRevenue = mockViolations
            .filter(v => v.status === "contested")
            .reduce((sum, v) => sum + v.fineAmount, 0);

        // Violation type breakdown
        const typeBreakdown: Record<string, number> = {};
        mockViolations.forEach(v => {
            typeBreakdown[v.type] = (typeBreakdown[v.type] || 0) + 1;
        });

        // Location breakdown
        const locationBreakdown: Record<string, number> = {};
        mockViolations.forEach(v => {
            locationBreakdown[v.location] = (locationBreakdown[v.location] || 0) + 1;
        });

        return {
            total,
            paid,
            pending,
            contested,
            totalRevenue,
            pendingRevenue,
            contestedRevenue,
            paymentRate: total > 0 ? Math.round((paid / total) * 100) : 0,
            typeBreakdown,
            locationBreakdown,
            avgConfidence: mockViolations.reduce((sum, v) => sum + (v.confidence || 0), 0) / total,
        };
    }, []);

    // Date filtering
    const getDateFilteredViolations = () => {
        const now = Date.now();
        const oneDayAgo = now - 86400000;
        const oneWeekAgo = now - 604800000;
        const oneMonthAgo = now - 2592000000;

        return mockViolations.filter(v => {
            const violationTime = new Date(v.timestamp).getTime();
            switch (dateFilter) {
                case "today":
                    return violationTime >= oneDayAgo;
                case "week":
                    return violationTime >= oneWeekAgo;
                case "month":
                    return violationTime >= oneMonthAgo;
                default:
                    return true;
            }
        });
    };

    // Filtering and sorting
    const filteredViolations = useMemo(() => {
        let filtered = getDateFilteredViolations();

        // Apply search filter
        filtered = filtered.filter(v => {
            const matchesSearch = v.vehicleNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                v.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
                v.type.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesType = filterType === "all" || v.type === filterType;
            const matchesStatus = filterStatus === "all" || v.status === filterStatus;
            const matchesLocation = filterLocation === "all" || v.location === filterLocation;
            return matchesSearch && matchesType && matchesStatus && matchesLocation;
        });

        // Apply sorting
        filtered.sort((a, b) => {
            switch (sortBy) {
                case "date-desc":
                    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
                case "date-asc":
                    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
                case "amount-desc":
                    return b.fineAmount - a.fineAmount;
                case "amount-asc":
                    return a.fineAmount - b.fineAmount;
                case "confidence-desc":
                    return (b.confidence || 0) - (a.confidence || 0);
                case "confidence-asc":
                    return (a.confidence || 0) - (b.confidence || 0);
                default:
                    return 0;
            }
        });

        return filtered;
    }, [searchTerm, filterType, filterStatus, filterLocation, sortBy, dateFilter]);

    // Pagination
    const totalPages = Math.ceil(filteredViolations.length / itemsPerPage);
    const paginatedViolations = filteredViolations.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // Export to CSV
    const exportToCSV = () => {
        const headers = ["ID", "Type", "Vehicle No", "Location", "Date", "Fine Amount", "Status", "Officer", "Confidence"];
        const rows = filteredViolations.map(v => [
            v.id,
            v.type,
            v.vehicleNo,
            v.location,
            new Date(v.timestamp).toLocaleString(),
            v.fineAmount,
            v.status,
            v.officer || "N/A",
            v.confidence ? (v.confidence * 100).toFixed(1) + "%" : "N/A"
        ]);

        const csvContent = [
            headers.join(","),
            ...rows.map(row => row.join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `violations_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case "paid": return "bg-success hover:bg-success/90";
            case "pending": return "bg-warning hover:bg-warning/90";
            case "contested": return "bg-destructive hover:bg-destructive/90";
            default: return "bg-muted";
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case "paid": return <CheckCircle className="h-4 w-4" />;
            case "pending": return <AlertTriangle className="h-4 w-4" />;
            case "contested": return <XCircle className="h-4 w-4" />;
            default: return null;
        }
    };

    const getConfidenceColor = (confidence: number) => {
        if (confidence >= 0.9) return "text-success";
        if (confidence >= 0.8) return "text-warning";
        return "text-destructive";
    };

    // Get unique locations
    const uniqueLocations = Array.from(new Set(mockViolations.map(v => v.location)));

    return (
        <div className="space-y-6 p-6">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">Traffic Violations</h1>
                    <p className="text-muted-foreground mt-1">AI-Powered Automated Challan Management System</p>
                </div>

                <Button onClick={exportToCSV} className="bg-primary hover:bg-primary/90">
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                </Button>
            </div>

            {/* Analytics Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Total Violations</p>
                            <p className="text-3xl font-bold mt-1">{analytics.total}</p>
                            <p className="text-xs text-muted-foreground mt-1">All time</p>
                        </div>
                        <div className="p-3 bg-blue-500/20 rounded-full">
                            <FileText className="h-6 w-6 text-blue-500" />
                        </div>
                    </div>
                </Card>

                <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Revenue Collected</p>
                            <p className="text-3xl font-bold mt-1">₹{analytics.totalRevenue.toLocaleString()}</p>
                            <p className="text-xs text-success mt-1">{analytics.paid} paid ({analytics.paymentRate}%)</p>
                        </div>
                        <div className="p-3 bg-green-500/20 rounded-full">
                            <DollarSign className="h-6 w-6 text-green-500" />
                        </div>
                    </div>
                </Card>

                <Card className="p-4 bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border-yellow-500/20">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Pending Amount</p>
                            <p className="text-3xl font-bold mt-1">₹{analytics.pendingRevenue.toLocaleString()}</p>
                            <p className="text-xs text-warning mt-1">{analytics.pending} pending</p>
                        </div>
                        <div className="p-3 bg-yellow-500/20 rounded-full">
                            <Clock className="h-6 w-6 text-yellow-500" />
                        </div>
                    </div>
                </Card>

                <Card className="p-4 bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Contested</p>
                            <p className="text-3xl font-bold mt-1">₹{analytics.contestedRevenue.toLocaleString()}</p>
                            <p className="text-xs text-destructive mt-1">{analytics.contested} cases</p>
                        </div>
                        <div className="p-3 bg-red-500/20 rounded-full">
                            <AlertTriangle className="h-6 w-6 text-red-500" />
                        </div>
                    </div>
                </Card>
            </div>

            {/* Top Violations & Locations */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="p-4 bg-gradient-card border-2 border-primary/20">
                    <div className="flex items-center gap-2 mb-4">
                        <PieChart className="h-5 w-5 text-primary" />
                        <h3 className="font-semibold">Top Violation Types</h3>
                    </div>
                    <div className="space-y-2">
                        {Object.entries(analytics.typeBreakdown)
                            .sort(([, a], [, b]) => b - a)
                            .slice(0, 5)
                            .map(([type, count]) => (
                                <div key={type} className="flex items-center justify-between">
                                    <span className="text-sm">{type}</span>
                                    <div className="flex items-center gap-2">
                                        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-primary rounded-full"
                                                style={{ width: `${(count / analytics.total) * 100}%` }}
                                            />
                                        </div>
                                        <span className="text-sm font-medium w-8 text-right">{count}</span>
                                    </div>
                                </div>
                            ))}
                    </div>
                </Card>

                <Card className="p-4 bg-gradient-card border-2 border-primary/20">
                    <div className="flex items-center gap-2 mb-4">
                        <MapPin className="h-5 w-5 text-primary" />
                        <h3 className="font-semibold">Top Locations</h3>
                    </div>
                    <div className="space-y-2">
                        {Object.entries(analytics.locationBreakdown)
                            .sort(([, a], [, b]) => b - a)
                            .map(([location, count]) => (
                                <div key={location} className="flex items-center justify-between">
                                    <span className="text-sm">{location}</span>
                                    <div className="flex items-center gap-2">
                                        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-primary rounded-full"
                                                style={{ width: `${(count / analytics.total) * 100}%` }}
                                            />
                                        </div>
                                        <span className="text-sm font-medium w-8 text-right">{count}</span>
                                    </div>
                                </div>
                            ))}
                    </div>
                </Card>
            </div>

            {/* Filters */}
            <Card className="p-4 bg-gradient-card border-2 border-primary/20">
                <div className="space-y-4">
                    {/* Quick Date Filters */}
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant={dateFilter === "all" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setDateFilter("all")}
                        >
                            All Time
                        </Button>
                        <Button
                            variant={dateFilter === "today" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setDateFilter("today")}
                        >
                            <Calendar className="h-4 w-4 mr-1" />
                            Today
                        </Button>
                        <Button
                            variant={dateFilter === "week" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setDateFilter("week")}
                        >
                            This Week
                        </Button>
                        <Button
                            variant={dateFilter === "month" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setDateFilter("month")}
                        >
                            This Month
                        </Button>
                    </div>

                    {/* Search and Filters */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                        <div className="relative lg:col-span-2">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search Vehicle No, Location, Type..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 bg-card border-border"
                            />
                        </div>
                        <Select value={filterType} onValueChange={setFilterType}>
                            <SelectTrigger>
                                <Filter className="h-4 w-4 mr-2" />
                                <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Types</SelectItem>
                                <SelectItem value="Speed Limit Violation">Speed Limit</SelectItem>
                                <SelectItem value="No Helmet">No Helmet</SelectItem>
                                <SelectItem value="No Seatbelt">No Seatbelt</SelectItem>
                                <SelectItem value="Signal Jump">Signal Jump</SelectItem>
                                <SelectItem value="Wrong Side Driving">Wrong Side</SelectItem>
                                <SelectItem value="Parking Violation">Parking</SelectItem>
                                <SelectItem value="Triple Riding">Triple Riding</SelectItem>
                                <SelectItem value="Mobile Phone Usage">Mobile Usage</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={filterStatus} onValueChange={setFilterStatus}>
                            <SelectTrigger>
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="paid">Paid</SelectItem>
                                <SelectItem value="contested">Contested</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={filterLocation} onValueChange={setFilterLocation}>
                            <SelectTrigger>
                                <MapPin className="h-4 w-4 mr-2" />
                                <SelectValue placeholder="Location" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Locations</SelectItem>
                                {uniqueLocations.map(loc => (
                                    <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Sort Options */}
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Sort by:</span>
                        <Select value={sortBy} onValueChange={setSortBy}>
                            <SelectTrigger className="w-[200px]">
                                <SortDesc className="h-4 w-4 mr-2" />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="date-desc">Date (Newest First)</SelectItem>
                                <SelectItem value="date-asc">Date (Oldest First)</SelectItem>
                                <SelectItem value="amount-desc">Amount (High to Low)</SelectItem>
                                <SelectItem value="amount-asc">Amount (Low to High)</SelectItem>
                                <SelectItem value="confidence-desc">Confidence (High to Low)</SelectItem>
                                <SelectItem value="confidence-asc">Confidence (Low to High)</SelectItem>
                            </SelectContent>
                        </Select>
                        <span className="text-sm text-muted-foreground ml-auto">
                            Showing {paginatedViolations.length} of {filteredViolations.length} violations
                        </span>
                    </div>
                </div>
            </Card>

            {/* Violations Grid */}
            {paginatedViolations.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {paginatedViolations.map((violation) => (
                        <Card key={violation.id} className="overflow-hidden bg-gradient-card border-2 border-primary/20 hover:border-primary/50 transition-all hover:shadow-lg">
                            <div className="aspect-video relative overflow-hidden">
                                <img
                                    src={violation.imageUrl}
                                    alt={violation.type}
                                    className="object-cover w-full h-full hover:scale-105 transition-transform duration-300"
                                />
                                <div className="absolute top-2 right-2">
                                    <Badge className={`${getStatusColor(violation.status)} text-white flex items-center gap-1`}>
                                        {getStatusIcon(violation.status)}
                                        <span className="capitalize">{violation.status}</span>
                                    </Badge>
                                </div>
                                {violation.confidence && (
                                    <div className="absolute top-2 left-2">
                                        <Badge className="bg-black/70 text-white flex items-center gap-1">
                                            <Sparkles className="h-3 w-3" />
                                            <span className={getConfidenceColor(violation.confidence)}>
                                                {(violation.confidence * 100).toFixed(0)}%
                                            </span>
                                        </Badge>
                                    </div>
                                )}
                            </div>
                            <div className="p-4 space-y-4">
                                <div>
                                    <h3 className="font-bold text-lg text-foreground">{violation.type}</h3>
                                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                                        <MapPin className="h-3 w-3" />
                                        {violation.location}
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <p className="text-muted-foreground">Vehicle No</p>
                                        <p className="font-mono font-medium">{violation.vehicleNo}</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground">Fine Amount</p>
                                        <p className="font-bold text-destructive">₹{violation.fineAmount}</p>
                                    </div>
                                    <div className="col-span-2">
                                        <p className="text-muted-foreground">Time</p>
                                        <p className="text-xs">{new Date(violation.timestamp).toLocaleString()}</p>
                                    </div>
                                    {violation.officer && (
                                        <div className="col-span-2">
                                            <p className="text-muted-foreground">Issued By</p>
                                            <p className="text-xs flex items-center gap-1">
                                                <Users className="h-3 w-3" />
                                                {violation.officer}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <Dialog>
                                    <DialogTrigger asChild>
                                        <Button className="w-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20">
                                            <Eye className="h-4 w-4 mr-2" />
                                            View Details
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-3xl">
                                        <DialogHeader>
                                            <DialogTitle>Violation Evidence #{violation.id}</DialogTitle>
                                        </DialogHeader>
                                        <div className="space-y-4">
                                            <div className="aspect-video rounded-lg overflow-hidden border-2 border-border">
                                                <img
                                                    src={violation.imageUrl}
                                                    alt="Evidence"
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                                                <div>
                                                    <p className="text-sm text-muted-foreground">Violation Type</p>
                                                    <p className="font-medium">{violation.type}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-muted-foreground">Vehicle Number</p>
                                                    <p className="font-medium">{violation.vehicleNo}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-muted-foreground">Location</p>
                                                    <p className="font-medium">{violation.location}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-muted-foreground">Fine Amount</p>
                                                    <p className="font-bold text-destructive">₹{violation.fineAmount}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-muted-foreground">Status</p>
                                                    <Badge className={`${getStatusColor(violation.status)} text-white`}>
                                                        {violation.status}
                                                    </Badge>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-muted-foreground">AI Confidence</p>
                                                    <p className={`font-medium ${getConfidenceColor(violation.confidence || 0)}`}>
                                                        {((violation.confidence || 0) * 100).toFixed(1)}%
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-muted-foreground">Issued By</p>
                                                    <p className="font-medium">{violation.officer || "N/A"}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-muted-foreground">Date & Time</p>
                                                    <p className="font-medium text-sm">{new Date(violation.timestamp).toLocaleString()}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        </Card>
                    ))}
                </div>
            ) : (
                <Card className="p-12 text-center bg-gradient-card border-2 border-primary/20">
                    <FileText className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
                    <h3 className="text-xl font-semibold mb-2">No Violations Found</h3>
                    <p className="text-muted-foreground">Try adjusting your filters or search criteria</p>
                </Card>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <Card className="p-4 bg-gradient-card border-2 border-primary/20">
                    <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">
                            Page {currentPage} of {totalPages}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                            >
                                <ChevronLeft className="h-4 w-4" />
                                Previous
                            </Button>
                            <div className="flex gap-1">
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                    let pageNum;
                                    if (totalPages <= 5) {
                                        pageNum = i + 1;
                                    } else if (currentPage <= 3) {
                                        pageNum = i + 1;
                                    } else if (currentPage >= totalPages - 2) {
                                        pageNum = totalPages - 4 + i;
                                    } else {
                                        pageNum = currentPage - 2 + i;
                                    }
                                    return (
                                        <Button
                                            key={pageNum}
                                            variant={currentPage === pageNum ? "default" : "outline"}
                                            size="sm"
                                            onClick={() => setCurrentPage(pageNum)}
                                            className="w-10"
                                        >
                                            {pageNum}
                                        </Button>
                                    );
                                })}
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                            >
                                Next
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
};

export default Violations;
