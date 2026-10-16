# WiCare — Wireless ICU Patient Monitoring System

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0-green.svg)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black.svg)](https://nextjs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-4.26-black.svg)](https://fastify.dev/)
[![MQTT](https://img.shields.io/badge/MQTT-v3.1.1%2Fv5.0-orange.svg)](https://mqtt.org/)
[![Prisma](https://img.shields.io/badge/Prisma-MySQL%208.0-teal.svg)](https://www.prisma.io/)
[![Tests](https://img.shields.io/badge/Tests-147%20passed-brightgreen.svg)](https://vitest.dev/)

**WiCare** is an offline-capable, communication-aware wireless ICU patient-monitoring and telemetry platform. It features real-time MQTT telemetry, network impairment emulation (packet loss, delay, jitter, drop-oldest ring buffering), dynamic clinical alerts, a comprehensive clinical EHR dashboard, an Indian patient cohort, and a standalone Telemetry Simulator Studio with interactive vital sliders.

---

## 🏛️ System Architecture

WiCare is built as a multi-tier, decoupled distributed platform designed for high resilience and zero single point of failure in critical care environments:

```mermaid
flowchart TB
    subgraph Simulator["Standalone Simulator Studio (:4001)"]
        PatSim["Virtual ICU Patient Generator (50 Profiles)"]
        Sliders["Interactive Bed & Vital Sliders"]
        NetEmul["Network Emulator (0–50% Loss, Jitter, Drops)"]
        RingBuf["Bounded Ring Buffer (Drop-Oldest)"]
        PatSim --> Sliders --> NetEmul --> RingBuf
    end

    subgraph Broker["MQTT Broker (TCP :1883)"]
        Mqtt["Embedded Aedes / External Mosquitto Broker"]
        RoutineTopic["wicare/+/+/+/vitals (QoS 0 Routine)"]
        CriticalTopic["wicare/+/+/+/vitals/critical (QoS 1 Priority)"]
        StatusTopic["wicare/+/+/+/status (QoS 1 LWT)"]
        Mqtt --- RoutineTopic
        Mqtt --- CriticalTopic
        Mqtt --- StatusTopic
    end

    subgraph Backend["Central API Server (:4000)"]
        Fastify["Fastify Ingest Server"]
        MqttSub["MQTT Ingest Subscriber"]
        DevReg["Device Registry & AoI Tracker"]
        DropRec["Sequence Gap & MQTT Drop Recorder"]
        AlertEngine["AlertEngine (Multi-Vital Hysteresis)"]
        Explainer["Gemini Clinical Decision Explainer"]
        MySQL[(MySQL 8.0 Database via Prisma)]
        SocketIO["Socket.IO Live Telemetry Dispatch"]

        MqttSub --> DevReg --> DropRec
        MqttSub --> AlertEngine
        MqttSub --> MySQL
        DevReg --> SocketIO
        AlertEngine --> SocketIO
        Fastify --> Explainer
    end

    subgraph Client["Clinical Web Dashboard (:3000)"]
        Ward["ICU Ward Overview (Bed Cards)"]
        Workstation["Split-Canvas Workstation"]
        Waveforms["Real-time Waveforms (ECG, SpO2 Pleth, Resp)"]
        EHRModal["4-Tab Clinical EHR Modal"]
        DropsUI["MQTT Packet Drop Recorder UI"]
    end

    RingBuf -->|MQTT Telemetry| Broker
    Broker -->|Ingest Stream| MqttSub
    SocketIO -->|WebSocket Real-time| Client
    Fastify <-->|REST API + JWT Auth| Client
```

---

## 🌟 Key Features

1. **Decoupled Architecture**: Telemetry simulation is completely separated from the hospital clinic hub. Run each independently across processes or physical machines.
2. **Interactive Simulator Studio (`http://localhost:4001`)**:
   - **Left Sidebar**: Real-time roster of all active ICU beds with patient profiles and vital badges.
   - **Right Control Panel**: Interactive live sliders for **Heart Rate (30–200 bpm)**, **SpO₂ (60–100%)**, **Temperature (34–42 °C)**, and **Respiratory Rate (4–45 brpm)**. Moving a slider immediately broadcasts the update over MQTT.
   - **Clinical Scenario Injector**: Inject acute events (tachycardia, bradycardia, hypoxia, septic shock, hypothermia) with one click.
3. **Clinical EHR Web Dashboard (`http://localhost:3000`)**:
   - Modeled after authentic hospital ICU monitors with dark-mode telemetry aesthetics.
   - Monitored bed cards displaying Indian names (*Rajesh Sharma, Sunita Patel, Vikram Verma...*), UHIDs (`UHID-IND-2026-1001`+), blood groups, primary ICU diagnoses, attending doctors, and live telemetry metrics.
   - **Comprehensive 4-Tab EHR Modal**: Click any bed to inspect:
     - **Tab 1: Live Telemetry & Waveforms** (Real-time ECG Lead II, PPG Pleth, and Respiration waves).
     - **Tab 2: Diagnostic Labs & Biomarkers** (Arterial Blood Gas pH, Serum Lactate, Hb, Creatinine, Electrolytes, BP, Glucose).
     - **Tab 3: Medical History & Comorbidities** (Allergies, chronic conditions, admission date).
     - **Tab 4: Clinical Round Notes** (Consultant evaluations and telemetry calibration notes).
4. **Communication-Aware Network Stack**:
   - Embedded **Aedes MQTT Broker** on TCP port `1883` (or standalone Mosquitto).
   - Routine telemetry published over `wicare/+/+/+/vitals` (QoS 0).
   - Acute deterioration alarms dispatched over high-priority topics with **QoS 1**.
   - Bounded ring buffering with `drop-oldest` policy during broker disconnection windows.
   - Real-time Age of Information (AoI) and packet loss calculation.
5. **Authentic Indian ICU Patient Cohort**: 50 pre-seeded clinical patient profiles curated with Indian names, UHIDs, doctors, comorbidities, and baseline diagnostic panels.
6. **Role-Based Access Control (RBAC)**: Secure authentication with `scrypt` password hashing and signed JWT tokens:
   - **`admin`**: Full control (thresholds, alarms, simulation settings).
   - **`clinician`**: Clinical operations (acknowledge/resolve alarms, view EHR, use explainer).
   - **`viewer`**: Read-only monitoring dashboard.

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js**: `>= 20.0.0`
- **npm**: `>= 10.0.0`
- **MySQL Server**: 8.0+ running on port `3306`

### 1. Installation
Clone the repository and install all workspace dependencies:
```powershell
npm install
npm run predev
```

### 2. Environment Setup
Copy the template environment file:
```powershell
cp .env.example .env
```
Ensure `DATABASE_URL` in `.env` matches your MySQL username and password:
```ini
DATABASE_URL=mysql://root:your_mysql_password@localhost:3306/wicare
```

### 3. Database Migration & Seeding
Synchronize the Prisma schema and seed default clinical accounts and 50 patient records:
```powershell
npm run db:push
npm run db:seed
```

---

## 🏃 Running the Application

### Option A: Run Everything Concurrently (Recommended for Testing)
```powershell
npm run dev:all
```
This single command starts:
- Fastify Backend API & Embedded MQTT Broker (`http://localhost:4000`, `mqtt://localhost:1883`)
- Clinical Next.js Web Dashboard (`http://localhost:3000`)
- Standalone Patient Simulator Studio (`http://localhost:4001`)

### Option B: Run in Separate Modular Terminals

#### Terminal 1: Hospital Core System (API + MQTT Broker + Web UI)
```powershell
npm run dev:app
```

#### Terminal 2: Telemetry Simulator Studio
```powershell
npm run simulator
```

---

## 📱 Mobile & Tablet Access (Over Local Wi-Fi)

All services bind to `0.0.0.0`, allowing clinical monitoring on phones or tablets connected to the **same Wi-Fi network**.

1. Find your host computer's Wi-Fi IP using `ipconfig` (e.g. `192.168.1.50`).
2. If using Windows Defender Firewall, allow incoming traffic on ports `3000, 4000, 4001, 1883`:
   ```powershell
   New-NetFirewallRule -DisplayName "WiCare Local Network" -Direction Inbound -LocalPort 3000,4000,4001,1883 -Protocol TCP -Action Allow
   ```
3. Open on your mobile device:
   - **Clinical Dashboard**: `http://<YOUR_COMPUTER_IP>:3000`
   - **Simulator Studio**: `http://<YOUR_COMPUTER_IP>:4001`
   - **MQTT Packet Drops Recorder**: `http://<YOUR_COMPUTER_IP>:3000/mqtt-drops`

> For full details, multi-device walk-through, and mobile connection troubleshooting, consult **[GUIDE.md](file:///d:/My_Projects/WMC_Project/GUIDE.md)**.

---

## 🔐 Default Demo Accounts

| Role | Email | Password | Permissions |
| :--- | :--- | :--- | :--- |
| **`admin`** | `admin@wicare.local` | `AdminPass123!` | Full control: Edit clinical thresholds, manage simulation, acknowledge/resolve alarms. |
| **`clinician`** | `clinician@wicare.local` | `ClinicianPass123!` | Clinical operations: Acknowledge & resolve alarms, view full EHR, clinical explainer. |
| **`viewer`** | `viewer@wicare.local` | `ViewerPass123!` | Read-only observation dashboard. |

---

## 🚢 Production Deployment

### 1. Build Production Bundles
Build all shared packages, backend services, simulator, and Next.js frontend:
```powershell
npm run build
```

### 2. Configure Production Environment
Create a production `.env` file with secure database credentials, logging level, and proper hosts:
```ini
NODE_ENV=production
API_PORT=4000
API_HOST=0.0.0.0
LOG_LEVEL=warn
MQTT_URL=mqtt://127.0.0.1:1883
DATABASE_URL=mysql://wicare_user:StrongPassword123!@127.0.0.1:3306/wicare
WEB_PORT=3000
NEXT_PUBLIC_API_URL=http://your-hospital-domain.com:4000
GEMINI_API_KEY=your_production_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
```

### 3. Run with PM2 Process Manager
```powershell
npm install -g pm2

# Start Backend API & Embedded Broker
pm2 start apps/api/dist/server.js --name "wicare-api"

# Start Next.js Frontend
pm2 start apps/web/node_modules/next/dist/bin/next --name "wicare-web" -- start apps/web -p 3000

# (Optional) Start Simulator Service
pm2 start simulator/service/dist/index.js --name "wicare-simulator"
```

### 4. Docker Deployment
To run an Eclipse Mosquitto broker container:
```powershell
docker compose up -d
```

---

## 🧪 Testing & Verification

WiCare includes an automated Vitest test suite with deterministic mocks:
```powershell
# Run all 147 unit, integration, and scenario tests
npm test

# Run strict TypeScript typecheck across all packages
npm run typecheck

# Run code linter
npm run lint
```

---

## 📁 Repository Structure

```
├── .env.example                     # Environment configuration template
├── ARCHITECTURE.md                  # Detailed architectural & protocol specification
├── GUIDE.md                         # Complete operator run & mobile connectivity guide
├── README.md                        # Project overview and quickstart
├── docker-compose.yml               # Eclipse Mosquitto container configuration
│
├── apps/
│   ├── api/                         # Fastify REST API, Socket.IO & Embedded MQTT Broker (:4000, :1883)
│   │   ├── prisma/                  # MySQL schema definition and Indian patient seeder
│   │   ├── src/                     # Ingest subscriber, AlertEngine, DeviceRegistry, Auth
│   │   └── tests/                   # API, RBAC, AlertEngine, and MQTT integration test suites
│   └── web/                         # Next.js Clinical ICU Web Dashboard (:3000)
│       └── src/components/          # BedCard, DashboardClient, PatientDetailModal (4-tab EHR), Waveforms
│
├── simulator/
│   ├── service/                     # Simulator Studio Web UI (:4001)
│   ├── patient-generator/           # Virtual Patient Telemetry Engine (MQTT publisher)
│   ├── scenarios/                   # Clinical scenarios (stable, deterioration, sepsis, hypoxia)
│   └── network-emulator/            # Packet loss, delay, and jitter simulation models
│
└── packages/
    └── shared/                      # Types, schemas, and 50 Indian patient records
```

---

## 📄 License & Advisory

WiCare is designed for clinical telemetry research, medical informatics training, and hospital wireless communications simulation. All synthetic patient records use fictional demographic profiles. AI clinical explanations are advisory decision support and do not constitute autonomous medical diagnoses.