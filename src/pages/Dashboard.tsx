import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mockDetectionData } from "@/lib/mockData";
import {
  mockTrafficSignals,
  mockIncidents,
  mockAlerts,
  TrafficSignal,
  Incident,
  Alert
} from "@/lib/trafficOfficerData";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Car, AlertTriangle, Activity, Bell, Zap, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import DashboardMap from "@/components/DashboardMap";
import AlertFeed from "@/components/AlertFeed";

const Dashboard = () => {
  const { t } = useTranslation();
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

  const [signals] = useState<TrafficSignal[]>(mockTrafficSignals);
  const [incidents] = useState<Incident[]>(mockIncidents);
  const [alerts, setAlerts] = useState<Alert[]>(mockAlerts);
  const [focusedLocation, setFocusedLocation] = useState<[number, number] | undefined>(undefined);

  const handleMarkAlertAsRead = (alertId: string) => {
    setAlerts(prev => prev.map(alert =>
      alert.id === alertId ? { ...alert, read: true } : alert
    ));
  };

  const handleDismissAlert = (alertId: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== alertId));
  };

  const vehicleData = [
    { name: "Cars", value: mockDetectionData.cars },
    { name: "Trucks", value: mockDetectionData.trucks },
    { name: "Bikes", value: mockDetectionData.bikes },
    { name: "Pedestrians", value: mockDetectionData.pedestrians },
  ];

  const operationalSignals = signals.filter(s => s.status === 'operational').length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold gradient-text">{t("dashboard.title")}</h1>
          <p className="text-muted-foreground mt-2 text-lg">{t("dashboard.subtitle")}</p>
        </div>
        <div className="glass rounded-xl px-5 py-3 border border-primary/20">
          <span className="text-xs text-muted-foreground block mb-1">{t("dashboard.systemStatus")}</span>
          <span className="text-sm font-bold text-primary flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse-slow"></span>
            {t("dashboard.operational")}
          </span>
        </div>
      </div>

      {/* Premium Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="glass-card rounded-2xl p-6 bg-white dark:bg-gradient-to-br dark:from-blue-500/20 dark:to-blue-600/10 border-gray-100 dark:border-blue-500/20 shadow-sm dark:shadow-none">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm text-gray-500 dark:text-white/70 font-medium mb-2">
                {t("dashboard.totalVehicles")}
              </p>
              <h3 className="text-4xl font-bold text-gray-900 dark:text-white mb-1 animate-fade-in">
                {mockDetectionData.total}
              </h3>
              <div className="flex items-center gap-1 mt-2">
                <span className="text-xs font-semibold text-green-500 dark:text-green-400">↑ 12%</span>
                <span className="text-xs text-gray-400 dark:text-white/50">vs last hour</span>
              </div>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-white/10 rounded-xl">
              <Car className="h-6 w-6 text-blue-600 dark:text-white" />
            </div>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-6 bg-white dark:bg-gradient-to-br dark:from-orange-500/20 dark:to-orange-600/10 border-gray-100 dark:border-orange-500/20 shadow-sm dark:shadow-none">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm text-gray-500 dark:text-white/70 font-medium mb-2">
                {t("dashboard.activeIncidents")}
              </p>
              <h3 className="text-4xl font-bold text-gray-900 dark:text-white mb-1 animate-fade-in">
                {incidents.length}
              </h3>
              <p className="text-xs text-gray-400 dark:text-white/60 mt-1">
                {t("dashboard.activeIncidents")}
              </p>
            </div>
            <div className="p-3 bg-orange-50 dark:bg-white/10 rounded-xl">
              <AlertTriangle className="h-6 w-6 text-orange-600 dark:text-white" />
            </div>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-6 bg-white dark:bg-gradient-to-br dark:from-green-500/20 dark:to-green-600/10 border-gray-100 dark:border-green-500/20 shadow-sm dark:shadow-none">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm text-gray-500 dark:text-white/70 font-medium mb-2">{t("dashboard.signalsOnline")}</p>
              <h3 className="text-4xl font-bold text-gray-900 dark:text-white mb-1 animate-fade-in">
                {`${operationalSignals}/${signals.length}`}
              </h3>
              <p className="text-xs text-gray-400 dark:text-white/60 mt-1">
                {t("dashboard.operational")}
              </p>
            </div>
            <div className="p-3 bg-green-50 dark:bg-white/10 rounded-xl">
              <Zap className="h-6 w-6 text-green-600 dark:text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Map and Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DashboardMap
            focusPos={focusedLocation}
            incidents={incidents.filter(i => ['sos', 'pothole', 'accident'].includes(i.type))}
          />
        </div>
        <div className="space-y-4">
          <AlertFeed
            alerts={alerts}
            onMarkAsRead={handleMarkAlertAsRead}
            onDismiss={handleDismissAlert}
            onViewMap={(coords) => setFocusedLocation(coords)}
            maxHeight="340px"
          />
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card rounded-2xl p-6 border-primary/20 transition-all">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Traffic Flow Insights
          </h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockAlerts.slice(0, 7).map((a, i) => ({ time: i, density: Math.random() * 100 }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="time" stroke="#888" />
                <YAxis stroke="#888" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Line type="monotone" dataKey="density" stroke="#00C49F" strokeWidth={3} dot={{ fill: '#00C49F', r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-6 border-primary/20 transition-all">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Car className="h-5 w-5 text-primary" />
            Vehicle Distribution
          </h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={vehicleData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  fill="#8884d8"
                  paddingAngle={5}
                  dataKey="value"
                >
                  {vehicleData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px' }}
                  itemStyle={{ color: '#fff' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-2">
              {vehicleData.map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                  <span className="text-[10px] text-muted-foreground">{entry.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;