/**
 * Tier 1 Metro City Simulation Page
 * High traffic demand patterns with emergency scenario controls
 * 
 * Features:
 * - Emergency vehicle priority (ambulance/firetruck) with animated tracking
 * - Accident scenarios with vehicle collision visuals
 * - Rally/procession blocking with crowd animation
 * - Real-time metrics comparison (with vs without MAPPO)
 */

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import NetworkMap from '../components/simulation_new/NetworkMap'
import NetworkMapMapbox from '../components/simulation_new/NetworkMapMapbox'
import JunctionDetailView from '../components/simulation_new/JunctionDetailView'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Play, Square, AlertTriangle, Truck, Flag, Trash2, Building, Users, TrendingDown, Map, Grid3X3 } from "lucide-react";
import { toast } from "sonner";

import { API_CONFIG } from "@/lib/apiConfig";

const API_BASE = API_CONFIG.TIER1; // Dynamic - works on laptop and mobile

interface SignalState {
    signal_id: string
    phase: number
    n_phases: number
    allowed_movements: string[]
    approaches: string[]
    queues: { through: number; left: number; right: number; total: number }
    total_queue: number
    lat: number
    lon: number
    junction_type?: string
    spillback?: boolean
}

interface NetworkNode {
    signal_id: string
    lat: number
    lon: number
    junction_type?: string
    approaches?: string[]
    downstream_links: Array<{ signal: string }>
}

interface ScenarioStatus {
    active_emergencies: number
    blocked_junctions: string[]
}

// Event data from backend
interface EventData {
    blocked_signals: string[]
    red_signals: string[]
    green_corridor: string[]
    diversion_routes: string[]
    diversion_message: string | null
    emergency: {
        path: string[]
        position: number
        current_signal: string | null
        type: string
    } | null
    rally: {
        path: string[]
        position: number
        current_signal: string | null
    } | null
    accident_signals: string[]
    rally_signals: string[]
    metrics: {
        baseline_queue: number
        optimized_queue: number
        improvement_pct: number
    } | null
}

function transformSignals(apiSignals: any[], network: NetworkNode[]): SignalState[] {
    return apiSignals.map(s => {
        const netNode = network.find(n => n.signal_id === s.signal_id)
        const approaches = s.approaches || netNode?.approaches || ['N', 'E', 'S', 'W']
        const through = s.queues?.through ?? 0
        const left = s.queues?.left ?? 0
        const right = s.queues?.right ?? 0
        const total = s.queues?.total ?? (through + left + right)

        return {
            signal_id: s.signal_id,
            phase: s.phase_index ?? s.phase ?? 0,
            n_phases: s.n_phases ?? 4,
            allowed_movements: s.allowed_movements || [],
            approaches,
            queues: { through, left, right, total },
            total_queue: total,
            lat: s.lat ?? 0,
            lon: s.lon ?? 0,
            junction_type: s.junction_type ?? '4way',
            spillback: s.spillback ?? false,
        }
    })
}

export default function SimulationTier1() {
    const { t } = useTranslation();
    const [connected, setConnected] = useState(false)
    const [running, setRunning] = useState(false)
    const [network, setNetwork] = useState<NetworkNode[]>([])
    const [signals, setSignals] = useState<SignalState[]>([])
    const [step, setStep] = useState(0)
    const [selectedSignal, setSelectedSignal] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const [scenarios, setScenarios] = useState<ScenarioStatus>({ active_emergencies: 0, blocked_junctions: [] })
    const [emergencyPath, setEmergencyPath] = useState('')
    const [accidentSignals, setAccidentSignals] = useState('')
    const [rallySignals, setRallySignals] = useState('')

    // Event tracking state
    const [eventData, setEventData] = useState<EventData | null>(null)

    // Map view toggle: 'canvas' (schematic) or 'google' (real Mumbai map)
    const [mapView, setMapView] = useState<'canvas' | 'google'>('canvas')

    // LLM command state
    const [llmInput, setLlmInput] = useState('')
    const [llmResponse, setLlmResponse] = useState<{
        message: string
        action: string
        signals: string[]
        route_info?: { from: string; to: string; path: string[]; hops: number }
    } | null>(null)
    const [llmLoading, setLlmLoading] = useState(false)

    const pollRef = useRef<number | null>(null)
    const POLL_MS = 500

    const connect = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/network`)
            if (!res.ok) throw new Error('Failed to connect to Tier 1 Metro City server')
            const data = await res.json()
            setNetwork(data.network || [])
            setConnected(true)
            setError(null)

            // Check if simulation is already running using status endpoint
            try {
                const statusRes = await fetch(`${API_BASE}/api/sim/status`)
                if (statusRes.ok) {
                    const statusData = await statusRes.json()
                    if (statusData.running && statusData.step > 0) {
                        // Simulation is running, resume showing it
                        setRunning(true)
                        setStep(statusData.step)
                    }
                }
            } catch (e) {
                // Status check failed, that's fine
            }
        } catch (e: any) {
            setError(e.message)
            setConnected(false)
        }
    }, [])

    const start = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/sim/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ steps: 3600 })
            })
            if (res.ok) {
                setRunning(true)
                setError(null)
            }
        } catch (e: any) {
            setError(e.message)
        }
    }, [])

    const stop = useCallback(async () => {
        await fetch(`${API_BASE}/api/sim/stop`, { method: 'POST' }).catch(() => { })
        setRunning(false)
        setEventData(null)
    }, [])

    const poll = useCallback(async () => {
        if (!running) return
        try {
            const res = await fetch(`${API_BASE}/api/sim/step`)
            if (!res.ok) throw new Error('Step failed')
            const data = await res.json()
            setStep(data.step ?? 0)

            const signalsArray = Object.entries(data.signals || {}).map(([id, s]: [string, any]) => ({
                signal_id: id,
                ...s
            }))
            setSignals(transformSignals(signalsArray, network))

            // Handle event data from backend
            if (data.events) {
                setEventData(data.events)
                // Update scenarios for UI display
                setScenarios({
                    active_emergencies: data.events.emergency ? 1 : 0,
                    blocked_junctions: data.events.blocked_signals || []
                })
            }
        } catch (e: any) {
            setError(e.message)
            setRunning(false)
        }
    }, [running, network])

    const setEmergency = async () => {
        const path = emergencyPath.split(',').map(s => s.trim()).filter(Boolean)
        if (path.length < 2) {
            toast.error(t('simulations.tiers.scenarios.emergencyPathError', { defaultValue: 'Emergency path needs at least 2 signals (e.g., T1_S1, T1_S2, T1_S3)' }))
            return
        }
        try {
            const res = await fetch(`${API_BASE}/api/events/emergency`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path, vehicle_type: 'ambulance' })
            })
            if (!res.ok) {
                const err = await res.json()
                toast.error(err.detail || 'Failed to dispatch emergency')
                return
            }
            toast.success(`🚑 Ambulance dispatched on route: ${path.join(' → ')}`)
            // Auto-select first signal in path to show junction detail
            setSelectedSignal(path[0])
            setEmergencyPath('')
        } catch (e: any) {
            toast.error(e.message)
        }
    }

    const setAccident = async () => {
        const blocked = accidentSignals.split(',').map(s => s.trim()).filter(Boolean)
        if (blocked.length === 0) {
            toast.error(t('simulations.tiers.scenarios.enterSignalError', { defaultValue: 'Enter at least one signal ID (e.g., T1_S5)' }))
            return
        }
        try {
            const res = await fetch(`${API_BASE}/api/events/accident`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ blocked })
            })
            if (!res.ok) {
                const err = await res.json()
                toast.error(err.detail || 'Failed to report accident')
                return
            }
            toast.success(`🔥 Accident reported at: ${blocked.join(', ')}`)
            // Auto-select first blocked signal to show junction detail
            setSelectedSignal(blocked[0])
            setAccidentSignals('')
        } catch (e: any) {
            toast.error(e.message)
        }
    }

    const setRally = async () => {
        const blocked = rallySignals.split(',').map(s => s.trim()).filter(Boolean)
        if (blocked.length === 0) {
            toast.error(t('simulations.tiers.scenarios.enterSignalError', { defaultValue: 'Enter at least one signal ID (e.g., T1_S3, T1_S4)' }))
            return
        }
        try {
            const res = await fetch(`${API_BASE}/api/events/rally`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ blocked })
            })
            if (!res.ok) {
                const err = await res.json()
                toast.error(err.detail || 'Failed to start rally')
                return
            }
            toast.success(`🚶 Rally/procession started at: ${blocked.join(', ')}`)
            // Auto-select first blocked signal to show junction detail
            setSelectedSignal(blocked[0])
            setRallySignals('')
        } catch (e: any) {
            toast.error(e.message)
        }
    }

    const clearEvents = async () => {
        await fetch(`${API_BASE}/api/events/clear`, { method: 'POST' })
        setScenarios({ active_emergencies: 0, blocked_junctions: [] })
        setEventData(null)
        setLlmResponse(null)
        toast.info('All events cleared')
    }

    // LLM command processing
    const sendLLMCommand = async (commandOverride?: string) => {
        const cmdToExec = commandOverride || llmInput;
        if (!cmdToExec.trim()) {
            toast.error('Please enter a command')
            return
        }
        setLlmLoading(true)
        setLlmResponse(null)
        try {
            const res = await fetch(`${API_BASE}/api/llm/parse-command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: cmdToExec })
            })
            const data = await res.json()
            if (!res.ok) {
                toast.error(data.detail || 'Failed to process command')
                return
            }
            setLlmResponse(data)
            toast.success(data.message)
            // Auto-select first signal to show junction detail
            if (data.signals?.length > 0) {
                setSelectedSignal(data.signals[0])
            }
            if (!commandOverride) {
                setLlmInput('')
            }
        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setLlmLoading(false)
        }
    }

    useEffect(() => {
        if (running) {
            const interval = window.setInterval(poll, POLL_MS)
            pollRef.current = interval
            return () => clearInterval(interval)
        }
    }, [running, poll])

    useEffect(() => { connect() }, [connect])

    // Listen for global voice commands
    useEffect(() => {
        const handleVoiceCommand = (e: Event) => {
            const customEvent = e as CustomEvent<string>;
            // Prevent the global VoiceCommandAssistant from navigating away if we handle it
            e.preventDefault();

            const command = customEvent.detail.toLowerCase();

            // Fast-path for clear commands
            if (command.includes("clear") && (command.includes("all") || command.includes("road") || command.includes("corridor") || command.includes("accident"))) {
                clearEvents();
                toast.success("All scenarios cleared via voice command", { icon: "🧹" });
                return;
            }

            setLlmInput(command);

            // Execute it using the existing function (wrapped in a small timeout to let state settle)
            setTimeout(() => {
                sendLLMCommand(command);
            }, 100);
        };

        window.addEventListener("voice-command-llm", handleVoiceCommand);
        return () => window.removeEventListener("voice-command-llm", handleVoiceCommand);
    }, []);

    const selected = signals.find(s => s.signal_id === selectedSignal)
    const totalQ = signals.reduce((sum, s) => sum + s.total_queue, 0)

    return (
        <div className="space-y-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Building className="h-8 w-8 text-blue-500" />
                    <div>
                        <h1 className="text-2xl font-bold">{t('simulations.tiers.level1Title')}</h1>
                        <p className="text-muted-foreground">{t('simulations.tiers.level1Desc')}</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <Badge variant={connected ? "default" : "destructive"}>
                        {connected ? `● ${t('simulations.mappo.connected')}` : `○ ${t('simulations.mappo.disconnected')}`}
                    </Badge>
                    <span className="text-sm text-gray-600">{t('simulations.mappo.step')}: <span className="font-bold text-green-600 text-lg">{step}</span></span>
                    {!running ? (
                        <Button onClick={start} disabled={!connected} className="flex items-center gap-2">
                            <Play className="h-4 w-4" /> {t('simulations.mappo.start')}
                        </Button>
                    ) : (
                        <Button onClick={stop} variant="destructive" className="flex items-center gap-2">
                            <Square className="h-4 w-4" /> {t('simulations.mappo.stop')}
                        </Button>
                    )}
                </div>
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg mb-4">{error}</div>}

            {/* Scenario Controls */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        🎬 {t('simulations.tiers.scenarios.title')}
                        {scenarios.active_emergencies > 0 && (
                            <Badge variant="destructive" className="animate-pulse">
                                🚨 {t('simulations.tiers.scenarios.activeEmergency', { count: scenarios.active_emergencies })}
                            </Badge>
                        )}
                        {scenarios.blocked_junctions.length > 0 && (
                            <Badge variant="secondary">
                                ⚠️ {t('simulations.tiers.scenarios.blockedJunctions', { count: scenarios.blocked_junctions.length })}
                            </Badge>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-red-50 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <Truck className="w-5 h-5 text-red-600" />
                                <span className="font-medium text-red-800">{t('simulations.tiers.scenarios.emergency')}</span>
                            </div>
                            <Input type="text" value={emergencyPath} onChange={(e) => setEmergencyPath(e.target.value)}
                                placeholder="S1, S2, S3" className="mb-2" />
                            <Button onClick={setEmergency} className="w-full bg-red-600 text-white py-2 rounded hover:bg-red-500 text-sm font-medium">
                                🚑 {t('simulations.tiers.scenarios.dispatch')}
                            </Button>
                        </div>
                        <div className="bg-orange-50 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <AlertTriangle className="w-5 h-5 text-orange-600" />
                                <span className="font-medium text-orange-800">{t('simulations.tiers.scenarios.accident')}</span>
                            </div>
                            <input type="text" value={accidentSignals} onChange={(e) => setAccidentSignals(e.target.value)}
                                placeholder="S5" className="w-full px-3 py-2 border rounded mb-2 text-sm" />
                            <button onClick={setAccident} className="w-full bg-orange-600 text-white py-2 rounded hover:bg-orange-500 text-sm font-medium">
                                ⚠️ {t('simulations.tiers.scenarios.report')}
                            </button>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <Users className="w-5 h-5 text-purple-600" />
                                <span className="font-medium text-purple-800">{t('simulations.tiers.scenarios.rally')}</span>
                            </div>
                            <input type="text" value={rallySignals} onChange={(e) => setRallySignals(e.target.value)}
                                placeholder="S3, S4" className="w-full px-3 py-2 border rounded mb-2 text-sm" />
                            <button onClick={setRally} className="w-full bg-purple-600 text-white py-2 rounded hover:bg-purple-500 text-sm font-medium">
                                🚩 {t('simulations.tiers.scenarios.start')}
                            </button>
                        </div>
                    </div>
                    {(scenarios.active_emergencies > 0 || scenarios.blocked_junctions.length > 0 || llmResponse) && (
                        <button onClick={clearEvents} className="mt-3 flex items-center gap-2 text-gray-600 hover:text-red-600 text-sm">
                            <Trash2 className="w-4 h-4" /> {t('simulations.tiers.scenarios.clearAll')}
                        </button>
                    )}
                </CardContent>
            </Card>

            {/* AI Assistant - Natural Language Input */}
            <Card className="border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <span className="text-2xl">🤖</span>
                        {t('simulations.tiers.aiController.title')}
                        <Badge variant="outline" className="bg-blue-100">Gemini Powered</Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-2 mb-3">
                        <Input
                            value={llmInput}
                            onChange={(e) => setLlmInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && !llmLoading && sendLLMCommand()}
                            placeholder={t('simulations.tiers.aiController.placeholder')}
                            className="flex-1"
                            disabled={llmLoading}
                        />
                        <Button onClick={() => sendLLMCommand()} disabled={llmLoading} className="bg-blue-600 hover:bg-blue-700">
                            {llmLoading ? '...' : t('simulations.tiers.aiController.send')}
                        </Button>
                    </div>
                    <div className="text-xs text-gray-500 mb-3">
                        <strong>{t('simulations.tiers.aiController.examples')}:</strong> "Green corridor from S1 to S20" | "Accident at signal 5" | "Rally from S3 to S12" | "Ambulance at S1, S2, S3"
                    </div>

                    {/* LLM Response */}
                    {llmResponse && (
                        <div className="bg-white rounded-lg p-4 border border-blue-200">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <Badge className={
                                        llmResponse.action === 'emergency' ? 'bg-red-500' :
                                            llmResponse.action === 'accident' ? 'bg-orange-500' :
                                                'bg-purple-500'
                                    }>
                                        {llmResponse.action === 'emergency' ? '🚑 Emergency' :
                                            llmResponse.action === 'accident' ? '🔥 Accident' :
                                                '🚶 Rally'}
                                    </Badge>
                                    <span className="font-medium text-gray-700">{llmResponse.message}</span>
                                </div>
                            </div>

                            {llmResponse.route_info && (
                                <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-green-700 font-medium">🛤️ {t('simulations.tiers.aiController.optimizedRoute')}</span>
                                        <Badge variant="secondary" className="bg-green-200 text-green-800">
                                            {t('simulations.tiers.aiController.hops', { count: llmResponse.route_info.hops })}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-1 flex-wrap">
                                        {llmResponse.route_info.path.map((sig, i) => (
                                            <span key={sig} className="flex items-center">
                                                <Badge variant="outline" className="bg-white">{sig}</Badge>
                                                {i < llmResponse.route_info!.path.length - 1 && (
                                                    <span className="mx-1 text-green-600">→</span>
                                                )}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {!llmResponse.route_info && llmResponse.signals?.length > 0 && (
                                <div className="mt-2 flex items-center gap-2">
                                    <span className="text-sm text-gray-600">Signals:</span>
                                    <div className="flex gap-1">
                                        {llmResponse.signals.map(sig => (
                                            <Badge key={sig} variant="secondary">{sig}</Badge>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="bg-white rounded-lg shadow-sm p-4 text-center">
                    <div className="text-4xl font-bold text-green-600">{step}</div>
                    <div className="text-gray-500 text-sm">{t('simulations.mappo.step')}</div>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4 text-center">
                    <div className="text-4xl font-bold text-emerald-600">{Math.round(totalQ)}</div>
                    <div className="text-gray-500 text-sm">{t('simulations.mappo.stats.totalQueue')}</div>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4 text-center">
                    <div className="text-4xl font-bold text-yellow-600">{signals.filter(s => s.spillback).length}</div>
                    <div className="text-gray-500 text-sm">{t('simulations.mappo.stats.spillbackSignals')}</div>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4 text-center">
                    <div className="text-4xl font-bold text-teal-600">{signals.length}</div>
                    <div className="text-gray-500 text-sm">{t('simulations.mappo.stats.activeSignals')}</div>
                </div>
            </div>

            {/* Real-time Metrics Panel - Shows during active events */}
            {eventData?.metrics && (
                <Card className="mb-4 border-2 border-green-200 bg-gradient-to-r from-green-50 to-emerald-50">
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <TrendingDown className="h-5 w-5 text-green-600" />
                            {t('simulations.tiers.metrics.title')}
                            <Badge variant="outline" className="ml-2 animate-pulse">LIVE</Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-4 gap-4">
                            <div className="bg-white rounded-lg p-4 shadow-sm text-center">
                                <div className="text-3xl font-bold text-gray-500">{eventData.metrics.baseline_queue}</div>
                                <div className="text-sm text-gray-600">{t('simulations.tiers.metrics.baseline')}</div>
                                <div className="text-xs text-gray-400">{t('simulations.tiers.metrics.withoutMappo')}</div>
                            </div>
                            <div className="bg-white rounded-lg p-4 shadow-sm text-center">
                                <div className="text-3xl font-bold text-green-600">{eventData.metrics.optimized_queue}</div>
                                <div className="text-sm text-gray-600">{t('simulations.tiers.metrics.optimized')}</div>
                                <div className="text-xs text-gray-400">{t('simulations.tiers.metrics.withMappo')}</div>
                            </div>
                            <div className="bg-white rounded-lg p-4 shadow-sm text-center">
                                <div className="text-3xl font-bold text-emerald-600">
                                    {eventData.metrics.improvement_pct > 0 ? '+' : ''}{eventData.metrics.improvement_pct}%
                                </div>
                                <div className="text-sm text-gray-600">{t('simulations.tiers.metrics.improvement')}</div>
                                <div className="text-xs text-green-500">↓ {t('simulations.tiers.metrics.lessCongestion')}</div>
                            </div>
                            <div className="bg-white rounded-lg p-4 shadow-sm">
                                <div className="text-sm font-medium text-gray-700 mb-2">{t('simulations.tiers.metrics.activeEvents')}</div>
                                {eventData.emergency && (
                                    <div className="flex items-center gap-2 text-red-600 text-sm mb-1">
                                        🚑 {t('simulations.tiers.metrics.ambulanceAt', { signal: eventData.emergency.current_signal })}
                                    </div>
                                )}
                                {eventData.accident_signals.length > 0 && (
                                    <div className="flex items-center gap-2 text-orange-600 text-sm mb-1">
                                        🔥 {t('simulations.tiers.metrics.accidentAt', { signals: eventData.accident_signals.join(', ') })}
                                    </div>
                                )}
                                {eventData.rally?.current_signal && (
                                    <div className="flex items-center gap-2 text-purple-600 text-sm mb-1">
                                        🚶 {t('simulations.tiers.metrics.processionAt', { signal: eventData.rally.current_signal })}
                                    </div>
                                )}
                                {!eventData.rally?.current_signal && eventData.rally_signals.length > 0 && (
                                    <div className="flex items-center gap-2 text-purple-600 text-sm">
                                        🚶 {t('simulations.tiers.metrics.rallyAt', { signals: eventData.rally_signals.join(', ') })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Diversion Routes */}
                        {eventData.diversion_message && (
                            <div className="mt-4 p-3 bg-yellow-100 border border-yellow-300 rounded-lg">
                                <div className="flex items-center gap-2">
                                    <span className="text-yellow-700">🚧</span>
                                    <span className="text-yellow-800 font-medium">{eventData.diversion_message}</span>
                                </div>
                                {eventData.diversion_routes && eventData.diversion_routes.length > 0 && (
                                    <div className="mt-2 flex items-center gap-2 text-sm text-yellow-700">
                                        <span>{t('simulations.tiers.metrics.alternativeRoute')}</span>
                                        <div className="flex gap-1">
                                            {eventData.diversion_routes.map((sig, i) => (
                                                <Badge key={sig} variant="secondary" className="bg-yellow-200">{sig}</Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Green Corridor */}
                        {eventData.green_corridor && eventData.green_corridor.length > 0 && (
                            <div className="mt-4 p-3 bg-green-100 border border-green-300 rounded-lg">
                                <div className="flex items-center gap-2">
                                    <span className="text-green-700">🟢</span>
                                    <span className="text-green-800 font-medium">{t('simulations.tiers.metrics.greenCorridorActive')}</span>
                                </div>
                                <div className="mt-2 flex items-center gap-2 text-sm text-green-700">
                                    <span>{t('simulations.tiers.metrics.clearedSignals')}</span>
                                    <div className="flex gap-1">
                                        {eventData.green_corridor.map((sig, i) => (
                                            <Badge key={sig} variant="secondary" className="bg-green-200">{sig}</Badge>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Red Signals */}
                        {eventData.red_signals && eventData.red_signals.length > 0 && (
                            <div className="mt-4 p-3 bg-red-100 border border-red-300 rounded-lg">
                                <div className="flex items-center gap-2">
                                    <span className="text-red-700">🔴</span>
                                    <span className="text-red-800 font-medium">{t('simulations.tiers.metrics.forcedRed')}</span>
                                </div>
                                <div className="mt-2 flex items-center gap-2 text-sm text-red-700">
                                    <div className="flex gap-1 flex-wrap">
                                        {eventData.red_signals.map((sig, i) => (
                                            <Badge key={sig} variant="destructive" className="text-xs">{sig}</Badge>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Network Map */}
            <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-semibold text-gray-800">{t('simulations.mappo.networkTopology')}</h2>
                    <div className="flex gap-2">
                        <Button
                            variant={mapView === 'canvas' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setMapView('canvas')}
                        >
                            <Grid3X3 className="w-4 h-4 mr-1" /> Schematic
                        </Button>
                        <Button
                            variant={mapView === 'google' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setMapView('google')}
                        >
                            <Map className="w-4 h-4 mr-1" /> Mumbai Map
                        </Button>
                    </div>
                </div>
                <div className="h-[600px]">
                    {mapView === 'google' ? (
                        <NetworkMapMapbox
                            network={network}
                            signals={signals}
                            selectedSignal={selectedSignal}
                            onSelectSignal={setSelectedSignal}
                            eventData={eventData}
                        />
                    ) : (
                        <NetworkMap
                            network={network}
                            signals={signals}
                            selectedSignal={selectedSignal}
                            onSelectSignal={setSelectedSignal}
                            eventData={eventData}
                        />
                    )}
                </div>
            </div>

            {/* Signal Table */}
            <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
                <h2 className="text-lg font-semibold text-gray-800 mb-1">{t('simulations.mappo.signalStates')}</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-gray-600 border-b">
                                <th className="text-left p-3">{t('simulations.mappo.table.signal')}</th>
                                <th className="text-left p-3">{t('simulations.mappo.table.type')}</th>
                                <th className="text-left p-3">{t('simulations.mappo.table.phase')}</th>
                                <th className="text-right p-3">{t('simulations.mappo.table.throughQ')}</th>
                                <th className="text-right p-3">{t('simulations.mappo.table.leftQ')}</th>
                                <th className="text-right p-3">{t('simulations.mappo.table.rightQ')}</th>
                                <th className="text-right p-3">{t('simulations.mappo.table.totalQ')}</th>
                                <th className="text-center p-3">{t('status.status')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {signals.map(s => {
                                const isBlocked = scenarios.blocked_junctions.includes(s.signal_id)
                                const jt = s.junction_type?.toLowerCase() || ''
                                const jType = jt.includes('6way') || jt === '6-way' ? '6-way'
                                    : jt.includes('5way') || jt === '5-way' ? '5-way'
                                        : jt.includes('t/y') || jt === 't/y' || jt.startsWith('t-') || jt.startsWith('y-') ? 'T/Y'
                                            : '4-way'
                                const jColor = jType === '6-way' ? 'text-purple-600 font-medium' : jType === '5-way' ? 'text-teal-600 font-medium' : ''
                                return (
                                    <tr key={s.signal_id} onClick={() => setSelectedSignal(s.signal_id)}
                                        className={`border-b hover:bg-green-50 cursor-pointer ${s.signal_id === selectedSignal ? 'bg-green-100' : ''} ${isBlocked ? 'bg-red-50' : ''}`}>
                                        <td className="p-3 font-medium">{s.signal_id}</td>
                                        <td className={`p-3 ${jColor}`}>{jType}</td>
                                        <td className="p-3">P{s.phase}</td>
                                        <td className="p-3 text-right">{s.queues.through.toFixed(1)}</td>
                                        <td className="p-3 text-right">{s.queues.left.toFixed(1)}</td>
                                        <td className="p-3 text-right">{s.queues.right.toFixed(1)}</td>
                                        <td className="p-3 text-right font-semibold">{s.total_queue.toFixed(1)}</td>
                                        <td className="p-3 text-center">
                                            {isBlocked ? '🚧' : s.spillback ? '⚠️' : '✓'}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Junction Detail */}
            <div className="bg-white rounded-lg shadow-sm p-4">
                <h2 className="text-lg font-semibold text-gray-800 mb-3">{t('simulations.mappo.junctionDetail')}</h2>
                {selected ? (
                    <div className="flex justify-center">
                        <div className="w-full max-w-4xl">
                            <JunctionDetailView
                                signal={selected}
                                onClose={() => setSelectedSignal(null)}
                                eventData={eventData}
                                network={network}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="h-[250px] flex items-center justify-center text-gray-400">
                        <p>🚦 {t('simulations.mappo.junctionPlaceholder')}</p>
                    </div>
                )}
            </div>
        </div>
    )
}