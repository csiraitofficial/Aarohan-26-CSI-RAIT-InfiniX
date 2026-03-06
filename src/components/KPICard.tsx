import { Card } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPICardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: number;
  variant?: "default" | "warning" | "success" | "danger";
  className?: string;
}

export const KPICard = ({ title, value, icon: Icon, trend, variant = "default", className }: KPICardProps) => {
  const variantClasses = {
    default: "border-primary/20 shadow-glow-primary",
    warning: "border-warning/20 shadow-glow-warning",
    success: "border-success/20 shadow-glow-success",
    danger: "border-destructive/20",
  };

  const iconClasses = {
    default: "text-primary",
    warning: "text-warning",
    success: "text-success",
    danger: "text-destructive",
  };

  return (
    <Card className={cn("p-6 bg-gradient-card border-2 transition-all hover:scale-105", variantClasses[variant], className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold text-foreground">{value}</p>
          {trend !== undefined && (
            <p className={cn("text-xs font-medium", trend >= 0 ? "text-success" : "text-destructive")}>
              {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}%
            </p>
          )}
        </div>
        <div className={cn("p-3 rounded-lg bg-card/50", iconClasses[variant])}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </Card>
  );
};
