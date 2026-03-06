// ============================================================================
// TRAFFIC SIGNAL OPTIMIZATION - THREE PHASE IMPLEMENTATION
// ============================================================================

export interface LaneData {
  vehicleCount: number;
  laneLength: number;
  rightTurnRatio: number;
  leftTurnRatio?: number;
  straightRatio?: number;
}

export interface OptimizationResult {
  schedule: number[];
  phaseBreakdown?: {
    lane: string;
    straight: number;
    left: number;
    right: number;
    total: number;
    density?: string;
  }[];
  totalCycleTime: number;
  efficiency: number;
}

// ============================================================================
// SCOOT-STYLE PHASE DEFINITIONS FOR SIMULATION TOGGLE
// ============================================================================

export interface SignalQueues {
  through: number;
  left: number;
  right: number;
}

export interface PhaseResult {
  allowedMovements: string[];
  nextPhase: number;
  greenTime: number;
  phaseDescription: string;
}

// Phase definitions for 4-way junction (6 phases for all movements)
const PHASES_4WAY: { movements: string[]; description: string }[] = [
  { movements: ['N_S', 'S_N'], description: 'North-South Through' },
  { movements: ['N_W', 'S_E'], description: 'North-South Left Turns' },
  { movements: ['N_E', 'S_W'], description: 'North-South Right Turns' },
  { movements: ['E_W', 'W_E'], description: 'East-West Through' },
  { movements: ['E_N', 'W_S'], description: 'East-West Left Turns' },
  { movements: ['E_S', 'W_N'], description: 'East-West Right Turns' },
];

// Phase definitions for T/Y junction (no East approach)
const PHASES_T_NO_EAST: { movements: string[]; description: string }[] = [
  { movements: ['N_S', 'S_N'], description: 'North-South Through' },
  { movements: ['N_W', 'S_W'], description: 'Turns to West' },
  { movements: ['W_N', 'W_S'], description: 'From West' },
];

// T/Y junction (no North approach)
const PHASES_T_NO_NORTH: { movements: string[]; description: string }[] = [
  { movements: ['E_W', 'W_E'], description: 'East-West Through' },
  { movements: ['E_S', 'W_S'], description: 'Turns to South' },
  { movements: ['S_E', 'S_W'], description: 'From South' },
];

/**
 * SCOOT-style density-based phase selection
 * Calculates optimal allowed movements based on queue densities
 */
export function calculateAllowedMovements(
  queues: SignalQueues,
  approaches: string[],
  currentPhase: number,
  stepCount: number = 0
): PhaseResult {
  const is4Way = approaches.length === 4;
  const hasN = approaches.includes('N');
  const hasE = approaches.includes('E');
  const hasS = approaches.includes('S');
  const hasW = approaches.includes('W');

  // Select phase definitions based on junction type
  let phases: { movements: string[]; description: string }[];
  if (is4Way) {
    phases = PHASES_4WAY;
  } else if (!hasE) {
    phases = PHASES_T_NO_EAST;
  } else if (!hasN) {
    phases = PHASES_T_NO_NORTH;
  } else {
    // Default to simplified phases
    phases = [
      { movements: ['N_S', 'S_N', 'E_W', 'W_E'], description: 'All Through' },
    ];
  }

  const numPhases = phases.length;

  // Calculate density-based green time using SCOOT formula
  const BASE_GREEN_TIME = 15;
  const MAX_GREEN_TIME = 45;
  const totalQueue = queues.through + queues.left + queues.right;

  // Degree of saturation (0 to 1+)
  const saturation = Math.min(1.5, totalQueue / 100);

  // Calculate green time proportional to demand
  let greenTime = BASE_GREEN_TIME + (saturation * 30);
  greenTime = Math.min(MAX_GREEN_TIME, Math.max(BASE_GREEN_TIME, greenTime));

  // Phase switching based on time and demand
  const stepsPerPhase = Math.round(greenTime);
  const phaseStep = stepCount % (stepsPerPhase * numPhases);
  const calculatedPhase = Math.floor(phaseStep / stepsPerPhase);

  // Ensure phase is valid
  const nextPhase = (calculatedPhase + 1) % numPhases;
  const activePhase = phases[calculatedPhase % numPhases];

  // Filter movements to only include valid approaches
  const allowedMovements = activePhase.movements.filter(mov => {
    const [from, to] = mov.split('_');
    return approaches.includes(from) && approaches.includes(to);
  });

  return {
    allowedMovements,
    nextPhase,
    greenTime: Math.round(greenTime),
    phaseDescription: activePhase.description
  };
}

/**
 * Simulate queue changes over time (for standalone optimization mode)
 */
export function simulateQueueDynamics(
  currentQueues: SignalQueues,
  allowedMovements: string[],
  approaches: string[]
): SignalQueues {
  // Base arrival rate (vehicles per step)
  const arrivalRate = 0.3 + Math.random() * 0.4;

  // Departure rate when movement is allowed
  const departureRate = 0.5;

  let { through, left, right } = currentQueues;

  // Arrivals (random per approach)
  through += arrivalRate * approaches.length * (0.5 + Math.random() * 0.5);
  left += arrivalRate * approaches.length * 0.3 * (0.5 + Math.random() * 0.5);
  right += arrivalRate * approaches.length * 0.2 * (0.5 + Math.random() * 0.5);

  // Departures based on allowed movements
  allowedMovements.forEach(mov => {
    const [from, to] = mov.split('_');
    // Determine movement type
    const leftTurns: Record<string, string> = { N: 'W', S: 'E', E: 'N', W: 'S' };
    const rightTurns: Record<string, string> = { N: 'E', S: 'W', E: 'S', W: 'N' };

    if (leftTurns[from] === to) {
      left = Math.max(0, left - departureRate * 2);
    } else if (rightTurns[from] === to) {
      right = Math.max(0, right - departureRate * 2);
    } else {
      through = Math.max(0, through - departureRate * 3);
    }
  });

  // Clamp values
  through = Math.max(0, Math.min(100, through));
  left = Math.max(0, Math.min(50, left));
  right = Math.max(0, Math.min(50, right));

  return { through, left, right };
}


// ============================================================================
// PHASE 1: STRAIGHT TRAFFIC ONLY
// ============================================================================
/**
 * Phase 1: Basic optimization considering only straight-moving vehicles
 * Formula: Green Time = Base Time + (Vehicle Density × Lane Factor)
 */
export function calculatePhase1_StraightOnly(lanes: LaneData[]): OptimizationResult {
  const BASE_GREEN_TIME = 15; // Minimum green time (seconds)
  const MAX_GREEN_TIME = 90; // Maximum green time (seconds)
  const DENSITY_FACTOR = 1.2; // Multiplier for vehicle density impact

  const schedule: number[] = [];
  let totalVehicles = 0;

  // Calculate total traffic density
  lanes.forEach(lane => {
    totalVehicles += lane.vehicleCount;
  });

  // Calculate green time for each lane based on vehicle count
  lanes.forEach(lane => {
    // Traffic density = vehicles per unit length
    const density = lane.vehicleCount / lane.laneLength;

    // Green time proportional to density
    let greenTime = BASE_GREEN_TIME + (density * lane.laneLength * DENSITY_FACTOR);

    // Apply constraints
    greenTime = Math.max(BASE_GREEN_TIME, Math.min(MAX_GREEN_TIME, greenTime));

    schedule.push(Math.round(greenTime));
  });

  const totalCycleTime = schedule.reduce((sum, time) => sum + time, 0) + (lanes.length * 5); // +5s yellow per lane
  const efficiency = totalVehicles / totalCycleTime;

  return {
    schedule,
    totalCycleTime,
    efficiency
  };
}

// ============================================================================
// PHASE 2: STRAIGHT + LEFT TURN TRAFFIC
// ============================================================================
/**
 * Phase 2: Optimization with straight and left turn movements
 * Formula: Green Time = (Straight Vehicles × Weight_Straight) + (Left Turn Vehicles × Weight_Left)
 */
export function calculatePhase2_StraightAndLeft(lanes: LaneData[]): OptimizationResult {
  const BASE_GREEN_TIME = 15;
  const MAX_GREEN_TIME = 120;
  const STRAIGHT_WEIGHT = 1.0; // Straight vehicles move faster
  const LEFT_WEIGHT = 1.5; // Left turns take longer (conflict with oncoming)
  const MIN_LEFT_TURN_TIME = 8; // Minimum dedicated left turn time

  const schedule: number[] = [];
  const phaseBreakdown: any[] = [];

  lanes.forEach((lane, index) => {
    // Assume 70% straight, 30% left if not specified
    const leftRatio = lane.leftTurnRatio || 0.3;
    const straightRatio = 1 - leftRatio;

    const straightVehicles = lane.vehicleCount * straightRatio;
    const leftVehicles = lane.vehicleCount * leftRatio;

    // Calculate time needed for straight traffic
    const straightTime = (straightVehicles / lane.laneLength) * 100 * STRAIGHT_WEIGHT;

    // Calculate time needed for left turns
    const leftTime = (leftVehicles / lane.laneLength) * 100 * LEFT_WEIGHT;

    // Total green time (straight phase + protected left phase)
    let totalGreenTime = BASE_GREEN_TIME + straightTime + leftTime;

    // Ensure minimum left turn time if there are left-turning vehicles
    if (leftVehicles > 0) {
      totalGreenTime = Math.max(totalGreenTime, BASE_GREEN_TIME + MIN_LEFT_TURN_TIME);
    }

    // Apply constraints
    totalGreenTime = Math.max(BASE_GREEN_TIME, Math.min(MAX_GREEN_TIME, totalGreenTime));

    schedule.push(Math.round(totalGreenTime));

    phaseBreakdown.push({
      lane: `Lane ${String.fromCharCode(65 + index)}`,
      straight: Math.round(straightTime),
      left: Math.round(leftTime),
      right: 0,
      total: Math.round(totalGreenTime)
    });
  });

  const totalCycleTime = schedule.reduce((sum, time) => sum + time, 0) + (lanes.length * 5);
  const totalVehicles = lanes.reduce((sum, lane) => sum + lane.vehicleCount, 0);
  const efficiency = totalVehicles / totalCycleTime;

  return {
    schedule,
    phaseBreakdown,
    totalCycleTime,
    efficiency
  };
}

// ============================================================================
// PHASE 3: COMPLETE OPTIMIZATION (STRAIGHT + LEFT + RIGHT)
// ============================================================================
/**
 * Phase 3: Full optimization with all movement types
 * Formula: Green Time = Σ(Movement_Type × Vehicle_Count × Movement_Weight × Conflict_Factor)
 */
export function calculatePhase3_AllMovements(lanes: LaneData[]): OptimizationResult {
  const BASE_GREEN_TIME = 15;
  const MAX_GREEN_TIME = 120;
  const MIN_PHASE_TIME = 10;

  // Movement weights (time cost per vehicle)
  const WEIGHTS = {
    straight: 1.0,    // Fastest - no conflicts
    right: 0.8,       // Fast - yield to pedestrians only
    left: 1.8         // Slowest - conflicts with oncoming traffic
  };

  // Saturation flow rates (vehicles per hour per lane)
  const SATURATION_FLOW = {
    straight: 1800,
    right: 1400,
    left: 1000
  };

  const schedule: number[] = [];
  const phaseBreakdown: any[] = [];

  lanes.forEach((lane, index) => {
    // Default traffic distribution if not specified
    const leftRatio = lane.leftTurnRatio || 0.25;
    const rightRatio = lane.rightTurnRatio || 0.15;
    const straightRatio = lane.straightRatio || (1 - leftRatio - rightRatio);

    // Vehicle counts by movement type
    const straightVehicles = lane.vehicleCount * straightRatio;
    const leftVehicles = lane.vehicleCount * leftRatio;
    const rightVehicles = lane.vehicleCount * rightRatio;

    // Calculate required green time for each movement using Webster's formula
    // Green Time = (Vehicle Volume / Saturation Flow) × Cycle Time Factor

    const straightTime = (straightVehicles / (SATURATION_FLOW.straight / 3600)) * WEIGHTS.straight;
    const leftTime = (leftVehicles / (SATURATION_FLOW.left / 3600)) * WEIGHTS.left;
    const rightTime = (rightVehicles / (SATURATION_FLOW.right / 3600)) * WEIGHTS.right;

    // Traffic density factor (congestion adjustment)
    const densityFactor = Math.min(2.0, 1 + (lane.vehicleCount / lane.laneLength) * 0.01);

    // Calculate total green time with density adjustment
    let totalGreenTime = BASE_GREEN_TIME +
      (straightTime + leftTime + rightTime) * densityFactor;

    // Critical density handling (avoid gridlock)
    const criticalDensity = lane.vehicleCount / lane.laneLength;
    if (criticalDensity > 0.8) {
      // High congestion - add extra time
      totalGreenTime *= 1.3;
    } else if (criticalDensity < 0.2) {
      // Low traffic - reduce time
      totalGreenTime *= 0.8;
    }

    // Apply constraints
    totalGreenTime = Math.max(BASE_GREEN_TIME, Math.min(MAX_GREEN_TIME, totalGreenTime));

    // Ensure minimum time for each movement type if vehicles present
    if (leftVehicles > 0) {
      totalGreenTime = Math.max(totalGreenTime, BASE_GREEN_TIME + MIN_PHASE_TIME);
    }

    schedule.push(Math.round(totalGreenTime));

    phaseBreakdown.push({
      lane: `Lane ${String.fromCharCode(65 + index)}`,
      straight: Math.round(straightTime),
      left: Math.round(leftTime),
      right: Math.round(rightTime),
      total: Math.round(totalGreenTime),
      density: criticalDensity.toFixed(2)
    });
  });

  // Calculate total cycle time (including yellow and all-red phases)
  const YELLOW_TIME = 4; // seconds per phase
  const ALL_RED_TIME = 2; // seconds clearance between phases
  const totalCycleTime = schedule.reduce((sum, time) => sum + time, 0) +
    (lanes.length * (YELLOW_TIME + ALL_RED_TIME));

  // Calculate system efficiency
  const totalVehicles = lanes.reduce((sum, lane) => sum + lane.vehicleCount, 0);
  const efficiency = (totalVehicles / totalCycleTime) * 100; // vehicles per second × 100

  return {
    schedule,
    phaseBreakdown,
    totalCycleTime,
    efficiency
  };
}

// ============================================================================
// ADAPTIVE OPTIMIZER - SELECTS BEST PHASE BASED ON TRAFFIC CONDITIONS
// ============================================================================
export function optimizeTrafficSignals(
  lanes: LaneData[],
  phase: 1 | 2 | 3 = 3
): OptimizationResult {

  console.log(`🚦 Running Phase ${phase} Optimization`);
  console.log('Input Lanes:', lanes);

  let result: OptimizationResult;

  switch (phase) {
    case 1:
      result = calculatePhase1_StraightOnly(lanes);
      console.log('✅ Phase 1: Straight Traffic Only');
      break;

    case 2:
      result = calculatePhase2_StraightAndLeft(lanes);
      console.log('✅ Phase 2: Straight + Left Turn Traffic');
      break;

    case 3:
      result = calculatePhase3_AllMovements(lanes);
      console.log('✅ Phase 3: Complete Optimization (All Movements)');
      break;

    default:
      result = calculatePhase3_AllMovements(lanes);
  }

  console.log('📊 Optimization Results:');
  console.log('- Signal Schedule:', result.schedule);
  console.log('- Total Cycle Time:', result.totalCycleTime, 'seconds');
  console.log('- System Efficiency:', result.efficiency.toFixed(2));

  if (result.phaseBreakdown) {
    console.log('- Phase Breakdown:', result.phaseBreakdown);
  }

  return result;
}

// ============================================================================
// EXAMPLE TEST FUNCTION (Call manually when needed)
// ============================================================================
export function runTests() {
  // Example 1: Phase 1 - Straight traffic only
  const testLanes1: LaneData[] = [
    { vehicleCount: 25, laneLength: 100, rightTurnRatio: 0.1 },
    { vehicleCount: 15, laneLength: 100, rightTurnRatio: 0.1 },
    { vehicleCount: 30, laneLength: 100, rightTurnRatio: 0.1 },
    { vehicleCount: 20, laneLength: 100, rightTurnRatio: 0.1 }
  ];

  console.log('\n============ PHASE 1 TEST ============');
  const result1 = optimizeTrafficSignals(testLanes1, 1);

  // Example 2: Phase 2 - Straight + Left
  const testLanes2: LaneData[] = [
    { vehicleCount: 25, laneLength: 100, rightTurnRatio: 0.1, leftTurnRatio: 0.3 },
    { vehicleCount: 15, laneLength: 100, rightTurnRatio: 0.1, leftTurnRatio: 0.25 },
    { vehicleCount: 30, laneLength: 100, rightTurnRatio: 0.1, leftTurnRatio: 0.35 },
    { vehicleCount: 20, laneLength: 100, rightTurnRatio: 0.1, leftTurnRatio: 0.2 }
  ];

  console.log('\n============ PHASE 2 TEST ============');
  const result2 = optimizeTrafficSignals(testLanes2, 2);

  // Example 3: Phase 3 - All movements
  const testLanes3: LaneData[] = [
    { vehicleCount: 45, laneLength: 100, rightTurnRatio: 0.15, leftTurnRatio: 0.25, straightRatio: 0.6 },
    { vehicleCount: 30, laneLength: 100, rightTurnRatio: 0.2, leftTurnRatio: 0.2, straightRatio: 0.6 },
    { vehicleCount: 60, laneLength: 100, rightTurnRatio: 0.1, leftTurnRatio: 0.3, straightRatio: 0.6 },
    { vehicleCount: 35, laneLength: 100, rightTurnRatio: 0.15, leftTurnRatio: 0.25, straightRatio: 0.6 }
  ];

  console.log('\n============ PHASE 3 TEST ============');
  const result3 = optimizeTrafficSignals(testLanes3, 3);

  return { result1, result2, result3 };
}