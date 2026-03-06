import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    AlertTriangle,
    Users,
    Radio,
    FileText,
    MapPin,
    Zap,
    Camera,
    Settings
} from "lucide-react";
import { useTranslation } from "react-i18next";

interface QuickAction {
    id: string;
    label: string;
    icon: React.ReactNode;
    color: string;
    onClick: () => void;
}

interface QuickActionPanelProps {
    onReportIncident?: () => void;
    onDispatchOfficer?: () => void;
    onBroadcastAlert?: () => void;
    onGenerateReport?: () => void;
    onViewMap?: () => void;
    onOverrideSignal?: () => void;
    onViewCameras?: () => void;
    onSystemSettings?: () => void;
}

export default function QuickActionPanel({
    onReportIncident,
    onDispatchOfficer,
    onBroadcastAlert,
    onGenerateReport,
    onViewMap,
    onOverrideSignal,
    onViewCameras,
    onSystemSettings
}: QuickActionPanelProps) {
    const { t } = useTranslation();

    const quickActions: QuickAction[] = [
        {
            id: 'dispatch',
            label: t("dashboard.dispatchOfficer"),
            icon: <Users className="h-5 w-5" />,
            color: 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border-blue-500/20',
            onClick: onDispatchOfficer || (() => { })
        },

        {
            id: 'report',
            label: t("dashboard.generateReport"),
            icon: <FileText className="h-5 w-5" />,
            color: 'bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20',
            onClick: onGenerateReport || (() => { })
        },

        {
            id: 'signal',
            label: t("dashboard.overrideSignal"),
            icon: <Zap className="h-5 w-5" />,
            color: 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 border-yellow-500/20',
            onClick: onOverrideSignal || (() => { })
        },

        {
            id: 'settings',
            label: t("dashboard.systemSettings"),
            icon: <Settings className="h-5 w-5" />,
            color: 'bg-gray-500/10 text-gray-500 hover:bg-gray-500/20 border-gray-500/20',
            onClick: onSystemSettings || (() => { })
        }
    ];

    return (
        <Card className="p-4 bg-gradient-card border-2 border-primary/20">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                {t("dashboard.quickActions")}
            </h3>

            <div className="grid grid-cols-2 gap-3">
                {quickActions.map((action) => (
                    <Button
                        key={action.id}
                        variant="outline"
                        className={`h-auto py-4 flex flex-col items-center gap-2 ${action.color} border-2 transition-all`}
                        onClick={action.onClick}
                    >
                        {action.icon}
                        <span className="text-xs font-medium">{action.label}</span>
                    </Button>
                ))}
            </div>
        </Card>
    );
}
