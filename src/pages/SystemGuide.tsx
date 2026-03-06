import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, BookOpen, Zap, MapPin, UserCheck, Navigation, Play, Video, AlertTriangle, FileText, Siren, LineChart, Activity, Users, Shield } from "lucide-react";

const SystemGuide = () => {
    const [searchQuery, setSearchQuery] = useState("");

    const modules = [
        {
            id: "dashboard",
            title: "Dashboard",
            icon: BookOpen,
            description: "Central hub for monitoring traffic system overview",
            details: "The Dashboard provides a comprehensive overview of the entire traffic management system. It displays real-time statistics, active incidents, traffic flow metrics, and system health status. Users can quickly access key information and navigate to specific modules from this central hub.",
            features: [
                "Real-time traffic statistics",
                "Active incident tracking",
                "System health monitoring",
                "Quick access to all modules",
                "Customizable widgets"
            ],
            roles: ["admin", "operator", "analyst"]
        },
        {
            id: "signal-control",
            title: "Signal Control",
            icon: Zap,
            description: "Intelligent traffic signal management and optimization",
            details: "Control and optimize traffic signals across the city. This module allows operators to manually override signals, implement adaptive timing based on traffic flow, and coordinate signal patterns for emergency vehicle priority.",
            features: [
                "Manual signal override",
                "Adaptive signal timing",
                "Emergency vehicle priority",
                "Signal coordination",
                "Real-time phase monitoring"
            ],
            roles: ["admin", "operator"]
        },
        {
            id: "incident-management",
            title: "Incident Management",
            icon: MapPin,
            description: "Track and manage traffic incidents in real-time",
            details: "Comprehensive incident tracking and management system. Report, track, and resolve traffic incidents including accidents, roadblocks, and maintenance activities. Assign personnel, monitor resolution status, and analyze incident patterns.",
            features: [
                "Incident reporting and tracking",
                "Personnel assignment",
                "Priority-based queue",
                "Real-time status updates",
                "Incident history and analytics"
            ],
            roles: ["admin", "operator"]
        },
        {
            id: "personnel-management",
            title: "Personnel Management",
            icon: UserCheck,
            description: "Manage traffic police and field staff deployment",
            details: "Track and manage traffic police and field personnel. View real-time locations, assign tasks, monitor availability, and optimize deployment based on current traffic conditions and incident locations.",
            features: [
                "Real-time personnel tracking",
                "Task assignment and scheduling",
                "Availability status",
                "Performance metrics",
                "Deployment optimization"
            ],
            roles: ["admin", "operator"]
        },
        {
            id: "route-optimization",
            title: "Route Optimization",
            icon: Navigation,
            description: "AI-powered route planning and traffic optimization",
            details: "Advanced route optimization using real-time traffic data. Help drivers find the fastest routes, reduce congestion through intelligent routing, and provide alternative paths during incidents or peak hours.",
            features: [
                "Real-time route calculation",
                "Traffic-aware routing",
                "Multiple route alternatives",
                "ETA predictions",
                "Congestion avoidance"
            ],
            roles: ["admin", "operator", "analyst"]
        },
        {
            id: "mappo-simulation",
            title: "MAPPO Simulation",
            icon: Play,
            description: "Multi-agent reinforcement learning traffic simulation",
            details: "Advanced traffic simulation using MAPPO (Multi-Agent Proximal Policy Optimization) algorithm. Test traffic management strategies, predict outcomes of signal timing changes, and train AI models for optimal traffic flow.",
            features: [
                "Multi-agent traffic simulation",
                "Strategy testing and validation",
                "AI model training",
                "Scenario comparison",
                "Performance metrics visualization"
            ],
            roles: ["admin", "operator", "analyst"]
        },
        {
            id: "cctv-monitoring",
            title: "CCTV Monitoring",
            icon: Video,
            description: "Live camera feeds with AI-powered analysis",
            details: "Monitor live CCTV feeds from traffic cameras across the city. AI-powered vehicle detection and counting, automatic incident detection, and real-time alerts for unusual traffic patterns or violations.",
            features: [
                "Live camera feeds",
                "AI vehicle detection and counting",
                "Automatic incident detection",
                "Recording and playback",
                "Multi-camera monitoring"
            ],
            roles: ["admin", "operator"]
        },
        {
            id: "violations-echallan",
            title: "Traffic Violations & e-Challan",
            icon: AlertTriangle,
            description: "Automated violation detection and digital challan system",
            details: "Comprehensive traffic violation management system. Automatically detect violations using AI and CCTV footage, generate e-challans, track payment status, and maintain violation records. Integration with vehicle registration databases.",
            features: [
                "Automated violation detection",
                "Digital challan generation",
                "Payment tracking",
                "Violation history",
                "License plate recognition"
            ],
            roles: ["admin", "operator"]
        },
        {
            id: "emergency-response",
            title: "Emergency Response",
            icon: Siren,
            description: "Priority routing for emergency vehicles",
            details: "Dedicated system for emergency vehicle management. Create green corridors, provide priority signal control, track emergency vehicle routes in real-time, and coordinate with emergency services for fastest response times.",
            features: [
                "Green corridor creation",
                "Priority signal control",
                "Real-time vehicle tracking",
                "Route optimization for emergencies",
                "Response time analytics"
            ],
            roles: ["admin", "operator"]
        },
        {
            id: "analytics",
            title: "AI Analytics & Telemetry",
            icon: LineChart,
            description: "Advanced analytics and insights from traffic data",
            details: "Powerful analytics engine providing insights from traffic data. Generate reports, identify trends, predict traffic patterns, and make data-driven decisions for traffic management improvements.",
            features: [
                "Traffic pattern analysis",
                "Predictive analytics",
                "Custom report generation",
                "Trend identification",
                "Performance dashboards"
            ],
            roles: ["admin", "analyst"]
        },
        {
            id: "road-signs",
            title: "Road Signs & Signals",
            icon: Shield,
            description: "Educational guide for traffic signs and signals",
            details: "Comprehensive reference guide for all types of traffic signs and signals. Learn about warning signs, regulatory signs, informational signs, and traffic signal meanings. Includes actual sign images and detailed descriptions.",
            features: [
                "Complete sign catalog",
                "Actual sign images",
                "Detailed descriptions",
                "Search functionality",
                "Categorized by type"
            ],
            roles: ["admin", "operator", "analyst"]
        }
    ];

    const userRoles = [
        {
            role: "Admin",
            description: "Full system access with administrative privileges",
            permissions: [
                "Access all modules",
                "Manage users and permissions",
                "Configure system settings",
                "View all analytics and reports",
                "Override any operation"
            ],
            badge: "danger"
        },
        {
            role: "Operator",
            description: "Traffic management and operational control",
            permissions: [
                "Control traffic signals",
                "Manage incidents",
                "Deploy personnel",
                "Monitor CCTV feeds",
                "Generate e-challans"
            ],
            badge: "default"
        },
        {
            role: "Analyst",
            description: "Data analysis and reporting focused role",
            permissions: [
                "View analytics and reports",
                "Access simulation tools",
                "Generate custom reports",
                "Analyze traffic patterns",
                "View historical data"
            ],
            badge: "secondary"
        }
    ];

    const faqs = [
        {
            question: "How does the AI-powered traffic signal optimization work?",
            answer: "Our system uses real-time traffic data from CCTV cameras and sensors to analyze traffic flow. The MAPPO algorithm learns optimal signal timing patterns through reinforcement learning, adapting to current traffic conditions to minimize congestion and wait times."
        },
        {
            question: "Can I manually override automated traffic signals?",
            answer: "Yes, operators and admins can manually override signals through the Signal Control module. This is useful for emergency situations, special events, or when manual intervention is needed. All overrides are logged for audit purposes."
        },
        {
            question: "How are traffic violations detected?",
            answer: "Violations are detected using AI-powered video analysis on CCTV feeds. The system can identify speeding, red light violations, wrong-way driving, and other traffic rule violations. License plates are automatically recognized for e-challan generation."
        },
        {
            question: "What happens during an emergency vehicle request?",
            answer: "When an emergency vehicle is detected or registered in the system, the Emergency Response module creates a green corridor by adjusting traffic signals along the route. This ensures the fastest possible travel time for ambulances, fire trucks, and police vehicles."
        },
        {
            question: "How accurate is the route optimization?",
            answer: "Our route optimization uses real-time traffic data, historical patterns, and current incidents to calculate the fastest routes. It typically provides 85-95% accurate ETA predictions and can update routes dynamically as conditions change."
        },
        {
            question: "Can I generate custom reports?",
            answer: "Yes, the Analytics module allows analysts and admins to generate custom reports. You can select specific metrics, time ranges, locations, and visualization types to create reports tailored to your needs."
        }
    ];

    const filteredModules = modules.filter(module =>
        module.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        module.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        module.details.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredFAQs = faqs.filter(faq =>
        faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight bg-gradient-primary bg-clip-text text-transparent">
                    Yatayat System Guide
                </h1>
                <p className="text-muted-foreground">
                    Comprehensive guide to the Yatayat Traffic Intelligence Platform
                </p>
            </div>

            {/* System Overview Card */}
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <BookOpen className="h-5 w-5 text-primary" />
                        About Yatayat
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm leading-relaxed">
                        Yatayat is an advanced AI-powered traffic management and intelligence platform designed to optimize urban traffic flow,
                        reduce congestion, and improve road safety. The system integrates multiple technologies including computer vision,
                        machine learning, and multi-agent reinforcement learning to provide comprehensive traffic management solutions.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                        <div className="text-center">
                            <div className="text-2xl font-bold text-primary">11+</div>
                            <div className="text-xs text-muted-foreground">Integrated Modules</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-primary">Real-time</div>
                            <div className="text-xs text-muted-foreground">Traffic Analysis</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-primary">AI-Powered</div>
                            <div className="text-xs text-muted-foreground">Decision Making</div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Search Bar */}
            <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    type="text"
                    placeholder="Search modules, features, or FAQs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                />
            </div>

            {/* Modules Documentation */}
            <div className="space-y-4">
                <h2 className="text-2xl font-semibold">System Modules</h2>
                <Accordion type="single" collapsible className="space-y-2">
                    {filteredModules.map((module) => (
                        <AccordionItem key={module.id} value={module.id} className="border rounded-lg px-4">
                            <AccordionTrigger className="hover:no-underline">
                                <div className="flex items-center gap-3 text-left">
                                    <module.icon className="h-5 w-5 text-primary flex-shrink-0" />
                                    <div>
                                        <div className="font-semibold">{module.title}</div>
                                        <div className="text-sm text-muted-foreground font-normal">{module.description}</div>
                                    </div>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="space-y-4 pt-4">
                                <p className="text-sm leading-relaxed">{module.details}</p>

                                <div>
                                    <h4 className="font-semibold text-sm mb-2">Key Features:</h4>
                                    <ul className="space-y-1">
                                        {module.features.map((feature, idx) => (
                                            <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                                                <span className="text-primary mt-1">•</span>
                                                <span>{feature}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div>
                                    <h4 className="font-semibold text-sm mb-2">Accessible to:</h4>
                                    <div className="flex gap-2">
                                        {module.roles.map((role) => (
                                            <Badge key={role} variant="secondary" className="capitalize">
                                                {role}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>

                {filteredModules.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                        No modules found matching your search.
                    </p>
                )}
            </div>

            {/* User Roles */}
            <div className="space-y-4">
                <h2 className="text-2xl font-semibold">User Roles</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {userRoles.map((userRole) => (
                        <Card key={userRole.role}>
                            <CardHeader>
                                <CardTitle className="flex items-center justify-between">
                                    <span>{userRole.role}</span>
                                    <Badge variant={userRole.badge as any}>{userRole.role}</Badge>
                                </CardTitle>
                                <CardDescription>{userRole.description}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <h4 className="font-semibold text-sm mb-2">Permissions:</h4>
                                <ul className="space-y-1">
                                    {userRole.permissions.map((permission, idx) => (
                                        <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                                            <span className="text-primary mt-1">✓</span>
                                            <span>{permission}</span>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>

            {/* FAQ Section */}
            <div className="space-y-4">
                <h2 className="text-2xl font-semibold">Frequently Asked Questions</h2>
                <Accordion type="single" collapsible className="space-y-2">
                    {filteredFAQs.map((faq, idx) => (
                        <AccordionItem key={idx} value={`faq-${idx}`} className="border rounded-lg px-4">
                            <AccordionTrigger className="hover:no-underline text-left">
                                {faq.question}
                            </AccordionTrigger>
                            <AccordionContent className="text-sm text-muted-foreground leading-relaxed pt-4">
                                {faq.answer}
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>

                {filteredFAQs.length === 0 && searchQuery && (
                    <p className="text-center text-muted-foreground py-8">
                        No FAQs found matching your search.
                    </p>
                )}
            </div>
        </div>
    );
};

export default SystemGuide;
