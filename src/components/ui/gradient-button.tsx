import { ReactNode } from "react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

interface GradientButtonProps {
    children: ReactNode;
    className?: string;
    onClick?: () => void;
    variant?: "primary" | "secondary" | "success" | "warning" | "danger";
    size?: "sm" | "md" | "lg";
    disabled?: boolean;
    icon?: ReactNode;
}

export const GradientButton = ({
    children,
    className,
    onClick,
    variant = "primary",
    size = "md",
    disabled = false,
    icon,
}: GradientButtonProps) => {
    const gradients = {
        primary: "bg-gradient-to-r from-primary via-blue-500 to-purple-500",
        secondary: "bg-gradient-to-r from-purple-500 to-pink-500",
        success: "bg-gradient-to-r from-green-500 to-emerald-500",
        warning: "bg-gradient-to-r from-yellow-500 to-orange-500",
        danger: "bg-gradient-to-r from-red-500 to-pink-500",
    };

    const sizes = {
        sm: "px-4 py-2 text-sm",
        md: "px-6 py-3 text-base",
        lg: "px-8 py-4 text-lg",
    };

    return (
        <Button
            onClick={onClick}
            disabled={disabled}
            className={cn(
                gradients[variant],
                sizes[size],
                "text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100",
                className
            )}
        >
            {icon && <span className="mr-2">{icon}</span>}
            {children}
        </Button>
    );
};
