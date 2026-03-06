import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { mockPredictions, mockStreams, mockDetectionData } from "@/lib/mockData";
import {
  mockTrafficSignals,
  mockIncidents,
  mockAlerts,
  TrafficDataStore,
  TrafficSignal,
  Incident,
  Alert
} from "@/lib/trafficOfficerData";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Car, AlertTriangle, Activity, Video, Zap, MapPin, Users, Clock, Building, Building2, Play, Square, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import DashboardMap from "@/components/DashboardMap";
import SmartRecommendations from "@/components/SmartRecommendations";
import WeatherWidget from "@/components/WeatherWidget";
import QuickActionPanel from "@/components/QuickActionPanel";
import AlertFeed from "@/components/AlertFeed";
import IncidentCard from "@/components/IncidentCard";

// Simulation tier configuration
const TIER_CONFIG = {
  tier1: {
    name: "Level 1 - Metro City",
    apiBase: "http://localhost:8767",
    junctions: 35,
    icon: Building,
    color: "blue"
  },
  tier2: {
    name: "Level 2 - District City",
    apiBase: "http://localhost:8768",
    junctions: 45,
    icon: Building2,
    color: "purple"
  }
};

// LocalStorage key for tier selection
const TIER_STORAGE_KEY = "dashboard-selected-tier";

// Load saved tier preference
const loadSavedTier = (): "tier1" | "tier2" => {
  try {
    const saved = localStorage.getItem(TIER_STORAGE_KEY);
    if (saved === "tier1" || saved === "tier2") return saved;
  } catch (e) { }
  return "tier1";
};

interface SimulationData {
  step: number;
  totalQueue: number;
  signalCount: number;
  spillbackCount: number;
  events?: {
    emergency: any;
    accident_signals: string[];
    rally_signals: string[];
  };
}

const Dashboard = () => {
  const navigate = useNavigate();
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

  const [signals, setSignals] = useState<TrafficSignal[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  // Tier selection and simulation state
  const [selectedTier, setSelectedTier] = useState<"tier1" | "tier2">(loadSavedTier);
  const [connected, setConnected] = useState(false);
  const [simRunning, setSimRunning] = useState(false);
  const [simData, setSimData] = useState<SimulationData>({
    step: 0,
    totalQueue: 0,
    signalCount: 0,
    spillbackCount: 0
  });
  const [focusedLocation, setFocusedLocation] = useState<[number, number] | undefined>(undefined);
  const pollRef = useRef<number | null>(null);

  const currentTier = TIER_CONFIG[selectedTier];
  const TierIcon = currentTier.icon;

  // Change tier and persist
  const changeTier = (tier: "tier1" | "tier2") => {
    if (tier === selectedTier) return;
    // Stop polling before switching
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setSimRunning(false);
    setConnected(false);
    setSimData({ step: 0, totalQueue: 0, signalCount: 0, spillbackCount: 0 });
    setSelectedTier(tier);
    localStorage.setItem(TIER_STORAGE_KEY, tier);
  };

  // Check connection to simulation backend
  const checkConnection = useCallback(async () => {
    try {
      const res = await fetch(`${currentTier.apiBase}/api/network`);
      if (res.ok) {
        const data = await res.json();
        setConnected(true);
        setSimData(prev => ({ ...prev, signalCount: data.network?.length || 0 }));
        return true;
      }
    } catch (e) { }
    setConnected(false);
    return false;
  }, [currentTier.apiBase]);

  // Poll simulation data
  const pollSimulation = useCallback(async () => {
    try {
      const res = await fetch(`${currentTier.apiBase}/api/sim/step`);
      if (!res.ok) return;
      const data = await res.json();

      // Calculate metrics from signals
      let totalQueue = 0;
      let spillbackCount = 0;
      let signalCount = 0;

      if (data.signals) {
        const signalsArray = Object.values(data.signals) as any[];
        signalCount = signalsArray.length;
        signalsArray.forEach((s: any) => {
          const q = s.queues?.total ?? (s.queues?.through ?? 0) + (s.queues?.left ?? 0) + (s.queues?.right ?? 0);
          totalQueue += q;
          if (s.spillback) spillbackCount++;
        });
      }

      setSimData({
        step: data.step ?? 0,
        totalQueue: Math.round(totalQueue),
        signalCount,
        spillbackCount,
        events: data.events
      });
      setSimRunning(true);
    } catch (e) {
      // Simulation might not be running
      setSimRunning(false);
    }
  }, [currentTier.apiBase]);

  // Start polling when connected
  useEffect(() => {
    checkConnection();
    const interval = setInterval(pollSimulation, 1000) as any;
    pollRef.current = interval;
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selectedTier, checkConnection, pollSimulation]);

  useEffect(() => {
    // Load data from localStorage or use mock data
    const loadedSignals = TrafficDataStore.loadSignals();
    const loadedIncidents = TrafficDataStore.loadIncidents();
    const loadedAlerts = TrafficDataStore.loadAlerts();

    setSignals(loadedSignals.length > 0 ? loadedSignals : mockTrafficSignals);
    setIncidents(loadedIncidents.length > 0 ? loadedIncidents : mockIncidents);
    setAlerts(loadedAlerts.length > 0 ? loadedAlerts : mockAlerts);

    // Polling for updates from TrafficDataStore (e.g. from User Dashboard SOS)
    const storeInterval = setInterval(() => {
      const updatedIncidents = TrafficDataStore.loadIncidents();
      const updatedAlerts = TrafficDataStore.loadAlerts();

      setIncidents(prevIncidents => {
        // Only update if lengths differ or if it's a simple mock check
        // In a real app we'd do a more thorough comparison or use a store
        if (updatedIncidents.length !== prevIncidents.length) return updatedIncidents;
        return prevIncidents;
      });

      setAlerts(prevAlerts => {
        if (updatedAlerts.length !== prevAlerts.length) return updatedAlerts;
        return prevAlerts;
      });
    }, 5000);

    return () => clearInterval(storeInterval);
  }, []);

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

  const activeIncidents = incidents.filter(i => ['reported', 'assigned', 'in-progress'].includes(i.status));
  const operationalSignals = signals.filter(s => s.status === 'operational').length;
  const offlineSignals = signals.filter(s => s.status === 'offline').length;

  // Use simulation data when available, fallback to mock
  const displayTotalQueue = simRunning ? simData.totalQueue : mockDetectionData.total;
  const displaySignalCount = simRunning ? simData.signalCount : signals.length;
  const displayStep = simData.step;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold gradient-text">Central Operations Dashboard</h1>
          <p className="text-muted-foreground mt-2 text-lg">Real-time monitoring and AI-driven insights</p>
        </div>
        <div className="flex gap-3">

          <div className="glass rounded-xl px-5 py-3 border border-primary/20">
            <span className="text-xs text-muted-foreground block mb-1">System Status</span>
            <span className="text-sm font-bold text-primary flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'} animate-pulse-slow`}></span>
              {connected ? 'Operational' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>

      {/* Tier Selector */}
      <Card className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-2 border-primary/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-muted-foreground">Simulation Source:</span>
            <div className="flex gap-2">
              <Button
                variant={selectedTier === "tier1" ? "default" : "outline"}
                size="sm"
                onClick={() => changeTier("tier1")}
                className={`gap-2 ${selectedTier === 'tier1' ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
              >
                <Building className="h-4 w-4" />
                Level 1 (35 signals)
              </Button>
              <Button
                variant={selectedTier === "tier2" ? "default" : "outline"}
                size="sm"
                onClick={() => changeTier("tier2")}
                className={`gap-2 ${selectedTier === 'tier2' ? 'bg-purple-600 hover:bg-purple-700' : ''}`}
              >
                <Building2 className="h-4 w-4" />
                Level 2 (45 signals)
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant={connected ? "default" : "destructive"} className="gap-1">
              {connected ? '● Connected' : '○ Disconnected'}
            </Badge>
            {simRunning && (
              <Badge variant="secondary" className="gap-1 animate-pulse">
                <Play className="h-3 w-3" /> Step: {displayStep}
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={checkConnection} className="gap-1">
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </div>
        </div>
      </Card>

      {/* Premium Stat Cards - Now with live simulation data */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="glass-card rounded-2xl p-6 bg-white dark:bg-gradient-to-br dark:from-blue-500/20 dark:to-blue-600/10 border-gray-100 dark:border-blue-500/20 hover:scale-105 transition-all duration-300 cursor-pointer group shadow-sm dark:shadow-none">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm text-gray-500 dark:text-white/70 font-medium mb-2">
                {simRunning ? 'Total Queue' : 'Total Vehicles'}
              </p>
              <h3 className="text-4xl font-bold text-gray-900 dark:text-white mb-1 animate-fade-in">
                {displayTotalQueue}
              </h3>
              <div className="flex items-center gap-1 mt-2">
                {simRunning ? (
                  <Badge variant="outline" className="text-xs">Live from {currentTier.name}</Badge>
                ) : (
                  <>
                    <span className="text-xs font-semibold text-green-500 dark:text-green-400">↑ 12%</span>
                    <span className="text-xs text-gray-400 dark:text-white/50">vs last hour</span>
                  </>
                )}
              </div>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-white/10 rounded-xl backdrop-blur-sm group-hover:bg-blue-100 dark:group-hover:bg-white/20 transition-all duration-300 group-hover:scale-110">
              <Car className="h-6 w-6 text-blue-600 dark:text-white" />
            </div>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-6 bg-white dark:bg-gradient-to-br dark:from-orange-500/20 dark:to-orange-600/10 border-gray-100 dark:border-orange-500/20 hover:scale-105 transition-all duration-300 cursor-pointer group shadow-sm dark:shadow-none">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm text-gray-500 dark:text-white/70 font-medium mb-2">
                {simRunning ? 'Spillback Signals' : 'Active Incidents'}
              </p>
              <h3 className="text-4xl font-bold text-gray-900 dark:text-white mb-1 animate-fade-in">
                {simRunning ? simData.spillbackCount : activeIncidents.length}
              </h3>
              <p className="text-xs text-gray-400 dark:text-white/60 mt-1">
                {simRunning ? 'Congested signals' : 'Requires attention'}
              </p>
            </div>
            <div className="p-3 bg-orange-50 dark:bg-white/10 rounded-xl backdrop-blur-sm group-hover:bg-orange-100 dark:group-hover:bg-white/20 transition-all duration-300 group-hover:scale-110">
              <AlertTriangle className="h-6 w-6 text-orange-600 dark:text-white" />
            </div>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-6 bg-white dark:bg-gradient-to-br dark:from-green-500/20 dark:to-green-600/10 border-gray-100 dark:border-green-500/20 hover:scale-105 transition-all duration-300 cursor-pointer group shadow-sm dark:shadow-none">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm text-gray-500 dark:text-white/70 font-medium mb-2">Signals Online</p>
              <h3 className="text-4xl font-bold text-gray-900 dark:text-white mb-1 animate-fade-in">
                {simRunning ? displaySignalCount : `${operationalSignals}/${signals.length}`}
              </h3>
              <p className="text-xs text-gray-400 dark:text-white/60 mt-1">
                {simRunning ? `${currentTier.junctions} total in network` : `${offlineSignals} offline`}
              </p>
            </div>
            <div className="p-3 bg-green-50 dark:bg-white/10 rounded-xl backdrop-blur-sm group-hover:bg-green-100 dark:group-hover:bg-white/20 transition-all duration-300 group-hover:scale-110">
              <Zap className="h-6 w-6 text-green-600 dark:text-white" />
            </div>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-6 bg-white dark:bg-gradient-to-br dark:from-purple-500/20 dark:to-purple-600/10 border-gray-100 dark:border-purple-500/20 hover:scale-105 transition-all duration-300 cursor-pointer group shadow-sm dark:shadow-none" onClick={() => navigate(selectedTier === 'tier1' ? '/simulation-tier1' : '/simulation-tier2')}>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm text-gray-500 dark:text-white/70 font-medium mb-2">Simulation Step</p>
              <h3 className="text-4xl font-bold text-gray-900 dark:text-white mb-1 animate-fade-in">
                {displayStep}
              </h3>
              <p className="text-xs text-gray-400 dark:text-white/60 mt-1">
                {simRunning ? 'Click to view simulator' : 'Start simulation'}
              </p>
            </div>
            <div className="p-3 bg-purple-50 dark:bg-white/10 rounded-xl backdrop-blur-sm group-hover:bg-purple-100 dark:group-hover:bg-white/20 transition-all duration-300 group-hover:scale-110">
              <TierIcon className="h-6 w-6 text-purple-600 dark:text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Active Events Panel (shows when simulation has events) */}
      {simRunning && simData.events && (simData.events.emergency || simData.events.accident_signals?.length > 0 || simData.events.rally_signals?.length > 0) && (
        <Card className="p-4 border-2 border-red-200 bg-red-50 dark:bg-red-900/20">
          <h3 className="font-semibold text-red-700 dark:text-red-400 mb-2 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Active Simulation Events
          </h3>
          <div className="flex flex-wrap gap-2">
            {simData.events.emergency && (
              <Badge variant="destructive" className="gap-1">
                🚑 Emergency Active
              </Badge>
            )}
            {simData.events.accident_signals?.length > 0 && (
              <Badge variant="secondary" className="bg-orange-200 text-orange-800">
                🔥 Accident @ {simData.events.accident_signals.join(', ')}
              </Badge>
            )}
            {simData.events.rally_signals?.length > 0 && (
              <Badge variant="secondary" className="bg-purple-200 text-purple-800">
                🚶 Rally @ {simData.events.rally_signals.join(', ')}
              </Badge>
            )}
          </div>
        </Card>
      )}

      {/* Middle Row: Map, Quick Actions & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DashboardMap focusPos={focusedLocation} />
        </div>
        <div className="space-y-4">
          <QuickActionPanel
            onReportIncident={() => navigate('/incidents')}
            onDispatchOfficer={() => navigate('/personnel')}
            onGenerateReport={() => navigate('/analytics')}
            onOverrideSignal={() => navigate('/signal-control')}
            onViewCameras={() => navigate('/traffic-monitor')}
            onSystemSettings={() => navigate('/monitoring')}
          />
        </div>
      </div>

      {/* Alert Feed & Active Incidents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AlertFeed
          alerts={alerts}
          onMarkAsRead={handleMarkAlertAsRead}
          onDismiss={handleDismissAlert}
          onViewMap={(coords) => setFocusedLocation(coords)}
          maxHeight="450px"
        />

        <Card className="p-4 bg-gradient-card border-2 border-primary/20">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Active Incidents</h3>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate('/incidents')}>
              View All
            </Button>
          </div>
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
            {activeIncidents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No active incidents
              </div>
            ) : (
              activeIncidents.slice(0, 3).map(incident => (
                <IncidentCard
                  key={incident.id}
                  incident={incident}
                  onViewDetails={() => navigate('/incidents')}
                />
              ))
            )}
          </div>
        </Card>
      </div>

      {/* AI Recommendations */}
      <SmartRecommendations />

      {/* Bottom Row: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card rounded-2xl p-6 border-primary/20 hover:border-primary/30 transition-all">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Traffic Flow Prediction
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockPredictions}>
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

        <div className="glass-card rounded-2xl p-6 border-primary/20 hover:border-primary/30 transition-all">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Car className="h-5 w-5 text-primary" />
            Vehicle Distribution
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={vehicleData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
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
            <div className="flex justify-center gap-4 mt-4">
              {vehicleData.map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                  <span className="text-sm text-muted-foreground">{entry.name}</span>
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