import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AnimatedStatCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: ReactNode;
    gradient: string;
    trend?: {
        value: number;
        isPositive: boolean;
    };
    className?: string;
}

export const AnimatedStatCard = ({
    title,
    value,
    subtitle,
    icon,
    gradient,
    trend,
    className,
}: AnimatedStatCardProps) => {
    return (
        <div
            className={cn(
                "glass-card rounded-2xl p-6 hover:scale-105 transition-all duration-300 cursor-pointer group",
                gradient,
                className
            )}
        >
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <p className="text-sm text-white/70 font-medium mb-2">{title}</p>
                    <h3 className="text-4xl font-bold text-white mb-1 animate-fade-in">
                        {value}
                    </h3>
                    {subtitle && (
                        <p className="text-xs text-white/60 mt-1">{subtitle}</p>
                    )}
                    {trend && (
                        <div className="flex items-center gap-1 mt-2">
                            <span
                                className={cn(
                                    "text-xs font-semibold",
                                    trend.isPositive ? "text-green-400" : "text-red-400"
                                )}
                            >
                                {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}%
                            </span>
                            <span className="text-xs text-white/50">vs last period</span>
                        </div>
                    )}
                </div>
                <div className="p-3 bg-white/10 rounded-xl backdrop-blur-sm group-hover:bg-white/20 transition-all duration-300 group-hover:scale-110">
                    {icon}
                </div>
            </div>
        </div>
    );
};
