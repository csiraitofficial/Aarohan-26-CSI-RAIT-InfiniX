/**
 * MAPPO Simulation Page - Works with VehicleDash Backend
 * Now with TOGGLE for Traffic Optimization Mode (SCOOT-based fallback)
 *
 * MAPPO Mode: Uses backend MAPPO RL model for signal control
 * Optimization Mode: Uses local SCOOT/density-based algorithm
 */

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import NetworkMap from '../components/simulation_new/NetworkMap'
import JunctionDetailView from '../components/simulation_new/JunctionDetailView'

import { calculateAllowedMovements, simulateQueueDynamics, SignalQueues } from '../../traffic-optimization'
import {
    getSimulationState,
    setSimulationState,
    subscribeSimulation,
    setPollInterval,
    getPollInterval,
    synthesizeVehicleCounts,
    pushVehicleCounts
} from '@/lib/simulationStore'

import { API_CONFIG } from "@/lib/apiConfig";

const SIM_SERVER = API_CONFIG.SIMULATION;

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

export default function SimulationNew() {
    const { t } = useTranslation();
    // Sync with global store for persistence (initial values from store)
    const globalState = getSimulationState()
    const [connected, setConnected] = useState(globalState.connected)
    const [running, setRunning] = useState(globalState.running)
    const [network, setNetwork] = useState<NetworkNode[]>([])
    const [signals, setSignals] = useState<SignalState[]>([])
    const [step, setStep] = useState(globalState.step)
    const [selectedSignal, setSelectedSignal] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    // Toggle for MAPPO vs Optimization mode
    const [useOptimizationMode, setUseOptimizationMode] = useState(globalState.useOptimizationMode)

    // Queue state for optimization mode (per signal)
    const queuesRef = useRef<Map<string, SignalQueues>>(new Map())

    const pollRef = useRef<number | null>(null)
    const POLL_MS = 500

    const connect = useCallback(async () => {
        try {
            const res = await fetch(`${SIM_SERVER}/api/sim/network`)
            if (!res.ok) throw new Error('Failed to connect')
            const data = await res.json()
            setNetwork(data.network || [])
            setConnected(true)
            setError(null)

            // Initialize queues for optimization mode
            const queueMap = new Map<string, SignalQueues>()
                ; (data.network || []).forEach((node: NetworkNode) => {
                    queueMap.set(node.signal_id, {
                        through: 10 + Math.random() * 20,
                        left: 5 + Math.random() * 10,
                        right: 3 + Math.random() * 8
                    })
                })
            queuesRef.current = queueMap
        } catch (e: any) {
            setError(e.message)
            setConnected(false)
        }
    }, [])

    const start = useCallback(async () => {
        if (useOptimizationMode) {
            // Optimization mode doesn't need backend
            setRunning(true)
            setError(null)
            setStep(0)
        } else {
            // MAPPO mode - start backend
            try {
                const res = await fetch(`${SIM_SERVER}/api/sim/start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ steps: 3600, base_demand: 0.5 })
                })
                if (res.ok) {
                    setRunning(true)
                    setError(null)
                }
            } catch (e: any) {
                setError(e.message)
            }
        }
    }, [useOptimizationMode])

    const stop = useCallback(async () => {
        if (!useOptimizationMode) {
            await fetch(`${SIM_SERVER}/api/sim/stop`, { method: 'POST' }).catch(() => { })
        }
        setRunning(false)
    }, [useOptimizationMode])

    // MAPPO mode polling
    const pollMAPPO = useCallback(async () => {
        if (!running || useOptimizationMode) return
        try {
            const res = await fetch(`${SIM_SERVER}/api/sim/step`)
            if (!res.ok) throw new Error('Step failed')
            const data = await res.json()
            setStep(data.t ?? 0)
            const newSignals = transformSignals(data.signals || [], network)
            setSignals(newSignals)

            // Push to store for Analytics
            const counts = synthesizeVehicleCounts(data.signals || [])
            pushVehicleCounts(counts)
        } catch (e: any) {
            setError(e.message)
            setRunning(false)
        }
    }, [running, network, useOptimizationMode])

    // Optimization mode step
    const runOptimizationStep = useCallback(() => {
        if (!running || !useOptimizationMode) return

        setStep(prev => prev + 1)

        const newSignals: SignalState[] = network.map(node => {
            const approaches = node.approaches || ['N', 'E', 'S', 'W']
            const currentQueues = queuesRef.current.get(node.signal_id) || { through: 10, left: 5, right: 3 }

            // Calculate allowed movements using SCOOT-style optimization  
            const result = calculateAllowedMovements(currentQueues, approaches, 0, step)

            // Simulate queue changes
            const newQueues = simulateQueueDynamics(currentQueues, result.allowedMovements, approaches)
            queuesRef.current.set(node.signal_id, newQueues)

            return {
                signal_id: node.signal_id,
                phase: result.nextPhase,
                n_phases: 6,
                allowed_movements: result.allowedMovements,
                approaches,
                queues: {
                    through: newQueues.through,
                    left: newQueues.left,
                    right: newQueues.right,
                    total: newQueues.through + newQueues.left + newQueues.right
                },
                total_queue: newQueues.through + newQueues.left + newQueues.right,
                lat: node.lat,
                lon: node.lon,
                junction_type: node.junction_type || '4way',
                spillback: (newQueues.through + newQueues.left + newQueues.right) > 80
            }
        })

        setSignals(newSignals)

        // Push to store for Analytics
        // For local optimization mode, we synthesize from our local state
        const counts = synthesizeVehicleCounts(newSignals)
        pushVehicleCounts(counts)
    }, [running, useOptimizationMode, network, step])

    // Sync local state to global store for persistence
    useEffect(() => {
        setSimulationState({ running, step, connected, useOptimizationMode });
    }, [running, step, connected, useOptimizationMode]);

    // Polling effect - uses either MAPPO or Optimization
    // Uses global poll interval so it persists across page navigation
    useEffect(() => {
        if (running) {
            // Clear any existing interval
            setPollInterval(null);

            // Start new interval
            const interval = window.setInterval(
                useOptimizationMode ? runOptimizationStep : pollMAPPO,
                POLL_MS
            );
            setPollInterval(interval);
            pollRef.current = interval;
        } else {
            // Only clear when explicitly stopped
            setPollInterval(null);
            pollRef.current = null;
        }

        // Don't cleanup on unmount - let interval persist for background polling
        // It will be cleared when user clicks Stop
    }, [running, useOptimizationMode, pollMAPPO, runOptimizationStep])


    useEffect(() => { connect() }, [connect])


    const selected = signals.find(s => s.signal_id === selectedSignal)
    const totalQ = signals.reduce((sum, s) => sum + s.total_queue, 0)

    return (
        <div className="min-h-screen bg-gray-100 p-4">
            <div className="max-w-[1600px] mx-auto">
                {/* Header */}
                <div className="bg-white rounded-lg shadow-sm p-4 mb-4 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">
                            🚦 {useOptimizationMode ? t('simulations.mappo.standaloneTitle') : t('simulations.mappo.title')}
                        </h1>
                        <p className="text-gray-500 text-sm">
                            {useOptimizationMode
                                ? t('simulations.mappo.standaloneDescription')
                                : t('simulations.mappo.description')}
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Mode Toggle */}
                        <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
                            <span className={`text-sm font-medium ${!useOptimizationMode ? 'text-blue-700' : 'text-gray-400'}`}>{t('simulations.mappo.mappoMode')}</span>
                            <button
                                onClick={() => { setUseOptimizationMode(!useOptimizationMode); setRunning(false); }}
                                disabled={running}
                                className={`relative w-12 h-6 rounded-full transition-colors ${useOptimizationMode ? 'bg-purple-600' : 'bg-blue-600'
                                    } ${running ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                                <div className={`absolute w-5 h-5 bg-white rounded-full top-0.5 transition-transform ${useOptimizationMode ? 'translate-x-6' : 'translate-x-0.5'
                                    }`} />
                            </button>
                            <span className={`text-sm font-medium ${useOptimizationMode ? 'text-purple-700' : 'text-gray-400'}`}>{t('simulations.mappo.optimMode')}</span>
                        </div>

                        {/* Connection status - only show for MAPPO mode */}
                        {!useOptimizationMode && (
                            <span className={`text-sm px-3 py-1 rounded-full font-medium ${connected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {connected ? `● ${t('simulations.mappo.connected')}` : `○ ${t('simulations.mappo.disconnected')}`}
                            </span>
                        )}
                        {useOptimizationMode && (
                            <span className="text-sm px-3 py-1 rounded-full font-medium bg-purple-100 text-purple-700">
                                ● {t('simulations.mappo.standalone')}
                            </span>
                        )}

                        <span className="text-sm text-gray-600">{t('simulations.mappo.step')}: <span className="font-bold text-blue-600 text-lg">{step}</span></span>
                        {!running ? (
                            <button onClick={start} disabled={!useOptimizationMode && !connected} className="px-5 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-400 text-white rounded-lg font-medium transition">▶ {t('simulations.mappo.start')}</button>
                        ) : (
                            <button onClick={stop} className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition">⏹ {t('simulations.mappo.stop')}</button>
                        )}
                    </div>
                </div>


                {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg mb-4">{error}</div>}

                {/* Stats */}
                <div className="grid grid-cols-4 gap-4 mb-4">
                    <div className="bg-white rounded-lg shadow-sm p-4 text-center">
                        <div className="text-4xl font-bold text-blue-600">{step}</div>
                        <div className="text-gray-500 text-sm">{t('simulations.mappo.stats.simulationStep')}</div>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm p-4 text-center">
                        <div className="text-4xl font-bold text-green-600">{Math.round(totalQ)}</div>
                        <div className="text-gray-500 text-sm">{t('simulations.mappo.stats.totalQueue')}</div>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm p-4 text-center">
                        <div className="text-4xl font-bold text-yellow-600">{signals.filter(s => s.spillback).length}</div>
                        <div className="text-gray-500 text-sm">{t('simulations.mappo.stats.spillbackSignals')}</div>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm p-4 text-center">
                        <div className="text-4xl font-bold text-purple-600">{signals.length}</div>
                        <div className="text-gray-500 text-sm">{t('simulations.mappo.stats.activeSignals')}</div>
                    </div>
                </div>

                {/* Network Map - FULL WIDTH, LARGER */}
                <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
                    <h2 className="text-lg font-semibold text-gray-800 mb-3">{t('simulations.mappo.networkTopology')}</h2>
                    <div className="h-[700px]">
                        <NetworkMap network={network} signals={signals} selectedSignal={selectedSignal} onSelectSignal={setSelectedSignal} />
                    </div>
                </div>

                {/* Signal States Table */}
                <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
                    <h2 className="text-lg font-semibold text-gray-800 mb-1">{t('simulations.mappo.signalStates')}</h2>
                    <p className="text-gray-500 text-sm mb-3">{t('simulations.mappo.signalStatesDesc')}</p>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-gray-600 border-b border-gray-200">
                                    <th className="text-left p-3 font-semibold">{t('simulations.mappo.table.signal')}</th>
                                    <th className="text-left p-3 font-semibold">{t('simulations.mappo.table.type')}</th>
                                    <th className="text-left p-3 font-semibold">{t('simulations.mappo.table.phase')}</th>
                                    <th className="text-left p-3 font-semibold">{t('simulations.mappo.table.movements')}</th>
                                    <th className="text-right p-3 font-semibold">{t('simulations.mappo.table.throughQ')}</th>
                                    <th className="text-right p-3 font-semibold">{t('simulations.mappo.table.leftQ')}</th>
                                    <th className="text-right p-3 font-semibold">{t('simulations.mappo.table.rightQ')}</th>
                                    <th className="text-right p-3 font-semibold">{t('simulations.mappo.table.totalQ')}</th>
                                    <th className="text-center p-3 font-semibold">{t('simulations.mappo.table.spillback')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {signals.map(s => {
                                    const isEntry = ['S1', 'S13', 'S14', 'S15'].includes(s.signal_id)
                                    const jt = s.junction_type?.toLowerCase() || ''
                                    const jType = jt.includes('6way') ? '6-way' : jt.includes('5way') ? '5-way' : jt.includes('t/y') ? 'T/Y' : '4-way'

                                    return (
                                        <tr
                                            key={s.signal_id}
                                            onClick={() => setSelectedSignal(s.signal_id)}
                                            className={`border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition ${s.signal_id === selectedSignal ? 'bg-blue-100' : ''}`}
                                        >
                                            <td className={`p-3 font-medium ${isEntry ? 'text-green-600' : 'text-gray-800'}`}>
                                                {s.signal_id}
                                            </td>
                                            <td className="p-3 text-gray-600">{jType}</td>
                                            <td className="p-3 text-gray-600">P{s.phase}/{s.n_phases}</td>
                                            <td className="p-3 text-gray-600 text-xs">
                                                {s.allowed_movements.length > 0 ? s.allowed_movements.join(', ') : '-'}
                                            </td>
                                            <td className="p-3 text-right text-gray-700">{s.queues.through.toFixed(1)}</td>
                                            <td className="p-3 text-right text-gray-700">{s.queues.left.toFixed(1)}</td>
                                            <td className="p-3 text-right text-gray-700">{s.queues.right.toFixed(1)}</td>
                                            <td className={`p-3 text-right font-semibold ${s.total_queue > 50 ? 'text-red-600' : s.total_queue > 20 ? 'text-orange-600' : 'text-green-600'}`}>
                                                {s.total_queue.toFixed(1)}
                                            </td>
                                            <td className={`p-3 text-center ${s.spillback ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
                                                {s.spillback ? t('simulations.mappo.table.yes') : t('simulations.mappo.table.no')}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Junction Detail - BELOW TABLE, LARGER */}
                <div className="bg-white rounded-lg shadow-sm p-4">
                    <h2 className="text-lg font-semibold text-gray-800 mb-3">{t('simulations.mappo.junctionDetail')}</h2>
                    {selected ? (
                        <div className="flex justify-center">
                            <div className="w-full max-w-4xl">
                                <JunctionDetailView signal={selected} onClose={() => setSelectedSignal(null)} />
                            </div>
                        </div>
                    ) : (
                        <div className="h-[300px] flex items-center justify-center text-gray-400 text-center">
                            <div>
                                <p className="text-5xl mb-3">🚦</p>
                                <p className="text-lg">{t('simulations.mappo.junctionPlaceholder')}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
