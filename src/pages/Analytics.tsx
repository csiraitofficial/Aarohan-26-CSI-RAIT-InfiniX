import { Card } from "@/components/ui/card";
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getLatestCounts, generatePredictions, subscribe, VehicleCounts, PredictionPoint, fetchAndPushCounts, checkBackendStatus } from "@/lib/simulationStore";

import { API_CONFIG } from "@/lib/apiConfig";

const SIM_SERVER = API_CONFIG.ANALYTICS;

const Analytics = () => {
  const { t } = useTranslation();
  // Subscribe to simulation store for live data
  const [vehicleCounts, setVehicleCounts] = useState<VehicleCounts | null>(null);
  const [predictions, setPredictions] = useState<PredictionPoint[]>([]);

  useEffect(() => {
    // Initial load
    setVehicleCounts(getLatestCounts());
    setPredictions(generatePredictions());

    // Subscribe to store updates
    const unsubscribe = subscribe(() => {
      setVehicleCounts(getLatestCounts());
      setPredictions(generatePredictions());
    });

    // Independent polling for Analytics
    // This ensures data flow even if Simulation page is not open
    const pollInterval = setInterval(async () => {
      // Try to fetch latest data from backend
      // We trust the store helper to handle errors and only update if successful
      await fetchAndPushCounts(SIM_SERVER);
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(pollInterval);
    };
  }, []);

  // Vehicle data for charts (no pedestrians - only cars, bikes, trucks)
  const vehicleData = vehicleCounts ? [
    { name: t('simulations.mappo.stats.cars'), value: vehicleCounts.cars, color: "#3B82F6" },
    { name: t('simulations.mappo.stats.bikes'), value: vehicleCounts.bikes, color: "#10B981" },
    { name: t('simulations.mappo.stats.trucks'), value: vehicleCounts.trucks, color: "#F59E0B" },
  ] : [
    { name: t('simulations.mappo.stats.cars'), value: 0, color: "#3B82F6" },
    { name: t('simulations.mappo.stats.bikes'), value: 0, color: "#10B981" },
    { name: t('simulations.mappo.stats.trucks'), value: 0, color: "#F59E0B" },
  ];

  // Model metrics (simulated based on data quality)
  const dataPoints = vehicleCounts ? vehicleCounts.total : 0;
  const lstmAccuracy = Math.min(98, 85 + Math.min(dataPoints * 0.5, 13));
  const forecastError = Math.max(2, 8 - Math.min(dataPoints * 0.3, 6));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t('analytics.title')}</h1>
        <p className="text-muted-foreground mt-1">{t('analytics.subtitle')}</p>
        {!vehicleCounts && (
          <p className="text-sm text-warning mt-2 bg-warning/10 px-3 py-2 rounded-lg inline-block">
            ⚠️ {t('analytics.warning')}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 bg-gradient-card border-2 border-primary/20">
          <h3 className="text-lg font-semibold mb-4 text-foreground">{t('analytics.distribution')}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={vehicleData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {vehicleData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px"
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6 bg-gradient-card border-2 border-primary/20">
          <h3 className="text-lg font-semibold mb-4 text-foreground">{t('analytics.statistics')}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={vehicleData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px"
                }}
              />
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                {vehicleData.map((entry, index) => (
                  <Cell key={`bar-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6 bg-gradient-card border-2 border-primary/20">
          <h3 className="text-lg font-semibold mb-4 text-foreground">{t('analytics.predictions')}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={predictions}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px"
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="actual"
                stroke="#10B981"
                strokeWidth={2}
                name={t('analytics.actual')}
                dot={{ fill: "#10B981", r: 4 }}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="predicted"
                stroke="#F59E0B"
                strokeWidth={2}
                strokeDasharray="5 5"
                name={t('analytics.predicted')}
                dot={{ fill: "#F59E0B", r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6 bg-gradient-card border-2 border-primary/20">
          <h3 className="text-lg font-semibold mb-4 text-foreground">{t('analytics.metrics')}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-blue-500/10 rounded-lg text-center">
              <p className="text-4xl font-bold text-blue-500">🚗 {vehicleCounts?.cars || 0}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('simulations.mappo.stats.cars')}</p>
            </div>
            <div className="p-4 bg-green-500/10 rounded-lg text-center">
              <p className="text-4xl font-bold text-green-500">🏍️ {vehicleCounts?.bikes || 0}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('simulations.mappo.stats.bikes')}</p>
            </div>
            <div className="p-4 bg-orange-500/10 rounded-lg text-center">
              <p className="text-4xl font-bold text-orange-500">🚛 {vehicleCounts?.trucks || 0}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('simulations.mappo.stats.trucks')}</p>
            </div>
            <div className="p-4 bg-purple-500/10 rounded-lg text-center">
              <p className="text-4xl font-bold text-purple-500">📊 {vehicleCounts?.total || 0}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('simulations.mappo.stats.total')}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6 bg-gradient-card border-2 border-primary/20">
        <h3 className="text-lg font-semibold mb-4 text-foreground">{t('analytics.summary')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-card/50 rounded-lg">
            <p className="text-sm text-muted-foreground">{t('analytics.accuracy')}</p>
            <p className="text-3xl font-bold text-success mt-2">{lstmAccuracy.toFixed(1)}%</p>
          </div>
          <div className="p-4 bg-card/50 rounded-lg">
            <p className="text-sm text-muted-foreground">{t('analytics.mae')}</p>
            <p className="text-3xl font-bold text-primary mt-2">{(forecastError * 0.1).toFixed(2)}</p>
          </div>
          <div className="p-4 bg-card/50 rounded-lg">
            <p className="text-sm text-muted-foreground">{t('analytics.error')}</p>
            <p className="text-3xl font-bold text-warning mt-2">±{forecastError.toFixed(1)}%</p>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Analytics;
