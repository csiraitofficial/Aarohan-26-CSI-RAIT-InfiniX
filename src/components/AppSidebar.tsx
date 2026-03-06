import { LayoutDashboard, Video, LineChart, Activity, FileText, LogOut, Siren, AlertTriangle, Users, Zap, MapPin, UserCheck, Navigation, Play, Building2, Building, BookOpen, Signpost, GitCompareArrows, Construction, Languages } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";

interface AppSidebarProps {
  userRole: string;
  onLogout: () => void;
}

export function AppSidebar({ userRole, onLogout }: AppSidebarProps) {
  const { t } = useTranslation();

  const menuItems = [
    { title: t("common.dashboard"), url: "/dashboard", icon: LayoutDashboard, roles: ["admin", "operator"] },
    { title: t("common.cctvMonitoring"), url: "/monitoring", icon: Video, roles: ["admin", "operator"] },
  ];

  const filteredItems = menuItems.filter(item => item.roles.includes(userRole));

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarContent>
        <div className="p-6 border-b border-sidebar-border">
          <h1 className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Yatayat
          </h1>
          <p className="text-xs text-muted-foreground mt-1">Traffic Intelligence</p>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-all duration-200 font-medium"
                      activeClassName="bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border space-y-2">
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-xs font-medium text-muted-foreground">Language</span>
          <LanguageSwitcher />
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span>{t("common.logout")}</span>
        </button>
      </SidebarFooter>
    </Sidebar >
  );
}
