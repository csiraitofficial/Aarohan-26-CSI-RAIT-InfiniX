import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";

interface LayoutProps {
    children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
    const navigate = useNavigate();
    const { toast } = useToast();
    const userRole = localStorage.getItem("userRole") || "operator";
    const userName = localStorage.getItem("userName") || "User";

    const handleLogout = () => {
        localStorage.removeItem("userRole");
        localStorage.removeItem("userName");
        toast({
            title: "Logged Out",
            description: "You have been successfully logged out",
        });
        navigate("/");
    };

    return (
        <SidebarProvider>
            <div className="min-h-screen flex w-full bg-background">
                <AppSidebar userRole={userRole} onLogout={handleLogout} />
                <div className="flex-1 flex flex-col">
                    <header className="h-16 border-b border-border flex items-center px-6 bg-card/50 backdrop-blur-sm sticky top-0 z-10 transition-colors duration-300">
                        <SidebarTrigger className="mr-4" />
                        <div className="flex-1" />
                        <div className="flex items-center gap-3">
                            <ThemeToggle />
                            <div className="text-right hidden sm:block">
                                <p className="text-sm font-medium text-foreground">{userName}</p>
                                <p className="text-xs text-muted-foreground capitalize">{userRole}</p>
                            </div>
                            <div className="h-10 w-10 rounded-full bg-gradient-primary flex items-center justify-center text-primary-foreground font-bold shadow-lg">
                                {userName.charAt(0)}
                            </div>
                        </div>
                    </header>
                    <main className="flex-1 p-6 overflow-auto transition-colors duration-300">
                        {children}
                    </main>
                </div>
            </div>
        </SidebarProvider>
    );
};
