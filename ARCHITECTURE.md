# WiCare System Architecture & Technical Specification

> **WiCare**: A Communication-Aware, Wireless Patient Telemetry & ICU Clinical Monitoring Platform.
> Fully local, offline-capable, decoupled simulation architecture with MQTT telemetry, network behavior emulation, real-time EHR dashboards, and adaptive transmission.

---
  
## 1. High-Level System Architecture

WiCare is built as a multi-tier, decoupled distributed system where medical telemetry sources, message brokers, clinical ingest servers, and user interfaces operate independently:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        STANDALONE SIMULATOR STUDIO (:4001)                             │
│  ┌─────────────────────────────────┐   ┌────────────────────────────────────────────┐  │
│  │     Left Sidebar (Bed List)     │   │     Right Control Panel (Interactive)      │  │
│  │  • B-1: Rajesh Sharma (UHID..)  │──▶│  • HR Slider (30–200 bpm)                  │  │
│  │  • B-2: Sunita Patel (UHID..)   │   │  • SpO2 Slider (60–100%)                   │  │
│  │  • B-3: Vikram Verma (UHID..)   │   │  • Temp Slider (34–42 °C)                  │  │
│  │  • B-4: Ananya Iyer (UHID..)    │   │  • RR Slider (4–45 brpm)                   │  │
│  │  • B-5: Amit Kumar (UHID..)     │   │  • Scenario Selectors & Threshold Breaches │  │
│  └─────────────────────────────────┘   └────────────────────────────────────────────┘  │
│                                           │                                            │
│                      ┌────────────────────┴────────────────────┐                       │
│                      │   Virtual Patient Nodes (P-001..P-050)  │                       │
│                      │  • Network Emulator (Loss/Delay/Jitter) │                       │
│                      │  • Bounded Ring Buffer (Drop-Oldest)    │                       │
│                      │  • Adaptive Transmission Engine         │                       │
│                      └────────────────────┬────────────────────┘                       │
└───────────────────────────────────────────┼────────────────────────────────────────────┘
                                            │ MQTT Publish (Port 1883)
                                            │ QoS 0: Routine Telemetry
                                            │ QoS 1: Critical Alarms & Vitals
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          CENTRAL API & BROKER SERVICE (:4000)                          │
│                                                                                        │
│   ┌────────────────────────────────────────────────────────────────────────────────┐   │
│   │              Embedded Aedes MQTT Broker (TCP 0.0.0.0:1883)                     │   │
│   └───────────────────────────────────────┬────────────────────────────────────────┘   │
│                                           │ Ingest Pipeline                            │
│                                           ▼                                            │
│   ┌────────────────────────────────────────────────────────────────────────────────┐   │
│   │  MqttSubscriber Ingest Engine                                                  │   │
│   │  ├── DeviceRegistry (AoI calculation, packet loss tracking, online/stale/offline)│  │
│   │  ├── ReadingBatcher (Debounced database writes via Prisma)                     │   │
│   │  ├── AlertEngine (Multi-vital clinical rules + Threshold evaluations)          │   │
│   │  └── SocketServer (Low-latency bi-directional WebSocket dispatch)              │   │
│   └───────────────────────────────────────┬────────────────────────────────────────┘   │
│                                           │                                            │
│         ┌─────────────────────────────────┼──────────────────────────────────┐         │
│         ▼                                 ▼                                  ▼         │
│   Fastify HTTP REST                 MySQL 8.0 Database               Socket.IO Server  │
│   • /patients (Indian dataset)      • Patient, Device                (Live Telemetry & │
│   • /patients/:id/readings          • Reading, Alert, Threshold      Alert Push)       │
│   • /auth (RBAC: JWT + scrypt)      • User (admin/clinician/viewer)                    │
└───────────────────────────────────────────┬──────────────────────────────────┬─────────┘
                                            │                                  │
                                            │ HTTP Fetch                       │ WebSocket
                                            ▼                                  ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        CLINICAL EHR WEB DASHBOARD (:3000)                              │
│                                                                                        │
│   ┌────────────────────────────────────────────────────────────────────────────────┐   │
│   │  Ward View (Indian ICU Patient Bed Cards)                                      │   │
│   │  • Bed Tag, UHID, Indian Patient Name, Age/Gender, Blood Group                 │   │
│   │  • Attending Doctor, Primary Diagnosis, Wireless Link Health, Measured Loss    │   │
│   │  • Live Numeric Vitals (HR, SpO2, Temp, RR) with Threshold Badges              │   │
│   └───────────────────────────────────────┬────────────────────────────────────────┘   │
│                                           │ Clicking any Bed opens EHR Modal           │
│                                           ▼                                            │
│   ┌────────────────────────────────────────────────────────────────────────────────┐   │
│   │  Patient Detail Clinical EHR Modal (4 Comprehensive Tabs)                      │   │
│   │  ├── Tab 1: Live Telemetry (Real-time ECG, Pleth, Respiration Waveforms)       │   │
│   │  ├── Tab 2: Diagnostic Labs (ABG pH, Lactate, Hb, Creatinine, Electrolytes)    │   │
│   │  ├── Tab 3: Medical History (Documented Allergies, Chronic Comorbidities)      │   │
│   │  └── Tab 4: Clinical Notes (Doctor Round Updates, Telemetry Calibration Notes) │   │
│   └────────────────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Decoupled Architecture

The project is split into two autonomous, independently deployable systems:

### 2.1 The Central Medical Monitoring System (`apps/api` + `apps/web`)
* **Ports**:
  * `1883`: Embedded Aedes MQTT broker (accepts incoming telemetry packets from devices).
  * `4000`: Fastify REST API and Socket.IO real-time engine.
  * `3000`: Next.js Clinical ICU Web Dashboard.
* **Execution**: `npm run dev:app`
* **Role**: Ingests telemetry, detects clinical threshold violations, tracks network Age of Information, stores readings in MySQL, and provides hospital staff with a clinical EHR view.

### 2.2 The Standalone Simulator Studio (`simulator/service`)
* **Port**: `4001`
* **Execution**: `npm run simulator`
* **Role**: Simulates wireless medical telemetry devices. Features an interactive **Master-Detail web interface**:
  * **Left Sidebar**: Real-time list of all patient beds with current vital badges and scenarios.
  * **Right Panel**: Real-time sliders for Heart Rate, SpO2, Temperature, and Respiratory Rate. Adjusting any slider publishes an immediate MQTT packet over port 1883 to the broker.

---

## 3. Communication & Telemetry Stack

### 3.1 MQTT Topic Topology

| Topic Format | QoS | Payload Type | Description |
| :--- | :---: | :--- | :--- |
| `wicare/{ward}/{bedId}/{deviceId}/vitals` | 0 | `TelemetryPacket` | Routine sensor readings (published at 1000ms intervals by default). |
| `wicare/{ward}/{bedId}/{deviceId}/vitals/critical` | 1 | `TelemetryPacket` | Priority telemetry dispatched during acute deterioration (HR > 120, SpO2 < 90%). Bypasses standard delay queues. |
| `wicare/{ward}/{bedId}/{deviceId}/status` | 1 | `DeviceStatusPayload` | Heartbeat & connection status (`online` / `offline`). Registered with MQTT **Last Will and Testament (LWT)**. |
| `wicare/{ward}/{bedId}/{deviceId}/alerts` | 1 | `DeviceAlertPayload` | High-priority edge-triggered sensor anomalies and alarms. |

### 3.2 Telemetry Packet Schema (`TelemetryPacket`)
Each telemetry transmission consists of a JSON packet:
```typescript
interface TelemetryPacket {
  deviceId: string;       // e.g. "DEV-001"
  patientId: string;      // e.g. "P-001"
  bedId: string;          // e.g. "B-1"
  ward: string;           // e.g. "ICU"
  seq: number;            // Monotonically increasing sequence number
  timestamp: string;      // ISO-8601 UTC timestamp
  vitals: {
    heart_rate:       { value: number; unit: "bpm";  quality: "normal" | "low" | "high" };
    spo2:             { value: number; unit: "%";    quality: "normal" | "low" | "high" };
    temperature:      { value: number; unit: "C";    quality: "normal" | "low" | "high" };
    respiratory_rate: { value: number; unit: "brpm"; quality: "normal" | "low" | "high" };
  };
  waveforms?: {
    ecg: number[];        // Synthetic Lead II voltage points (mV)
    pleth: number[];      // Photoplethysmogram wave points
    resp: number[];       // Thoracic impedance respiration wave
  };
  priority?: "normal" | "critical";
  qos?: 0 | 1;
}
```

### 3.3 Network Emulation Layer
Virtual patient nodes feature a software network emulator that injects real-world wireless network impairments:
1. **Packet Loss**: Probabilistic drop filter (0% to 50% simulated loss).
2. **Fixed Delay & Jitter**: Configurable transit latency with Gaussian/uniform jitter.
3. **Disconnection Windows**: Simulates temporary Wi-Fi dead-zones or roaming interruptions.
4. **Bounded Buffer with `drop-oldest`**:
   - Up to 100 packets are stored in local ring memory during broker disconnects.
   - If buffer capacity is reached, stale routine telemetry is dropped, preserving the most recent readings.
   - Upon reconnection, pending critical alerts and latest vitals are flushed first.

---

## 4. Adaptive Transmission & Age of Information (AoI)

WiCare incorporates a communication-aware adaptive strategy to balance channel utilization with patient safety:

### 4.1 Age of Information (AoI) Metric
AoI measures the data freshness of a bed from the central station's perspective:
$$\Delta(t) = t - U(t)$$
Where $t$ is the current wall-clock time and $U(t)$ is the generation timestamp of the most recently received telemetry packet for that patient. If $\Delta(t) > 15\text{s}$, the bed is flagged as **STALE**.

### 4.2 Adaptive Transmission Dynamics
1. **Clinical Acceleration**: If vitals breach clinical safety thresholds (e.g. SpO2 < 90% or HR > 130), the reporting interval dynamically accelerates from **1000ms down to 300ms** to provide fine-grained telemetry to clinicians.
2. **Congestion Backoff**: If measured packet loss exceeds 15% across the ward, routine telemetry throttles back (e.g., to 2000ms), reserving available bandwidth exclusively for critical alarms.

---

## 5. Indian Patient Dataset & EHR Architecture

WiCare comes pre-seeded with 50 clinically authentic Indian ICU patient records (`packages/shared/src/indian-patients.ts`):

* **Demographics**: Realistic Indian names (*Rajesh Sharma, Sunita Patel, Vikram Verma, Ananya Iyer, Amit Kumar, Priya Nair, Suresh Menon...*), ages (22–78), genders, and blood groups (A+, B+, O+, AB+, A-, B-, O-, AB-).
* **UHIDs**: Standard Indian Unique Health Identifier format (`UHID-IND-2026-1001` through `1050`).
* **Attending Physicians**: Realistic Indian clinical consultants (*Dr. Arvind Mehta - MD DM Cardiology, Dr. Sneha Kulkarni - MD FNB Critical Care, Dr. Rajeshwari Sen - MD DNB Pulmonology...*).
* **ICU Diagnoses**:
  * *Acute Anterior Wall STEMI - Post Primary PCI*
  * *Severe Pneumonia with Acute Respiratory Failure*
  * *Exacerbation of COPD with Type 2 Respiratory Failure*
  * *Septic Shock secondary to Urosepsis*
  * *Post-Operative CABG Recovery (Day 2)*
  * *Acute Pancreatitis with Multi-Organ Dysfunction Syndrome (MODS)*
* **Baseline Lab Panels**:
  * Arterial Blood Gas (ABG): Arterial pH (7.28–7.42), Serum Lactate (0.9–3.2 mmol/L)
  * Hematology & Renal: Hemoglobin (8.5–14.5 g/dL), Serum Creatinine (0.8–2.6 mg/dL)
  * Serum Electrolytes: Sodium ($Na^+$: 135–144 mEq/L), Potassium ($K^+$: 3.8–4.9 mEq/L)
  * Hemodynamics: Non-invasive Blood Pressure (e.g., `110/70 mmHg`), Random Blood Glucose (e.g., `135 mg/dL`)
* **Medical History**: Comorbidities (Type 2 Diabetes Mellitus, Essential Hypertension, CKD, Asthma) and Drug Allergies (Penicillin, Sulfa, NSAIDs, NKDA).
* **Clinical Round Notes**: Dated consultant round notes, ICU assessments, and telemetry calibration logs.

---

## 6. Clinical EHR Dashboard Architecture (`apps/web`)

The Next.js 14 frontend renders the central nursing station:

### 6.1 Live ICU Ward Overview
* Displays bed cards for all actively transmitting patients.
* Real-time numeric tiles for **Heart Rate**, **SpO2**, **Temperature**, and **Respiratory Rate**.
* **Clinical Threshold Badges**: Green for normal, amber for warning, pulsing red for critical breaches.
* **Network Health Indicators**: Sequence number tracking, total received packets, and measured packet loss rate.

### 6.2 Patient Detail EHR Modal
Clicking any bed card opens an authentic 4-tab hospital EHR dashboard:
1. **Tab 1: Live Telemetry & Waveforms**: Continuous canvas-drawn ECG Lead II, PPG Plethysmogram, and Respiration waves, updated at 30 fps via WebSockets.
2. **Tab 2: Diagnostic Labs & Biomarkers**: Comprehensive lab panel with clinical reference ranges and flagged abnormal values.
3. **Tab 3: Medical History & Comorbidities**: Patient admission information, allergies, and chronic conditions.
4. **Tab 4: Clinical Round Notes**: Consultant round summaries and nursing shift notes.

---

## 7. Dual-Layer Clinical Alert Engine

```
       Incoming Telemetry
               │
               ▼
┌───────────────────────────────┐
│     Layer 1: Rule Engine      │
│  • Heart Rate:  <50 or >120   │
│  • SpO2:        <90%          │
│  • Temp:        <35 or >38.5  │
│  • Resp Rate:   <8 or >30     │
│  • Multi-vital Compound Rules │
└──────────────┬────────────────┘
               │
       Breach Detected? ──▶ Dispatches Alert via WebSocket to Dashboard
               │
               ▼
┌───────────────────────────────┐
│   Layer 2: Anomaly Engine     │
│  • Isolation Forest Detector  │
│  • Fastify / Python AI bridge │
│  • Multivariate Risk Scoring  │
└───────────────────────────────┘
```

* **Alert Lifecyle**: `OPEN` ➔ `ACKNOWLEDGED` (by staff with role `clinician` or `admin`) ➔ `RESOLVED`.
* Configurable clinical thresholds can be customized in real-time via the "Thresholds" modal.

---

## 8. Role-Based Access Control (RBAC)

WiCare provides authentication and authorization using salted password hashes (`scrypt`) and signed JSON Web Tokens (JWT):

| Role | Permissions | Default Credentials |
| :--- | :--- | :--- |
| **`admin`** | Full ward access: manage simulation parameters, update clinical thresholds, acknowledge and resolve alerts. | `admin@wicare.local` / `AdminPass123!` |
| **`clinician`** | Clinical care: view all telemetry, acknowledge and resolve patient alarms, view EHR dashboards. | `clinician@wicare.local` / `ClinicianPass123!` |
| **`viewer`** | Read-only observation: view live vitals and ward status without control or alarm acknowledgment permissions. | `viewer@wicare.local` / `ViewerPass123!` |

---

## 9. Project Directory Structure

```
d:/My_Projects/WMC_Project/
├── ARCHITECTURE.md                  # Comprehensive architectural specification
├── README.md                        # Quickstart and overview documentation
├── package.json                     # Monorepo workspaces configuration
├── tsconfig.json                    # Base TypeScript compiler options
│
├── apps/
│   ├── api/                         # Backend API Server & Embedded MQTT Broker
│   │   ├── prisma/
│   │   │   ├── schema.prisma        # MySQL schema (Patients, Devices, Readings, Alerts, Users)
│   │   │   └── seed.ts              # Database seeder (50 Indian patient records + default users)
│   │   └── src/
│   │       ├── server.ts            # Fastify server bootstrap + Aedes MQTT broker
│   │       ├── mqtt/                # MQTT subscriber, device registry, AoI tracker
│   │       ├── db/                  # Prisma client & debounced reading batcher
│   │       ├── routes/              # /health, /patients, /alerts, /auth, /simulation
│   │       ├── ws/                  # Socket.IO real-time telemetry server
│   │       └── alerts/              # Clinical rule engine & threshold evaluator
│   │
│   └── web/                         # Clinical ICU Web Dashboard (Next.js 14)
│       ├── src/
│       │   ├── app/                 # Next.js App Router (page.tsx, layout.tsx)
│       │   ├── components/          # BedCard, PatientDetailModal, LiveWaveform, AlertsBanner
│       │   ├── lib/                 # Socket.IO client, REST API client, auth utilities
│       │   └── styles/              # Clean clinical CSS design system
│
├── simulator/
│   ├── service/                     # Standalone Simulator Studio (:4001)
│   │   └── src/
│   │       ├── index.ts             # Fastify server on 4001 with REST control
│   │       ├── simulation-service.ts# Simulation manager & bed state coordinator
│   │       └── ui.ts                # Master-Detail UI (Left sidebar + Right interactive sliders)
│   │
│   ├── patient-generator/           # Virtual Patient Telemetry Engine
│   │   └── src/
│   │       ├── patient.ts           # SimulatedPatient (MQTT connection, buffering, vital generator)
│   │       └── cli.ts               # Interactive terminal TUI controller
│   │
│   ├── scenarios/                   # Clinical scenarios (stable, deterioration, falling_spo2, etc.)
│   └── network-emulator/            # Packet loss, delay, and jitter simulation models
│
└── packages/
    └── shared/                      # Shared types, Zod schemas, and Indian patient dataset
        └── src/
            ├── index.ts
            ├── types.ts             # TelemetryPacket, VitalType, ScenarioType, AlertItem
            ├── schemas.ts           # Zod validation schemas
            └── indian-patients.ts   # 50 Curated Indian ICU patient profiles & baseline labs
```

---

## 10. How to Run

### Step 1: Start Main Hospital Application (Broker + API + Clinic Hub)
```bash
npm run dev:app
```
* **Broker**: `tcp://localhost:1883`
* **API Server**: `http://localhost:4000`
* **Clinic Dashboard**: `http://localhost:3000`

### Step 2: Start Standalone Simulator Studio
```bash
npm run simulator
```
* **Simulator Studio**: `http://localhost:4001`
* Connects 5 virtual patient beds to the MQTT broker.
* Use the sliders on `http://localhost:4001` to adjust vitals in real time and watch them update instantly on `http://localhost:3000`.
