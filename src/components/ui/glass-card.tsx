import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface GlassCardProps {
    children: ReactNode;
    className?: string;
    hover?: boolean;
    glow?: boolean;
}

export const GlassCard = ({ children, className, hover = false, glow = false }: GlassCardProps) => {
    return (
        <div
            className={cn(
                "glass-card rounded-xl p-6 transition-all duration-300",
                hover && "glass-hover hover:scale-[1.02] hover:shadow-glass-lg",
                glow && "hover:glow-primary",
                className
            )}
        >
            {children}
        </div>
    );
};
