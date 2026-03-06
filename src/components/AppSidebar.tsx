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
    { title: t("common.dashboard"), url: "/dashboard", icon: LayoutDashboard, roles: ["admin"] },
    { title: t("common.incidents"), url: "/incidents", icon: MapPin, roles: ["admin"] },
    { title: t("common.signalControl"), url: "/signal-control", icon: Zap, roles: ["admin"] },
    { title: t("common.personnel"), url: "/personnel", icon: UserCheck, roles: ["admin"] },
    { title: t("common.mappoSim"), url: "/simulation-new", icon: Play, roles: ["admin"] },
    { title: t("common.tier1Sim") + " (35)", url: "/simulation-tier1", icon: Building, roles: ["admin"] },
    { title: t("common.tier2Sim") + " (45)", url: "/simulation-tier2", icon: Building2, roles: ["admin"] },
    { title: t("common.cctvMonitoring"), url: "/monitoring", icon: Video, roles: ["admin"] },
    { title: t("common.emergency"), url: "/emergency", icon: Siren, roles: ["admin"] },
    { title: t("common.analytics"), url: "/analytics", icon: LineChart, roles: ["admin"] },
    { title: t("common.reportIncident"), url: "/user-dashboard", icon: AlertTriangle, roles: ["user"] },
    { title: t("common.reportPothole"), url: "/report-pothole", icon: Construction, roles: ["user"] },
    // Allow both admin and user roles to access AI pothole detection so they can raise alerts
    { title: t("common.potholeDetection"), url: "/pothole-detection", icon: AlertTriangle, roles: ["admin", "user"] },
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
