import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Officer, mockOfficers, TrafficDataStore } from "@/lib/trafficOfficerData";
import DashboardMap from "@/components/DashboardMap";
import { Users, MapPin, Phone, Radio, Award, Clock, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function PersonnelManagement() {
    const { t } = useTranslation();
    const [officers, setOfficers] = useState<Officer[]>([]);

    useEffect(() => {
        const loadedOfficers = TrafficDataStore.loadOfficers();
        setOfficers(loadedOfficers.length > 0 ? loadedOfficers : mockOfficers);
    }, []);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'on-duty': return 'bg-green-500/10 text-green-500 border-green-500/20';
            case 'deployed': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
            case 'break': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
            case 'off-duty': return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
            case 'on-call': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
            default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
        }
    };

    const onDutyOfficers = officers.filter(o => o.status === 'on-duty' || o.status === 'deployed');
    const offDutyOfficers = officers.filter(o => o.status === 'off-duty' || o.status === 'break');

    const stats = {
        total: officers.length,
        onDuty: onDutyOfficers.length,
        deployed: officers.filter(o => o.status === 'deployed').length,
        offDuty: offDutyOfficers.length,
        totalViolations: officers.reduce((sum, o) => sum + o.performance.violationsIssued, 0),
        totalIncidents: officers.reduce((sum, o) => sum + o.performance.incidentsHandled, 0),
        avgResponseTime: (officers.reduce((sum, o) => sum + o.performance.avgResponseTime, 0) / officers.length).toFixed(1)
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">{t("personnelManagement.title")}</h1>
                    <p className="text-muted-foreground mt-1">{t("personnelManagement.subtitle")}</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline">
                        <Users className="h-4 w-4 mr-2" />
                        {t("personnelManagement.viewShifts")}
                    </Button>
                    <Button>
                        <MapPin className="h-4 w-4 mr-2" />
                        {t("personnelManagement.trackAll")}
                    </Button>
                </div>
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                <Card className="p-4 bg-gradient-card border-2 border-primary/20">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/10 rounded-full">
                            <Users className="h-5 w-5 text-blue-500" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">{t("personnelManagement.stats.total")}</p>
                            <p className="text-2xl font-bold">{stats.total}</p>
                        </div>
                    </div>
                </Card>

                <Card className="p-4 bg-gradient-card border-2 border-green-500/20">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-500/10 rounded-full">
                            <Users className="h-5 w-5 text-green-500" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">{t("personnelManagement.stats.onDuty")}</p>
                            <p className="text-2xl font-bold">{stats.onDuty}</p>
                        </div>
                    </div>
                </Card>

                <Card className="p-4 bg-gradient-card border-2 border-blue-500/20">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/10 rounded-full">
                            <MapPin className="h-5 w-5 text-blue-500" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">{t("personnelManagement.stats.deployed")}</p>
                            <p className="text-2xl font-bold">{stats.deployed}</p>
                        </div>
                    </div>
                </Card>

                <Card className="p-4 bg-gradient-card border-2 border-gray-500/20">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-500/10 rounded-full">
                            <Users className="h-5 w-5 text-gray-500" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">{t("personnelManagement.stats.offDuty")}</p>
                            <p className="text-2xl font-bold">{stats.offDuty}</p>
                        </div>
                    </div>
                </Card>

                <Card className="p-4 bg-gradient-card border-2 border-orange-500/20">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-500/10 rounded-full">
                            <Award className="h-5 w-5 text-orange-500" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">{t("personnelManagement.stats.violations")}</p>
                            <p className="text-2xl font-bold">{stats.totalViolations}</p>
                        </div>
                    </div>
                </Card>

                <Card className="p-4 bg-gradient-card border-2 border-purple-500/20">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-500/10 rounded-full">
                            <TrendingUp className="h-5 w-5 text-purple-500" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">{t("personnelManagement.stats.incidents")}</p>
                            <p className="text-2xl font-bold">{stats.totalIncidents}</p>
                        </div>
                    </div>
                </Card>

                <Card className="p-4 bg-gradient-card border-2 border-cyan-500/20">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-cyan-500/10 rounded-full">
                            <Clock className="h-5 w-5 text-cyan-500" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">{t("personnelManagement.stats.avgResponse")}</p>
                            <p className="text-xl font-bold">{stats.avgResponseTime}m</p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Map and Officer List */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <Card className="p-4 bg-gradient-card border-2 border-primary/20">
                        <h3 className="font-semibold mb-4">{t("personnelManagement.mapTitle")}</h3>
                        <div className="h-[600px]">
                            <DashboardMap />
                        </div>
                    </Card>
                </div>

                <div>
                    <Tabs defaultValue="on-duty" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="on-duty">{t("personnelManagement.tabs.onDuty")} ({onDutyOfficers.length})</TabsTrigger>
                            <TabsTrigger value="off-duty">{t("personnelManagement.tabs.offDuty")} ({offDutyOfficers.length})</TabsTrigger>
                        </TabsList>

                        <TabsContent value="on-duty" className="mt-4">
                            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                                {onDutyOfficers.map(officer => (
                                    <Card key={officer.id} className="p-4 bg-gradient-card border-2 border-primary/20 hover:border-primary/40 transition-all">
                                        <div className="space-y-3">
                                            {/* Header */}
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <h4 className="font-semibold">{officer.name}</h4>
                                                    <p className="text-xs text-muted-foreground">{t(`officers.ranks.${officer.rank}`)}</p>
                                                    <p className="text-xs text-muted-foreground">{officer.badgeNumber}</p>
                                                </div>
                                                <Badge className={`${getStatusColor(officer.status)} border text-xs`}>
                                                    {t(`officers.statuses.${officer.status}`)}
                                                </Badge>
                                            </div>

                                            {/* Location */}
                                            <div className="flex items-center gap-2 text-xs">
                                                <MapPin className="h-3 w-3 text-muted-foreground" />
                                                <span className="text-muted-foreground">{officer.location.area}</span>
                                            </div>

                                            {/* Assignment */}
                                            {officer.assignment && (
                                                <div className="bg-background/50 rounded p-2">
                                                    <p className="text-xs text-muted-foreground">{t("personnelManagement.card.assignment")}</p>
                                                    <p className="text-xs font-medium">{officer.assignment}</p>
                                                </div>
                                            )}

                                            {/* Contact */}
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                <div className="flex items-center gap-1">
                                                    <Phone className="h-3 w-3 text-muted-foreground" />
                                                    <span className="text-muted-foreground truncate">{officer.contact.phone.slice(-10)}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Radio className="h-3 w-3 text-muted-foreground" />
                                                    <span className="text-muted-foreground">{officer.contact.radio}</span>
                                                </div>
                                            </div>

                                            {/* Performance */}
                                            <div className="bg-background/50 rounded p-2 space-y-1">
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-muted-foreground">{t("personnelManagement.card.violations")}</span>
                                                    <span className="font-semibold">{officer.performance.violationsIssued}</span>
                                                </div>
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-muted-foreground">{t("personnelManagement.card.incidents")}</span>
                                                    <span className="font-semibold">{officer.performance.incidentsHandled}</span>
                                                </div>
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-muted-foreground">{t("personnelManagement.card.avgResponse")}</span>
                                                    <span className="font-semibold">{officer.performance.avgResponseTime}m</span>
                                                </div>
                                            </div>

                                            {/* Equipment */}
                                            <div className="flex flex-wrap gap-1">
                                                {officer.equipment.map((item, idx) => (
                                                    <Badge key={idx} variant="outline" className="text-xs">
                                                        {item}
                                                    </Badge>
                                                ))}
                                            </div>

                                            {/* Actions */}
                                            <div className="flex gap-2">
                                                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs">
                                                    <Phone className="h-3 w-3 mr-1" />
                                                    {t("personnelManagement.card.call")}
                                                </Button>
                                                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs">
                                                    <MapPin className="h-3 w-3 mr-1" />
                                                    {t("personnelManagement.card.track")}
                                                </Button>
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        </TabsContent>

                        <TabsContent value="off-duty" className="mt-4">
                            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                                {offDutyOfficers.map(officer => (
                                    <Card key={officer.id} className="p-4 bg-gradient-card border-2 border-primary/20 opacity-60">
                                        <div className="space-y-2">
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <h4 className="font-semibold">{officer.name}</h4>
                                                    <p className="text-xs text-muted-foreground">{t(`officers.ranks.${officer.rank}`)} - {officer.badgeNumber}</p>
                                                </div>
                                                <Badge className={`${getStatusColor(officer.status)} border text-xs`}>
                                                    {t(`officers.statuses.${officer.status}`)}
                                                </Badge>
                                            </div>

                                            <div className="bg-background/50 rounded p-2 space-y-1">
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-muted-foreground">{t("personnelManagement.card.shift")}</span>
                                                    <span className="font-semibold">{officer.shift.start} - {officer.shift.end}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </div>
    );
}
