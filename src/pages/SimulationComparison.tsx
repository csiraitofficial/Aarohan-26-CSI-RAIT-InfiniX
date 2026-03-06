import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
    Play, Pause, RotateCcw, Zap, Clock,
    TrendingUp, TrendingDown, AlertTriangle,
    Car, ArrowLeft, ArrowRight, ArrowUp
} from "lucide-react";

import { API_CONFIG } from "@/lib/apiConfig";

const COMPARISON_API = API_CONFIG.COMPARISON;

interface SignalData {
    signal_id: string;
    lat: number;
    lon: number;
    queue: number;
    left_queue: number;
    right_queue: number;
    through_queue: number;
    overflow: number;
    current_phase: number;
    phase_name: string;
    allowed_movements: string[];
    green_time: number;
    in_yellow: boolean;
}

interface SimulationState {
    label: string;
    signals: SignalData[];
    metrics: {
        total_queue: number;
        left_queue: number;
        right_queue: number;
        through_queue: number;
        overflow: number;
    };
}

interface ComparisonData {
    step: number;
    mappo: SimulationState;
    fixed: SimulationState;
}

export default function SimulationComparison() {
    const [connected, setConnected] = useState(false);
    const [running, setRunning] = useState(false);
    const [step, setStep] = useState(0);
    const [speed, setSpeed] = useState(500);
    const [mappoState, setMappoState] = useState<SimulationState | null>(null);
    const [fixedState, setFixedState] = useState<SimulationState | null>(null);
    const [selectedSignal, setSelectedSignal] = useState<string | null>(null);
    const [network, setNetwork] = useState<any>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    // Load network on mount
    useEffect(() => {
        fetch(`${COMPARISON_API}/api/network`)
            .then(r => r.json())
            .then(d => setNetwork(d.network))
            .catch(console.error);
    }, []);

    const startSimulation = async () => {
        try {
            await fetch(`${COMPARISON_API}/api/start`, { method: "POST" });
            setRunning(true);
            startPolling();
        } catch (e) {
            console.error("Start failed:", e);
        }
    };

    const stopSimulation = async () => {
        try {
            await fetch(`${COMPARISON_API}/api/stop`, { method: "POST" });
            setRunning(false);
            stopPolling();
            setStep(0);
            setMappoState(null);
            setFixedState(null);
        } catch (e) {
            console.error("Stop failed:", e);
        }
    };

    const startPolling = () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(async () => {
            try {
                const resp = await fetch(`${COMPARISON_API}/api/step`);
                const data: ComparisonData = await resp.json();
                if (data.step) {
                    setStep(data.step);
                    setMappoState(data.mappo);
                    setFixedState(data.fixed);
                }
            } catch (e) {
                console.error("Step error:", e);
            }
        }, speed);
    };

    const stopPolling = () => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    };

    const toggleRunning = () => {
        if (running) {
            stopPolling();
            setRunning(false);
        } else {
            startPolling();
            setRunning(true);
        }
    };

    useEffect(() => {
        if (running && intervalRef.current) {
            stopPolling();
            startPolling();
        }
    }, [speed]);

    useEffect(() => {
        return () => stopPolling();
    }, []);

    const MetricCard = ({ label, mappoValue, fixedValue, icon: Icon, color }: {
        label: string;
        mappoValue: number;
        fixedValue: number;
        icon: any;
        color: string;
    }) => {
        const diff = fixedValue - mappoValue;
        const improvement = mappoValue > 0 ? ((diff / fixedValue) * 100).toFixed(1) : "0";
        const isBetter = diff > 0;

        return (
            <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Icon className={`w-5 h-5 ${color}`} />
                        <span className="text-sm text-slate-400">{label}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <div className="text-xs text-cyan-400 mb-1">MAPPO</div>
                            <div className="text-2xl font-bold text-white">{mappoValue}</div>
                        </div>
                        <div>
                            <div className="text-xs text-amber-400 mb-1">Fixed</div>
                            <div className="text-2xl font-bold text-white">{fixedValue}</div>
                        </div>
                    </div>
                    {mappoValue > 0 && (
                        <div className={`mt-2 text-xs flex items-center gap-1 ${isBetter ? 'text-green-400' : 'text-red-400'}`}>
                            {isBetter ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                            MAPPO {isBetter ? 'saves' : 'adds'} {Math.abs(diff)} ({Math.abs(parseFloat(improvement))}%)
                        </div>
                    )}
                </CardContent>
            </Card>
        );
    };

    const SignalTable = ({ signals, label, accentColor }: {
        signals: SignalData[];
        label: string;
        accentColor: string;
    }) => (
        <Card className="bg-slate-800/50 border-slate-700 h-full overflow-hidden">
            <CardHeader className="py-3 px-4">
                <CardTitle className={`text-sm ${accentColor}`}>{label} - Signal States</CardTitle>
            </CardHeader>
            <CardContent className="p-0 max-h-[300px] overflow-y-auto">
                <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-900">
                        <tr className="border-b border-slate-700">
                            <th className="p-2 text-left text-slate-400">Signal</th>
                            <th className="p-2 text-center text-slate-400">Queue</th>
                            <th className="p-2 text-center text-slate-400">L/R/T</th>
                            <th className="p-2 text-center text-slate-400">Phase</th>
                            <th className="p-2 text-center text-slate-400">Overflow</th>
                        </tr>
                    </thead>
                    <tbody>
                        {signals.map(sig => (
                            <tr
                                key={sig.signal_id}
                                className={`border-b border-slate-800 hover:bg-slate-700/50 cursor-pointer
                  ${selectedSignal === sig.signal_id ? 'bg-slate-700' : ''}`}
                                onClick={() => setSelectedSignal(sig.signal_id)}
                            >
                                <td className="p-2 font-medium text-white">{sig.signal_id}</td>
                                <td className="p-2 text-center">
                                    <Badge variant={sig.queue > 30 ? "destructive" : sig.queue > 15 ? "secondary" : "outline"}>
                                        {sig.queue}
                                    </Badge>
                                </td>
                                <td className="p-2 text-center text-slate-300">
                                    {sig.left_queue}/{sig.right_queue}/{sig.through_queue}
                                </td>
                                <td className="p-2 text-center">
                                    <Badge className={sig.in_yellow ? "bg-yellow-500" : "bg-green-500"}>
                                        {sig.phase_name?.slice(0, 6) || `P${sig.current_phase}`}
                                    </Badge>
                                </td>
                                <td className="p-2 text-center">
                                    {sig.overflow > 0 && (
                                        <Badge variant="destructive">{sig.overflow}</Badge>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </CardContent>
        </Card>
    );

    const NetworkTopology = ({ signals, label, accentColor }: {
        signals: SignalData[];
        label: string;
        accentColor: string;
    }) => {
        // Simple grid visualization
        const maxQueue = Math.max(...signals.map(s => s.queue), 1);

        return (
            <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader className="py-2 px-4">
                    <CardTitle className={`text-sm ${accentColor}`}>{label} - Network</CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                    <div className="grid grid-cols-5 gap-1">
                        {signals.slice(0, 15).map(sig => {
                            const intensity = sig.queue / maxQueue;
                            const bg = sig.overflow > 0
                                ? 'bg-red-500'
                                : intensity > 0.7
                                    ? 'bg-orange-500'
                                    : intensity > 0.3
                                        ? 'bg-yellow-500'
                                        : 'bg-green-500';

                            return (
                                <div
                                    key={sig.signal_id}
                                    className={`${bg} rounded p-1 text-center cursor-pointer hover:scale-105 transition-transform
                    ${selectedSignal === sig.signal_id ? 'ring-2 ring-white' : ''}`}
                                    onClick={() => setSelectedSignal(sig.signal_id)}
                                    title={`${sig.signal_id}: Queue=${sig.queue}, Overflow=${sig.overflow}`}
                                >
                                    <div className="text-[10px] font-bold text-white">{sig.signal_id.replace('S', '')}</div>
                                    <div className="text-[8px] text-white/80">{sig.queue}</div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
        );
    };

    const JunctionDetail = ({ mappoSignal, fixedSignal }: {
        mappoSignal?: SignalData;
        fixedSignal?: SignalData;
    }) => {
        if (!mappoSignal || !fixedSignal) {
            return (
                <Card className="bg-slate-800/50 border-slate-700">
                    <CardContent className="p-8 text-center text-slate-400">
                        <Car className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>Select a signal to view junction details</p>
                    </CardContent>
                </Card>
            );
        }

        const DetailColumn = ({ sig, label, accent }: { sig: SignalData; label: string; accent: string }) => (
            <div className="flex-1">
                <div className={`text-sm font-bold ${accent} mb-3`}>{label}</div>
                <div className="space-y-2">
                    <div className="flex justify-between">
                        <span className="text-slate-400 flex items-center gap-1">
                            <ArrowLeft className="w-3 h-3" /> Left
                        </span>
                        <span className="font-bold">{sig.left_queue}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-400 flex items-center gap-1">
                            <ArrowUp className="w-3 h-3" /> Through
                        </span>
                        <span className="font-bold">{sig.through_queue}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-400 flex items-center gap-1">
                            <ArrowRight className="w-3 h-3" /> Right
                        </span>
                        <span className="font-bold">{sig.right_queue}</span>
                    </div>
                    <div className="border-t border-slate-700 pt-2 mt-2">
                        <div className="flex justify-between">
                            <span className="text-slate-400">Total Queue</span>
                            <span className="font-bold text-lg">{sig.queue}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-400">Overflow</span>
                            <span className={`font-bold ${sig.overflow > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                {sig.overflow}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-400">Phase</span>
                            <Badge className={sig.in_yellow ? "bg-yellow-500" : "bg-green-500"}>
                                {sig.phase_name || `Phase ${sig.current_phase}`}
                            </Badge>
                        </div>
                    </div>
                </div>
            </div>
        );

        return (
            <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader className="py-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Zap className="w-5 h-5 text-yellow-400" />
                        Junction {selectedSignal} - Side by Side
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-6">
                        <DetailColumn sig={mappoSignal} label="MAPPO AI" accent="text-cyan-400" />
                        <div className="w-px bg-slate-700" />
                        <DetailColumn sig={fixedSignal} label="Fixed Logic" accent="text-amber-400" />
                    </div>
                </CardContent>
            </Card>
        );
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-amber-400 bg-clip-text text-transparent">
                        🔄 Real-time Simulation Comparison
                    </h1>
                    <p className="text-sm text-slate-400">MAPPO AI vs Fixed Logic (30s timing)</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-4 py-2">
                        <Clock className="w-4 h-4 text-slate-400" />
                        <span className="text-lg font-mono">Step: {step}</span>
                    </div>

                    <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-4 py-2">
                        <span className="text-xs text-slate-400">Speed:</span>
                        <Slider
                            value={[speed]}
                            onValueChange={(v) => setSpeed(v[0])}
                            min={100}
                            max={2000}
                            step={100}
                            className="w-24"
                        />
                        <span className="text-xs w-12">{speed}ms</span>
                    </div>

                    <Button
                        onClick={mappoState ? toggleRunning : startSimulation}
                        variant={running ? "destructive" : "default"}
                        className={running ? "" : "bg-gradient-to-r from-cyan-500 to-blue-500"}
                    >
                        {running ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                        {running ? "Pause" : (mappoState ? "Resume" : "Start")}
                    </Button>

                    <Button onClick={stopSimulation} variant="outline">
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Reset
                    </Button>
                </div>
            </div>

            {/* Metrics Comparison Bar */}
            {mappoState && fixedState && (
                <div className="grid grid-cols-4 gap-4 mb-4">
                    <MetricCard
                        label="Total Queue (Strength)"
                        mappoValue={mappoState.metrics.total_queue}
                        fixedValue={fixedState.metrics.total_queue}
                        icon={Car}
                        color="text-blue-400"
                    />
                    <MetricCard
                        label="Left Queue"
                        mappoValue={mappoState.metrics.left_queue}
                        fixedValue={fixedState.metrics.left_queue}
                        icon={ArrowLeft}
                        color="text-purple-400"
                    />
                    <MetricCard
                        label="Right Queue"
                        mappoValue={mappoState.metrics.right_queue}
                        fixedValue={fixedState.metrics.right_queue}
                        icon={ArrowRight}
                        color="text-pink-400"
                    />
                    <MetricCard
                        label="Overflow (Spillback)"
                        mappoValue={mappoState.metrics.overflow}
                        fixedValue={fixedState.metrics.overflow}
                        icon={AlertTriangle}
                        color="text-red-400"
                    />
                </div>
            )}

            {/* Split Screen */}
            <div className="grid grid-cols-2 gap-4">
                {/* Left: MAPPO */}
                <div className="space-y-4">
                    <div className="text-center">
                        <Badge className="bg-gradient-to-r from-cyan-500 to-blue-500 text-lg px-4 py-1">
                            🤖 MAPPO AI Control
                        </Badge>
                    </div>
                    {mappoState && (
                        <>
                            <NetworkTopology
                                signals={mappoState.signals}
                                label="MAPPO"
                                accentColor="text-cyan-400"
                            />
                            <SignalTable
                                signals={mappoState.signals}
                                label="MAPPO"
                                accentColor="text-cyan-400"
                            />
                        </>
                    )}
                    {!mappoState && (
                        <Card className="bg-slate-800/50 border-slate-700 h-64 flex items-center justify-center">
                            <div className="text-center text-slate-400">
                                <Zap className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                <p>Click Start to begin comparison</p>
                            </div>
                        </Card>
                    )}
                </div>

                {/* Right: Fixed */}
                <div className="space-y-4">
                    <div className="text-center">
                        <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-lg px-4 py-1">
                            ⏱️ Fixed Logic (30s)
                        </Badge>
                    </div>
                    {fixedState && (
                        <>
                            <NetworkTopology
                                signals={fixedState.signals}
                                label="Fixed"
                                accentColor="text-amber-400"
                            />
                            <SignalTable
                                signals={fixedState.signals}
                                label="Fixed"
                                accentColor="text-amber-400"
                            />
                        </>
                    )}
                    {!fixedState && (
                        <Card className="bg-slate-800/50 border-slate-700 h-64 flex items-center justify-center">
                            <div className="text-center text-slate-400">
                                <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                <p>Click Start to begin comparison</p>
                            </div>
                        </Card>
                    )}
                </div>
            </div>

            {/* Junction Detail */}
            <div className="mt-4">
                <JunctionDetail
                    mappoSignal={mappoState?.signals.find(s => s.signal_id === selectedSignal)}
                    fixedSignal={fixedState?.signals.find(s => s.signal_id === selectedSignal)}
                />
            </div>
        </div>
    );
}
