#!/usr/bin/env python3
"""
enhanced_sim_server.py - Enhanced MAPPO Simulation Server

Same as sim_server.py but with:
- Emergency vehicle priority API
- Accident/Rally event API
- Coordination status endpoint

Run with: python enhanced_sim_server.py
"""

import os
import logging
import threading
from typing import Dict, Any, Optional
from pathlib import Path
from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict
import random
import httpx
import json

# Setup paths
SCRIPT_DIR = Path(__file__).parent
FLOWMASTERS_ROOT = SCRIPT_DIR.parent.parent

# Auth Configuration
TELEGRAM_BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN_HERE"
TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"
CHATS_FILE = SCRIPT_DIR.parent / "telegram_bot" / "login_registered_chats.json"

# OTP Store (In-memory for demo)
otp_store: Dict[str, str] = {}

from traffic_env_movement import VectorizedTrafficEnv

# Use STANDARD MAPPO inference
from mappo_inference import (
    load_mappo_policy,
    build_actions_dict,
    build_step_message,
    flatten_obs,
)

# Placeholders for coordinated features (to keep APIs alive but disabled)
def set_emergency_vehicle(path, vtype): return {"status": "disabled"}
def set_accident(blocked): return {"status": "disabled"}
def set_rally(blocked): return {"status": "disabled"}
def clear_events(): return {"status": "disabled"}
def get_coordination_status(): return {"active_emergencies": 0, "blocked_junctions": []}

logger = logging.getLogger("enhanced_sim_server")
logging.basicConfig(level=logging.INFO)

JSON_PATH = SCRIPT_DIR.parent / "sambalpur_signals_15_movement.json"
CHECKPOINT_PATH = SCRIPT_DIR.parent / "policy_shared_final.pt"

DEVICE = "cuda" if os.getenv("CUDA_VISIBLE_DEVICES") else "cpu"


# =============================================================================
# REQUEST MODELS
# =============================================================================
class StartSimRequest(BaseModel):
    sim_id: str = Field("mappo-sim-1", description="Simulation identifier")
    steps: int = Field(3600, description="Number of simulation steps")
    seed: int = Field(42, description="Random seed")
    sim_step: float = Field(1.0, description="Seconds per simulated step")
    base_demand: float = Field(0.30, description="Base traffic demand level")
    city_tier: int = Field(2, description="City tier (1=Metro, 2=City, 3=Town)")


class EmergencyRequest(BaseModel):
    path: List[str] = Field(..., description="List of signal IDs for emergency path")
    vehicle_type: str = Field("ambulance", description="Type: ambulance or firetruck")


class AccidentRequest(BaseModel):
    blocked: List[str] = Field(..., description="List of blocked signal IDs")


class RallyRequest(BaseModel):
    blocked: List[str] = Field(..., description="List of blocked signal IDs")


class OTPRequest(BaseModel):
    phone: str = Field(..., description="User's phone number")


class VerifyOTPRequest(BaseModel):
    phone: str = Field(..., description="User's phone number")
    otp: str = Field(..., description="6-digit OTP")

class AccidentAlertRequest(BaseModel):
    location: str
    severity: str = "high"
    description: str = "Accident detected via Test Camera"
    lat: float = 22.3072
    lng: float = 73.1812


# =============================================================================
# SIMULATION STATE
# =============================================================================
class SimulationState:
    def __init__(self):
        self.lock = threading.Lock()
        self.running = False
        self.sim_id = None
        self.current_step = 0
        self.total_steps = 3600
        self.error = None
        self.env = None
        self.mvnet = None
        self.policy = None
        self.obs = None
        self.last_phases = None
        self.latest_state = None
        self.city_tier = 2
    
    def reset(self):
        with self.lock:
            self.running = False
            self.sim_id = None
            self.current_step = 0
            self.total_steps = 3600
            self.error = None
            self.env = None
            self.mvnet = None
            self.policy = None
            self.obs = None
            self.last_phases = None
            self.latest_state = None
            clear_events()  # Clear coordination events


state = SimulationState()

app = FastAPI(title="Enhanced MAPPO Traffic Simulation Server", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# STANDARD ENDPOINTS
# =============================================================================
@app.get("/")
def root():
    return {
        "name": "Enhanced MAPPO Traffic Simulation Server",
        "version": "3.0.0",
        "features": ["emergency_priority", "accident_handling", "rally_handling", "coordination"],
        "device": DEVICE,
    }


@app.get("/api/sim/status")
def get_status():
    with state.lock:
        coord = get_coordination_status()
        return {
            "running": state.running,
            "sim_id": state.sim_id,
            "step": state.current_step,
            "total_steps": state.total_steps,
            "error": state.error,
            "city_tier": state.city_tier,
            "coordination": coord,
        }


@app.post("/api/sim/start")
def start_simulation(req: StartSimRequest):
    with state.lock:
        if state.running:
            return {"status": "already_running", "step": state.current_step}
    
    if not JSON_PATH.exists():
        raise HTTPException(400, f"Network JSON not found: {JSON_PATH}")
    
    try:
        env = VectorizedTrafficEnv(
            str(JSON_PATH),
            n_envs=1,
            sim_step=req.sim_step,
            base_demand_level=req.base_demand,
            dynamic_demand=True,
            seed=req.seed,
        )
        
        mvnet = env.network
        obs = env.reset()
        
        policy = load_mappo_policy(
            str(CHECKPOINT_PATH),
            obs_dim=6,
            n_actions=5,
            hidden=None
        )
        
        with state.lock:
            state.env = env
            state.mvnet = mvnet
            state.policy = policy
            state.obs = obs
            state.running = True
            state.sim_id = req.sim_id
            state.current_step = 0
            state.total_steps = req.steps
            state.last_phases = None
            state.error = None
            state.city_tier = req.city_tier
        
        logger.info(f"Enhanced simulation started: {req.sim_id} tier={req.city_tier}")
        return {"status": "started", "step": 0, "city_tier": req.city_tier}
        
    except Exception as e:
        logger.exception(f"Start failed: {e}")
        raise HTTPException(500, str(e))


@app.get("/api/sim/step")
def step_simulation():
    with state.lock:
        if not state.running or state.env is None:
            raise HTTPException(400, "Simulation not running")
        
        if state.current_step >= state.total_steps:
            state.running = False
            return state.latest_state
        
        env = state.env
        mvnet = state.mvnet
        policy = state.policy
        obs_snapshot = state.obs
        sim_id = state.sim_id or "mappo-sim"
        step_idx = state.current_step
    
    try:
        obs_arr, keys = flatten_obs(obs_snapshot)
        
        # Uses ENHANCED build_actions_dict with coordination
        actions_dict = build_actions_dict(mvnet, policy, obs_snapshot, keys)
        
        next_obs, _rewards, _dones, info = env.step(actions_dict)
        
        msg, new_phases = build_step_message(
            sim_id=sim_id,
            t=step_idx,
            sim_step=1.0,
            obs=next_obs,
            info=info,
            mvnet=mvnet,
            last_phases=state.last_phases,
        )
        
        # Add coordination info to message
        msg["coordination"] = get_coordination_status()
        
        with state.lock:
            state.obs = next_obs
            state.current_step += 1
            state.latest_state = msg
            state.last_phases = new_phases
        
        return msg
        
    except Exception as e:
        logger.exception(f"Step error: {e}")
        with state.lock:
            state.error = str(e)
            state.running = False
        raise HTTPException(500, str(e))


@app.post("/api/sim/stop")
def stop_simulation():
    state.reset()
    return {"status": "stopped"}


@app.get("/api/sim/network")
def get_network():
    if not JSON_PATH.exists():
        raise HTTPException(400, "Network not found")
    import json
    with open(JSON_PATH) as f:
        return {"network": json.load(f)}


# =============================================================================
# EVENT ENDPOINTS (NEW!)
# =============================================================================
@app.post("/api/events/emergency")
def set_emergency(req: EmergencyRequest):
    """Set emergency vehicle path for priority routing."""
    result = set_emergency_vehicle(req.path, req.vehicle_type)
    logger.info(f"🚨 Emergency set: {req.vehicle_type} on path {req.path}")
    return result


@app.post("/api/events/accident")
def set_accident_event(req: AccidentRequest):
    """Set accident blocking junctions."""
    result = set_accident(req.blocked)
    logger.info(f"⚠️ Accident set: blocked {req.blocked}")
    return result


@app.post("/api/events/rally")
def set_rally_event(req: RallyRequest):
    """Set rally/procession blocking junctions."""
    result = set_rally(req.blocked)
    logger.info(f"🚩 Rally set: blocked {req.blocked}")
    return result


@app.post("/api/alert/accident")
async def trigger_accident_alert(req: AccidentAlertRequest):
    """Trigger an accident alert via Telegram Bot"""
    try:
        # Load registered users for broadcast
        user_mapping: Dict[str, int] = {}
        if CHATS_FILE.exists():
            with open(CHATS_FILE, 'r') as f:
                user_mapping = json.load(f)
        
        chat_ids = list(user_mapping.values())
        if not chat_ids:
            return {"status": "no_users", "message": "No registered users found."}

        message = (
            f"⚠️ <b>ACCIDENT DETECTED</b> ⚠️\n\n"
            f"<b>Location:</b> {req.location}\n"
            f"<b>Severity:</b> {req.severity.upper()}\n"
            f"<b>Details:</b> {req.description}\n\n"
            f"📍 <a href='https://www.google.com/maps/dir/?api=1&destination={req.lat},{req.lng}'>Navigate to Scene</a>\n\n"
            f"<i>Emergency services have been notified.</i>"
        )

        async with httpx.AsyncClient() as client:
            tasks = [
                client.post(f"{TELEGRAM_API}/sendMessage", json={
                    "chat_id": cid,
                    "text": message,
                    "parse_mode": "HTML"
                }) for cid in chat_ids
            ]
            await asyncio.gather(*tasks)

        logger.info(f"Broadcasted accident alert to {len(chat_ids)} users")
        return {"status": "alert_sent", "count": len(chat_ids)}
    except Exception as e:
        logger.error(f"Failed to send accident alert: {e}")
        raise HTTPException(500, str(e))


@app.post("/api/events/clear")
def clear_all_events():
    """Clear all emergency/accident/rally events."""
    result = clear_events()
    logger.info("Events cleared")
    return result


@app.get("/api/events/status")
def get_events_status():
    """Get current coordination/event status."""
    return get_coordination_status()


# =============================================================================
# AUTH ENDPOINTS (NEW!)
# =============================================================================
@app.post("/api/auth/send-otp")
async def send_otp(req: OTPRequest):
    """Generate and send OTP via Telegram."""
    # Clean input: keep only digits and take last 10
    clean_phone = "".join(filter(str.isdigit, req.phone))[-10:]
    
    # Validation: must be 10 digits
    if len(clean_phone) != 10:
        raise HTTPException(400, "Please enter a valid 10-digit phone number")

    # Demo users bypass - allow login without Telegram registration
    demo_phones = ["9876543210", "8877665544", "7766554433"]
    if clean_phone in demo_phones:
        logger.info(f"Demo user {clean_phone} - skipping Telegram OTP, use password instead")
        return {"status": "sent", "message": "Demo account - use the password shown on login page as OTP."}

    otp = str(random.randint(100000, 999999))
    otp_store[clean_phone] = otp
    
    # Send via Telegram
    message = f"🔐 Your Yatayat Login OTP is: <b>{otp}</b>\n\nValid for 5 minutes."
    
    # Get registered users mapping (phone -> chat_id)
    user_mapping: Dict[str, int] = {}
    if CHATS_FILE.exists():
        try:
            with open(CHATS_FILE, 'r') as f:
                data = json.load(f)
                if isinstance(data, dict):
                    user_mapping = data
                else:
                    logger.warning("CHATS_FILE is not in the expected dictionary format.")
        except Exception as e:
            logger.error(f"Failed to load user mapping: {e}")
    
    chat_id = user_mapping.get(clean_phone)
    logger.info(f"Looking up {clean_phone} in mapping: {list(user_mapping.keys())}")
    
    if not chat_id:
        logger.warning(f"Phone {clean_phone} not registered on Telegram. Mapping size: {len(user_mapping)}")
        raise HTTPException(
            404, 
            f"Phone number {clean_phone} not registered with our Telegram bot. Please start the bot and share your contact first."
        )
    
    logger.info(f"Found chat_id {chat_id} for phone {clean_phone}. Sending message...")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(f"{TELEGRAM_API}/sendMessage", json={
                "chat_id": chat_id,
                "text": message,
                "parse_mode": "HTML"
            })
            logger.info(f"Telegram response: {resp.status_code} - {resp.text}")
            if resp.status_code != 200:
                logger.error(f"Telegram API error for {chat_id}: {resp.text}")
                raise HTTPException(502, "Failed to send OTP via Telegram")
                
        logger.info(f"OTP {otp} generated for {req.phone} and sent to chat {chat_id}")
        return {"status": "sent", "message": f"OTP sent to your registered Telegram account."}
        
    except Exception as e:
        logger.error(f"Failed to send to {chat_id}: {e}")
        raise HTTPException(500, f"Error sending OTP: {str(e)}")


@app.post("/api/auth/verify-otp")
def verify_otp(req: VerifyOTPRequest):
    """Verify OTP and return user role."""
    clean_phone = "".join(filter(str.isdigit, req.phone))[-10:]
    stored_otp = otp_store.get(clean_phone)
    
    # Demo credentials bypass - for testing without Telegram registration
    demo_users = {
        "9876543210": {"otp": "admin123", "role": "admin", "name": "Admin User"},
        "8877665544": {"otp": "user123", "role": "user", "name": "Demo User"},
        "7766554433": {"otp": "emp123", "role": "employee", "name": "Field Employee"},
    }
    
    # Check demo credentials first
    if clean_phone in demo_users and req.otp == demo_users[clean_phone]["otp"]:
        user = demo_users[clean_phone]
        return {
            "status": "success",
            "role": user["role"],
            "name": user["name"],
            "phone": clean_phone
        }
    
    # Standard OTP verification
    if not stored_otp or stored_otp != req.otp:
        raise HTTPException(401, "Invalid or expired OTP")
    
    # Identify role based on phone number
    admin_phones = ["9876543210", "8657525174", "7738314783"]
    employee_phones = ["7766554433", "7400916036"]  # Add more employee phones as needed
    
    if clean_phone in admin_phones:
        role = "admin"
        name = "Admin User"
    elif clean_phone in employee_phones:
        role = "employee"
        name = f"Field Employee ({clean_phone})"
    else:
        role = "user"
        name = f"User ({clean_phone})"
    
    # Clear OTP after use
    if clean_phone in otp_store:
        del otp_store[clean_phone]
    
    return {
        "status": "success",
        "role": role,
        "name": name,
        "phone": clean_phone
    }


# =============================================================================
# USER PROFILES & OFFICER REGISTRY
# =============================================================================
# Persistent user profiles (phone -> profile data)
user_profiles: Dict[str, dict] = {}

# Active officers registry (employees who have logged in)
active_officers: Dict[str, dict] = {}

# Employee assignments
employee_assignments: Dict[str, dict] = {}

# Employee Bot Token (for push notifications)
EMPLOYEE_BOT_TOKEN = os.environ.get("EMPLOYEE_BOT_TOKEN", "")
EMPLOYEE_BOT_API = f"https://api.telegram.org/bot{EMPLOYEE_BOT_TOKEN}" if EMPLOYEE_BOT_TOKEN else ""

class ProfileUpdate(BaseModel):
    name: str

class DispatchRequest(BaseModel):
    officer_phone: str
    incident_id: str
    incident_type: str
    message: str
    location: str
    lat: float
    lng: float

@app.get("/api/profile/{phone}")
def get_profile(phone: str):
    """Get user profile by phone number."""
    clean_phone = "".join(filter(str.isdigit, phone))[-10:]
    profile = user_profiles.get(clean_phone)
    if profile:
        return profile
    return {"phone": clean_phone, "name": None, "role": None}

@app.put("/api/profile/{phone}")
def update_profile(phone: str, update: ProfileUpdate):
    """Update user profile (name). Creates profile if doesn't exist."""
    clean_phone = "".join(filter(str.isdigit, phone))[-10:]
    
    if clean_phone not in user_profiles:
        user_profiles[clean_phone] = {"phone": clean_phone, "created_at": datetime.now().isoformat()}
    
    user_profiles[clean_phone]["name"] = update.name
    user_profiles[clean_phone]["updated_at"] = datetime.now().isoformat()
    
    # Also update officer registry if they're an officer
    if clean_phone in active_officers:
        active_officers[clean_phone]["name"] = update.name
    
    logger.info(f"Updated profile for {clean_phone}: name={update.name}")
    return {"status": "updated", "profile": user_profiles[clean_phone]}

@app.post("/api/officers/register")
def register_officer(phone: str, name: str = "Field Officer"):
    """Register an employee as an active officer (called on login)."""
    clean_phone = "".join(filter(str.isdigit, phone))[-10:]
    
    # Check if profile has a custom name
    profile_name = name
    if clean_phone in user_profiles and user_profiles[clean_phone].get("name"):
        profile_name = user_profiles[clean_phone]["name"]
    
    active_officers[clean_phone] = {
        "phone": clean_phone,
        "name": profile_name,
        "status": "available",
        "registered_at": datetime.now().isoformat(),
        "last_seen": datetime.now().isoformat()
    }
    logger.info(f"Officer registered: {clean_phone} ({profile_name})")
    return {"status": "registered", "officer": active_officers[clean_phone]}

@app.get("/api/officers")
def list_officers():
    """List all registered officers for admin dashboard."""
    officers = []
    for phone, data in active_officers.items():
        # Check if officer has an active assignment
        has_assignment = phone in employee_assignments
        officers.append({
            **data,
            "status": "busy" if has_assignment else "available",
            "current_assignment": employee_assignments.get(phone)
        })
    return {"officers": officers, "count": len(officers)}

@app.get("/api/officers/{phone}/status")
def get_officer_status(phone: str):
    """Get status of a specific officer."""
    clean_phone = "".join(filter(str.isdigit, phone))[-10:]
    if clean_phone not in active_officers:
        raise HTTPException(404, "Officer not found")
    
    officer = active_officers[clean_phone]
    officer["status"] = "busy" if clean_phone in employee_assignments else "available"
    return officer

@app.post("/api/dispatch")
async def dispatch_officer(req: DispatchRequest):
    """Admin dispatches an incident to an officer with optional Telegram notification."""
    import uuid
    clean_phone = "".join(filter(str.isdigit, req.officer_phone))[-10:]
    
    # Validate officer exists
    if clean_phone not in active_officers:
        raise HTTPException(404, f"Officer {clean_phone} not found in registry")
    
    # Create assignment
    assignment = {
        "id": str(uuid.uuid4())[:8],
        "incident_id": req.incident_id,
        "incident_type": req.incident_type,
        "message": req.message,
        "location": req.location,
        "coordinates": {"lat": req.lat, "lng": req.lng},
        "timestamp": datetime.now().isoformat(),
        "status": "pending"
    }
    employee_assignments[clean_phone] = assignment
    
    # Update the linked incident status to 'assigned' in shared storage
    for incident in shared_incidents:
        if incident.get("id") == req.incident_id:
            incident["status"] = "assigned"
            if "assignedOfficers" not in incident:
                incident["assignedOfficers"] = []
            incident["assignedOfficers"].append(clean_phone)
            if "notes" not in incident:
                incident["notes"] = []
            incident["notes"].append(f"Officer {active_officers.get(clean_phone, {}).get('name', clean_phone)} dispatched")
            logger.info(f"Incident {req.incident_id} status updated to 'assigned'")
            break
    
    # Send Telegram notification if employee bot is configured
    telegram_sent = False
    if EMPLOYEE_BOT_API:
        # Get chat_id from registered chats
        chat_id = None
        if CHATS_FILE.exists():
            try:
                with open(CHATS_FILE, 'r') as f:
                    chats = json.load(f)
                    chat_id = chats.get(clean_phone)
            except Exception as e:
                logger.error(f"Failed to load chats: {e}")
        
        if chat_id:
            message = (
                f"🚨 <b>NEW ASSIGNMENT</b>\n\n"
                f"<b>Type:</b> {req.incident_type.upper()}\n"
                f"<b>Details:</b> {req.message}\n"
                f"<b>Location:</b> {req.location}\n\n"
                f"📍 <a href='https://www.google.com/maps/dir/?api=1&destination={req.lat},{req.lng}'>Navigate Now</a>\n\n"
                f"Open your dashboard to mark complete."
            )
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.post(f"{EMPLOYEE_BOT_API}/sendMessage", json={
                        "chat_id": chat_id,
                        "text": message,
                        "parse_mode": "HTML"
                    })
                    telegram_sent = resp.status_code == 200
                    logger.info(f"Telegram notification sent to {clean_phone}: {telegram_sent}")
            except Exception as e:
                logger.error(f"Failed to send Telegram notification: {e}")
    
    officer_name = active_officers[clean_phone].get("name", clean_phone)
    logger.info(f"Dispatched incident {req.incident_id} to officer {officer_name} ({clean_phone})")
    
    return {
        "status": "dispatched",
        "assignment": assignment,
        "officer": officer_name,
        "telegram_notified": telegram_sent
    }

@app.get("/api/assignments/{phone}")
def get_assignment(phone: str):
    """Get current assignment for an employee by phone number."""
    clean_phone = "".join(filter(str.isdigit, phone))[-10:]
    
    # Update last_seen for officer
    if clean_phone in active_officers:
        active_officers[clean_phone]["last_seen"] = datetime.now().isoformat()
    
    assignment = employee_assignments.get(clean_phone)
    if assignment:
        return assignment
    return {}

@app.post("/api/assignments/{assignment_id}/complete")
def complete_assignment(assignment_id: str):
    """Mark an assignment as complete and update linked incident to resolved."""
    for phone, assignment in list(employee_assignments.items()):
        if assignment.get("id") == assignment_id:
            incident_id = assignment.get("incident_id")
            
            # Remove the assignment
            del employee_assignments[phone]
            logger.info(f"Assignment {assignment_id} completed by {phone}")
            
            # Also update the linked incident status to 'resolved'
            if incident_id:
                for incident in shared_incidents:
                    if incident.get("id") == incident_id:
                        incident["status"] = "resolved"
                        incident["resolvedAt"] = datetime.now().isoformat()
                        incident["resolvedBy"] = phone
                        if "notes" not in incident:
                            incident["notes"] = []
                        incident["notes"].append(f"Resolved by officer {phone}")
                        logger.info(f"Incident {incident_id} marked as resolved")
                        break
            
            return {
                "status": "resolved", 
                "id": assignment_id,
                "incident_id": incident_id,
                "message": "Incident marked as resolved"
            }
    return {"status": "not_found", "id": assignment_id}


class BackupRequest(BaseModel):
    requester_phone: str
    requester_name: str = "Officer"
    location: str
    lat: float = 19.07
    lng: float = 72.87
    incident_id: Optional[str] = None
    message: str = "BACKUP REQUESTED"

@app.post("/api/backup/request")
async def request_backup(req: BackupRequest):
    """Send backup request to all available officers via Telegram."""
    requester_phone = "".join(filter(str.isdigit, req.requester_phone))[-10:]
    
    # Find all available officers except the requester
    available = [
        (phone, data) for phone, data in active_officers.items()
        if phone != requester_phone and data.get("status") == "available"
    ]
    
    if not available:
        return {"status": "no_officers", "notified_count": 0, "message": "No available officers to notify"}
    
    notified = 0
    
    # Send Telegram notification to each available officer
    if EMPLOYEE_BOT_API:
        # Load chat IDs from registration file
        chat_file = SCRIPT_DIR / "telegram_bot" / "login_registered_chats.json"
        chat_ids = {}
        if chat_file.exists():
            try:
                with open(chat_file) as f:
                    chat_ids = json.load(f)
            except:
                pass
        
        backup_message = f"""🚨 <b>BACKUP REQUESTED</b>

<b>Officer:</b> {req.requester_name}
<b>Phone:</b> {requester_phone}

<b>Location:</b> {req.location}

<a href="https://www.google.com/maps/dir/?api=1&destination={req.lat},{req.lng}">📍 Navigate to Location</a>

<i>Respond immediately if available!</i>"""

        for phone, data in available:
            chat_id = chat_ids.get(phone)
            if chat_id:
                try:
                    async with httpx.AsyncClient() as client:
                        await client.post(
                            f"{EMPLOYEE_BOT_API}/sendMessage",
                            json={
                                "chat_id": chat_id,
                                "text": backup_message,
                                "parse_mode": "HTML"
                            },
                            timeout=5.0
                        )
                        notified += 1
                except Exception as e:
                    logger.warning(f"Failed to notify {phone}: {e}")
    
    logger.info(f"Backup request from {req.requester_name} - notified {notified}/{len(available)} officers")
    
    return {
        "status": "sent",
        "notified_count": notified,
        "available_count": len(available),
        "message": f"Backup request sent to {notified} officers"
    }

# =============================================================================
# SHARED INCIDENT/ALERT STORAGE (Cross-Device Sync)
# =============================================================================
# In-memory storage - persists as long as server is running
shared_incidents = []
shared_alerts = []

class IncidentCreate(BaseModel):
    """Model for creating incidents from frontend"""
    id: str
    type: str  # 'accident', 'breakdown', 'sos', etc.
    severity: str  # 'low', 'medium', 'high', 'critical'
    status: str = "reported"
    location: dict  # {coordinates: [lat, lon], address: str, landmark: str}
    reportedBy: str
    reporterPhone: str = None
    reportedAt: str
    description: str
    affectedLanes: int = 0
    notes: list = []

class AlertCreate(BaseModel):
    """Model for creating alerts from frontend"""
    id: str
    type: str  # 'incident', 'violation', 'system', etc.
    priority: str  # 'low', 'medium', 'high', 'critical'
    message: str
    location: str = None
    coordinates: list = None
    reporterPhone: str = None
    timestamp: str
    read: bool = False

@app.get("/api/incidents")
async def get_incidents():
    """Get all shared incidents"""
    return {"incidents": shared_incidents}

@app.post("/api/incidents")
async def add_incident(incident: IncidentCreate):
    """Add a new incident (SOS, accident, etc.) - syncs across all devices"""
    incident_dict = incident.dict()
    shared_incidents.insert(0, incident_dict)
    if len(shared_incidents) > 100:
        shared_incidents.pop()
    logger.info(f"🆘 New incident added: {incident.id} ({incident.type}) - Total: {len(shared_incidents)}")
    return {"status": "added", "id": incident.id}

@app.delete("/api/incidents")
async def clear_all_incidents():
    """Clear all shared incidents"""
    global shared_incidents
    shared_incidents = []
    logger.info("🆘 All incidents cleared")
    return {"status": "cleared"}

@app.delete("/api/incidents/{incident_id}")
async def delete_incident(incident_id: str):
    """Remove an incident"""
    global shared_incidents
    shared_incidents = [i for i in shared_incidents if i.get("id") != incident_id]
    return {"status": "deleted", "id": incident_id}

@app.get("/api/alerts")
async def get_alerts():
    """Get all shared alerts"""
    return {"alerts": shared_alerts}

@app.post("/api/alerts")
async def add_alert(alert: AlertCreate):
    """Add a new alert - syncs across all devices"""
    alert_dict = alert.dict()
    shared_alerts.insert(0, alert_dict)
    if len(shared_alerts) > 100:
        shared_alerts.pop()
    logger.info(f"🔔 New alert added: {alert.id} ({alert.priority}) - Total: {len(shared_alerts)}")
    return {"status": "added", "id": alert.id}

@app.patch("/api/alerts/{alert_id}/read")
async def mark_alert_read(alert_id: str):
    """Mark an alert as read"""
    for alert in shared_alerts:
        if alert.get("id") == alert_id:
            alert["read"] = True
            return {"status": "updated", "id": alert_id}
    raise HTTPException(404, f"Alert {alert_id} not found")

@app.delete("/api/alerts")
async def clear_all_alerts():
    """Clear all shared alerts"""
    global shared_alerts
    shared_alerts = []
    logger.info("🔔 All alerts cleared")
    return {"status": "cleared"}

@app.delete("/api/alerts/{alert_id}")
async def delete_alert(alert_id: str):
    """Remove an alert"""
    global shared_alerts
    shared_alerts = [a for a in shared_alerts if a.get("id") != alert_id]
    return {"status": "deleted", "id": alert_id}


# =============================================================================
# MAIN
# =============================================================================
if __name__ == "__main__":
    import uvicorn
    print("Enhanced MAPPO Traffic Simulation Server")
    print("=" * 50)
    print(f"   Device: {DEVICE}")
    print(f"   JSON: {JSON_PATH}")
    print(f"   Policy: {CHECKPOINT_PATH}")
    print(f"   Port: 8766")
    print("=" * 50)
    print("NEW ENDPOINTS:")
    print("   POST /api/events/emergency - Set emergency vehicle")
    print("   POST /api/events/accident  - Set accident")
    print("   POST /api/events/rally     - Set rally")
    print("   POST /api/events/clear     - Clear all events")
    print("   GET  /api/events/status    - Get event status")
    print("   GET  /api/incidents        - Get all SOS/incidents")
    print("   POST /api/incidents        - Add SOS/incident")
    print("   GET  /api/alerts           - Get all alerts")
    print("   POST /api/alerts           - Add alert")
    print("=" * 50)
    uvicorn.run(app, host="0.0.0.0", port=8766)

