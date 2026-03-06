// Mock data for Yatayat Traffic Intelligence Platform

export const mockStreams = [
  { id: 1, name: "Master Canteen Cam", url: "/stream1", status: "active", location: "Master Canteen Junction", thumbnail: "https://images.unsplash.com/photo-1566679056285-511dbb3603af?auto=format&fit=crop&w=500&q=60" },
  { id: 2, name: "Jayadev Vihar Cam", url: "/stream2", status: "active", location: "Jayadev Vihar", thumbnail: "https://images.unsplash.com/photo-1545922016-87c93aaca2ce?auto=format&fit=crop&w=500&q=60" },
  { id: 3, name: "Acharya Vihar Cam", url: "/stream3", status: "active", location: "Acharya Vihar", thumbnail: "https://images.unsplash.com/photo-1494522855154-9297ac14b55f?auto=format&fit=crop&w=500&q=60" },
  { id: 4, name: "Vani Vihar Cam", url: "/stream4", status: "offline", location: "Vani Vihar", thumbnail: "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=500&q=60" },
] as const;

export const mockDetectionData = {
  cars: 142,
  trucks: 23,
  bikes: 18,
  pedestrians: 67,
  total: 250,
  congestionScore: 7.2,
  timestamp: new Date().toISOString(),
};

export const mockPredictions = [
  { time: "Now", density: 65 },
  { time: "+15m", density: 72 },
  { time: "+30m", density: 85 },
  { time: "+45m", density: 60 },
  { time: "+60m", density: 55 },
];

export const mockTelemetry = [
  { time: '00:00', density: 3.2, vehicles: 120 },
  { time: '04:00', density: 2.1, vehicles: 80 },
  { time: '08:00', density: 8.4, vehicles: 310 },
  { time: '12:00', density: 7.2, vehicles: 265 },
  { time: '16:00', density: 9.1, vehicles: 340 },
  { time: '20:00', density: 6.8, vehicles: 245 },
  { time: '23:59', density: 4.5, vehicles: 165 },
];

export const mockLogs = [
  {
    id: 1,
    timestamp: new Date(Date.now() - 300000).toISOString(),
    eventType: "High Congestion",
    cameraId: "CAM-001",
    severity: "warning",
    metadata: { density: 9.1, vehicles: 340 }
  },
  {
    id: 2,
    timestamp: new Date(Date.now() - 600000).toISOString(),
    eventType: "Anomaly Detected",
    cameraId: "CAM-003",
    severity: "critical",
    metadata: { type: "stopped_vehicle", duration: 240 }
  },
  {
    id: 3,
    timestamp: new Date(Date.now() - 900000).toISOString(),
    eventType: "Stream Offline",
    cameraId: "CAM-004",
    severity: "error",
    metadata: { reason: "connection_timeout" }
  },
  {
    id: 4,
    timestamp: new Date(Date.now() - 1200000).toISOString(),
    eventType: "Normal Flow",
    cameraId: "CAM-002",
    severity: "info",
    metadata: { density: 4.5, vehicles: 165 }
  },
  {
    id: 5,
    timestamp: new Date(Date.now() - 1500000).toISOString(),
    eventType: "Pedestrian Alert",
    cameraId: "CAM-005",
    severity: "warning",
    metadata: { count: 89, threshold_exceeded: true }
  },
];

export const mockUsers = [
  { email: "admin@yatayat.com", password: "admin123", role: "admin" as const, name: "Admin User", phone: "9876543210" },
  { email: "user@yatayat.com", password: "user123", role: "user" as const, name: "User", phone: "8877665544" },
  { email: "employee@yatayat.com", password: "emp123", role: "employee" as const, name: "Field Employee", phone: "7766554433" },
];

export type UserRole = typeof mockUsers[number]['role'];

export const mockViolations = [
  {
    id: 1,
    type: "Speed Limit Violation",
    vehicleNo: "OD-02-AB-1234",
    location: "Master Canteen Junction",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    fineAmount: 1000,
    status: "pending" as const,
    imageUrl: "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&q=80&w=1000",
    confidence: 0.95,
    officer: "Officer Rajesh Kumar",
  },
  {
    id: 2,
    type: "No Helmet",
    vehicleNo: "OD-05-XY-9876",
    location: "Jayadev Vihar",
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    fineAmount: 500,
    status: "paid" as const,
    imageUrl: "https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&q=80&w=1000",
    confidence: 0.92,
    officer: "Officer Priya Patel",
  },
  {
    id: 3,
    type: "Signal Jump",
    vehicleNo: "OD-33-ZZ-5555",
    location: "Acharya Vihar",
    timestamp: new Date(Date.now() - 10800000).toISOString(),
    fineAmount: 2000,
    status: "contested" as const,
    imageUrl: "https://images.unsplash.com/photo-1597762470488-387751f538c6?auto=format&fit=crop&q=80&w=1000",
    confidence: 0.88,
    officer: "Officer Amit Singh",
  },
  {
    id: 4,
    type: "No Seatbelt",
    vehicleNo: "OD-03-MN-4567",
    location: "Vani Vihar",
    timestamp: new Date(Date.now() - 14400000).toISOString(),
    fineAmount: 1000,
    status: "pending" as const,
    imageUrl: "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&q=80&w=1000",
    confidence: 0.91,
    officer: "Officer Sunita Sharma",
  },
  {
    id: 5,
    type: "Wrong Side Driving",
    vehicleNo: "OD-07-CD-8901",
    location: "Master Canteen Junction",
    timestamp: new Date(Date.now() - 18000000).toISOString(),
    fineAmount: 1500,
    status: "paid" as const,
    imageUrl: "https://images.unsplash.com/photo-1566679056285-511dbb3603af?auto=format&fit=crop&q=80&w=1000",
    confidence: 0.94,
    officer: "Officer Rajesh Kumar",
  },
  {
    id: 6,
    type: "No Helmet",
    vehicleNo: "OD-12-PQ-3456",
    location: "Jayadev Vihar",
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    fineAmount: 500,
    status: "paid" as const,
    imageUrl: "https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&q=80&w=1000",
    confidence: 0.89,
    officer: "Officer Priya Patel",
  },
  {
    id: 7,
    type: "Speed Limit Violation",
    vehicleNo: "OD-20-RS-7890",
    location: "Acharya Vihar",
    timestamp: new Date(Date.now() - 172800000).toISOString(),
    fineAmount: 1000,
    status: "pending" as const,
    imageUrl: "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&q=80&w=1000",
    confidence: 0.96,
    officer: "Officer Amit Singh",
  },
  {
    id: 8,
    type: "Signal Jump",
    vehicleNo: "OD-15-TU-2345",
    location: "Vani Vihar",
    timestamp: new Date(Date.now() - 259200000).toISOString(),
    fineAmount: 2000,
    status: "paid" as const,
    imageUrl: "https://images.unsplash.com/photo-1597762470488-387751f538c6?auto=format&fit=crop&q=80&w=1000",
    confidence: 0.93,
    officer: "Officer Sunita Sharma",
  },
  {
    id: 9,
    type: "No Seatbelt",
    vehicleNo: "OD-08-VW-6789",
    location: "Master Canteen Junction",
    timestamp: new Date(Date.now() - 345600000).toISOString(),
    fineAmount: 1000,
    status: "contested" as const,
    imageUrl: "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&q=80&w=1000",
    confidence: 0.87,
    officer: "Officer Rajesh Kumar",
  },
  {
    id: 10,
    type: "Parking Violation",
    vehicleNo: "OD-25-XY-1122",
    location: "Jayadev Vihar",
    timestamp: new Date(Date.now() - 432000000).toISOString(),
    fineAmount: 300,
    status: "paid" as const,
    imageUrl: "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&q=80&w=1000",
    confidence: 0.98,
    officer: "Officer Priya Patel",
  },
  {
    id: 11,
    type: "Speed Limit Violation",
    vehicleNo: "OD-11-BC-4455",
    location: "Acharya Vihar",
    timestamp: new Date(Date.now() - 518400000).toISOString(),
    fineAmount: 1000,
    status: "pending" as const,
    imageUrl: "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&q=80&w=1000",
    confidence: 0.91,
    officer: "Officer Amit Singh",
  },
  {
    id: 12,
    type: "No Helmet",
    vehicleNo: "OD-18-DE-7788",
    location: "Vani Vihar",
    timestamp: new Date(Date.now() - 604800000).toISOString(),
    fineAmount: 500,
    status: "paid" as const,
    imageUrl: "https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&q=80&w=1000",
    confidence: 0.90,
    officer: "Officer Sunita Sharma",
  },
  {
    id: 13,
    type: "Triple Riding",
    vehicleNo: "OD-22-FG-9900",
    location: "Master Canteen Junction",
    timestamp: new Date(Date.now() - 691200000).toISOString(),
    fineAmount: 1500,
    status: "pending" as const,
    imageUrl: "https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&q=80&w=1000",
    confidence: 0.85,
    officer: "Officer Rajesh Kumar",
  },
  {
    id: 14,
    type: "Signal Jump",
    vehicleNo: "OD-30-HI-3344",
    location: "Jayadev Vihar",
    timestamp: new Date(Date.now() - 777600000).toISOString(),
    fineAmount: 2000,
    status: "paid" as const,
    imageUrl: "https://images.unsplash.com/photo-1597762470488-387751f538c6?auto=format&fit=crop&q=80&w=1000",
    confidence: 0.94,
    officer: "Officer Priya Patel",
  },
  {
    id: 15,
    type: "Mobile Phone Usage",
    vehicleNo: "OD-14-JK-5566",
    location: "Acharya Vihar",
    timestamp: new Date(Date.now() - 864000000).toISOString(),
    fineAmount: 800,
    status: "contested" as const,
    imageUrl: "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&q=80&w=1000",
    confidence: 0.86,
    officer: "Officer Amit Singh",
  },
];

export const mockGroups = [
  { id: "general", name: "General Chat" },
  { id: "traffic", name: "Traffic Updates" },
  { id: "watch", name: "Neighborhood Watch" },
];

export const mockMessages = [
  { id: 1, sender: "Officer John", role: "police", content: "Patrol unit 4 heading to CSMT.", timestamp: new Date(Date.now() - 300000).toISOString(), area: "CSMT", groupId: "traffic" },
  { id: 2, sender: "Control Room", role: "admin", content: "Copy that. Heavy traffic reported at Worli.", timestamp: new Date(Date.now() - 240000).toISOString(), area: "Worli", groupId: "traffic" },
  { id: 3, sender: "Sarah Connor", role: "user", content: "Accident reported near Bandra.", timestamp: new Date(Date.now() - 120000).toISOString(), area: "Bandra", groupId: "general" },
  { id: 4, sender: "Mike Ross", role: "user", content: "Suspicious activity near Andheri.", timestamp: new Date(Date.now() - 60000).toISOString(), area: "Andheri", groupId: "watch" },
];

export const mockIncidents = [
  {
    id: 1,
    type: "Accident",
    location: "Bandra West",
    reporter: "Sarah Connor",
    status: "active",
    timestamp: new Date(Date.now() - 120000).toISOString(),
    coordinates: [19.0596, 72.8295]
  },
  {
    id: 2,
    type: "Road Block",
    location: "BKC Junction",
    reporter: "Officer Mike",
    status: "resolved",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    coordinates: [19.0700, 72.8700]
  },
];

export const mockRecommendations = [
  { id: 1, type: "signal", message: "Extend Green Signal at CSMT by 15s", impact: "High", location: "CSMT" },
  { id: 2, type: "personnel", message: "Deploy Traffic Warden to Worli", impact: "Medium", location: "Worli" },
  { id: 3, type: "route", message: "Divert heavy vehicles via Link Road", impact: "High", location: "Bandra" },
];

export const mockWeather = {
  temp: 28,
  condition: "Haze",
  humidity: 70,
  windSpeed: 10,
  aqi: 145,
  location: "Bhubaneswar"
};

