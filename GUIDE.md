# WiCare — Comprehensive Run & Operations Guide

Welcome to the **WiCare** Wireless ICU Patient Monitoring System guide. This document explains how to set up, configure, run, test, and access every component of the platform — on your local computer and **from your phone or tablet over the same Wi-Fi network**.

---

## 📋 Table of Contents

1. [System Architecture Overview](#-system-architecture-overview)
2. [Prerequisites & Initial Setup](#-prerequisites--initial-setup)
3. [Environment Configuration (`.env`)](#-environment-configuration-env)
4. [How to Run WiCare](#-how-to-run-wicare)
   - [Method 1: Run Everything Together (Recommended)](#method-1-run-everything-together-recommended)
   - [Method 2: Run in Separate Terminals (Modular)](#method-2-run-in-separate-terminals-modular)
5. [📱 Accessing WiCare on Your Phone / Tablet via Wi-Fi](#-accessing-wicare-on-your-phone--tablet-via-wi-fi)
   - [Step 1: Find Your Computer's Wi-Fi IP Address](#step-1-find-your-computers-wi-fi-ip-address)
   - [Step 2: Windows Firewall Permission (One-Time Setup)](#step-2-windows-firewall-permission-one-time-setup)
   - [Step 3: Open on Your Phone](#step-3-open-on-your-phone)
   - [Step 4: Interactive Multi-Device Testing](#step-4-interactive-multi-device-testing)
   - [Troubleshooting Phone Connection](#troubleshooting-phone-connection)
6. [Application Endpoints & Port Map](#-application-endpoints--port-map)
7. [Demo User Accounts & Credentials](#-demo-user-accounts--credentials)
8. [Step-by-Step Feature Walkthrough](#-step-by-step-feature-walkthrough)
   - [1. Monitoring Live ICU Beds](#1-monitoring-live-icu-beds)
   - [2. Using the Telemetry Simulator & Vital Sliders](#2-using-the-telemetry-simulator--vital-sliders)
   - [3. Clinical EHR Modal (Waveforms, Labs, Notes)](#3-clinical-ehr-modal-waveforms-labs-notes)
   - [4. Triggering the AI Clinical Deterioration Explainer (Gemini 3)](#4-triggering-the-ai-clinical-deterioration-explainer-gemini-3)
9. [📡 MQTT Packet Drop Recorder & Network Health Web UI](#-mqtt-packet-drop-recorder--network-health-web-ui)
10. [🧪 Testing & Verification Commands](#-testing--verification-commands)
11. [❓ Troubleshooting & Common Issues](#-troubleshooting--common-issues)

---

## 🏛️ System Architecture Overview

WiCare is built as an offline-resilient, communication-aware medical telemetry platform running 100% locally:

```
┌─────────────────────────────────────────────────────────────┐
│               Simulator Studio (:4001)                      │
│   Virtual Indian ICU Patients • Interactive Vital Sliders   │
└──────────────────────────────┬──────────────────────────────┘
                               │ MQTT Telemetry Packets
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 WiCare API Server (:4000)                   │
│   • Embedded Aedes MQTT Broker (TCP :1883)                  │
│   • Local MySQL Database (Port 3306)                        │
│   • Sequence Gap & Packet Drop Recorder                     │
│   • AlertEngine & Telemetry DeviceRegistry                  │
│   • Google Gemini 3 AI Clinical Explainer API               │
│   • Socket.IO Live Telemetry Broadcasts                     │
└──────────────────────────────┬──────────────────────────────┘
                               │ WebSocket / REST API
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              Clinical Web Dashboard (:3000)                 │
│   • Accessible from Desktop & Mobile / Phone Browser        │
│   • Live Bed Cards & 50-Patient Indian ICU Cohort           │
│   • 4-Tab EHR Modal (ECG/PPG Waveforms, Labs, History)      │
│   • On-Demand "Explain with AI" Clinical Panel              │
│   • MQTT Drops Recorder & Packet Loss Experiments           │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Prerequisites & Initial Setup

### Requirements
- **Node.js**: `v20.0.0` or higher ([Download Node.js](https://nodejs.org/))
- **npm**: `v10.0.0` or higher
- **MySQL Server**: Local MySQL 8.0 on port `3306`
- **Operating System**: Windows, macOS, or Linux

### 1. Install Dependencies
Open a terminal in the root folder of the project (`WMC_Project`):

```powershell
npm install
```

### 2. Compile Shared Packages
Build the shared TypeScript packages before launching the services:

```powershell
npm run predev
```

### 3. Initialize & Seed the MySQL Database
Ensure your local MySQL service is running and that `DATABASE_URL` in your `.env` matches your database credentials. Then run:

```powershell
npm run db:push
npm run db:seed
```

This synchronizes the database schema and seeds 50 synthetic Indian ICU patients, alert thresholds, devices, and default clinical staff accounts.

---

## ⚙️ Environment Configuration (`.env`)

A template file `.env.example` is provided in the root directory. Copy it to create your active `.env`:

```powershell
cp .env.example .env
```

### Key Environment Variables:
```ini
API_PORT=4000
API_HOST=0.0.0.0
LOG_LEVEL=info

MQTT_URL=mqtt://localhost:1883
MQTT_USERNAME=
MQTT_PASSWORD=

DATABASE_URL=mysql://root:password@localhost:3306/wicare

WEB_PORT=3000
NEXT_PUBLIC_API_URL=http://localhost:4000

SIMULATOR_PORT=4001
SIMULATOR_URL=http://localhost:4001

GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```

> [!NOTE]
> The Gemini explainer service defaults to `gemini-2.5-flash` or `gemini-1.5-flash` for rapid latency, with automated fallback mechanisms to handle transient API quota or load spikes.

---

## 🚀 How to Run WiCare

You can start WiCare using either an all-in-one command or separate dedicated terminal windows.

---

### Method 1: Run Everything Together (Recommended)

In a single terminal in the project root:

```powershell
npm run dev:all
```

This concurrently starts:
1. `dev:shared`: TypeScript watcher for shared contracts.
2. `dev:api`: Fastify backend API + embedded Aedes MQTT broker (`0.0.0.0:4000`, `0.0.0.0:1883`).
3. `dev:web`: Next.js Clinical Dashboard (`http://0.0.0.0:3000`).
4. `dev:simulator`: Telemetry Simulator Studio (`http://0.0.0.0:4001`).

---

### Method 2: Run in Separate Terminals (Modular)

Running in separate terminals allows you to inspect logs for the hospital system and the patient simulator independently.

#### Terminal 1: Hospital System (API + MQTT + Web Dashboard)
```powershell
npm run dev:app
```
- **MQTT Broker**: `mqtt://localhost:1883`
- **Fastify API**: `http://localhost:4000`
- **Web Dashboard**: `http://localhost:3000`

#### Terminal 2: Standalone Telemetry Simulator
```powershell
npm run simulator
```
- **Simulator Studio**: `http://localhost:4001`
- Automatically spawns 5 virtual Indian ICU patient nodes and starts broadcasting wireless telemetry packets over MQTT.

---

## 📱 Accessing WiCare on Your Phone / Tablet via Wi-Fi

All services in WiCare (`apps/web`, `apps/api`, `simulator`) bind to `0.0.0.0`, making the entire platform accessible from your smartphone, iPhone, iPad, Android, or tablet connected to the **same Wi-Fi network**.

---

### Step 1: Find Your Computer's Wi-Fi IP Address

In a terminal on your computer, run:

```powershell
ipconfig
```

Look for the section titled **Wireless LAN adapter Wi-Fi** and find the **IPv4 Address**.

> **Example**:
> ```
> Wireless LAN adapter Wi-Fi:
>    IPv4 Address. . . . . . . . . . . : 192.168.1.50
>    Subnet Mask . . . . . . . . . . . : 255.255.0.0
>    Default Gateway . . . . . . . . . : 10.3.0.1
> ```
> In this example, your computer's local IP is **`192.168.1.50`**. *(Your IP might be `192.168.1.X`, `192.168.0.X`, or `10.X.X.X`)*.

---

### Step 2: Windows Firewall Permission (One-Time Setup)

On Windows, Windows Defender Firewall may block inbound traffic from other devices on local ports. Run this single command in **PowerShell as Administrator** to allow your phone to connect:

```powershell
New-NetFirewallRule -DisplayName "WiCare Local Network" -Direction Inbound -LocalPort 3000,4000,4001,1883 -Protocol TCP -Action Allow
```

*(To open PowerShell as Administrator: Press `Win + X`, select "Terminal (Admin)" or "Windows PowerShell (Admin)").*

---

### Step 3: Open on Your Phone

Make sure your phone is connected to the **same Wi-Fi network** as your laptop.

Open Chrome, Safari, or Firefox on your phone and navigate to:

| Target Page | URL on Your Phone | What It Opens |
| :--- | :--- | :--- |
| 🏥 **Clinical Ward Dashboard** | `http://<YOUR_COMPUTER_IP>:3000`<br>*(e.g., `http://192.168.1.50:3000`)* | Full ICU monitor, live vitals, patient EHR modals, waveforms, and "Explain with AI". |
| 🎛️ **Simulator Studio (Remote)**| `http://<YOUR_COMPUTER_IP>:4001`<br>*(e.g., `http://192.168.1.50:4001`)* | Touch-friendly vital sliders, patient scenario injector, and network loss controls. |
| 📡 **MQTT Drops Recorder** | `http://<YOUR_COMPUTER_IP>:3000/mqtt-drops`<br>*(e.g., `http://192.168.1.50:3000/mqtt-drops`)* | Packet drop recording sessions, real-time sequence gap logs, and CSV export. |

> [!TIP]
> **Dynamic Host Detection**: The WiCare web app automatically detects the host address in the browser. When you visit `http://192.168.1.50:3000` on your phone, the frontend automatically routes all API requests and WebSocket telemetry streams to `http://192.168.1.50:4000` without any manual configuration changes.

---

### Step 4: Interactive Multi-Device Testing

You can use your laptop and phone together as a real-time clinical demonstration:

1. **Laptop Screen**: Open `http://localhost:3000` (shows the large Ward Monitor with all patient beds).
2. **Phone**: Open `http://<YOUR_COMPUTER_IP>:4001` (Simulator Studio).
3. Select **Bed B-1: Rajesh Sharma** on your phone.
4. Drag the **Heart Rate slider** on your phone to **150 bpm** or select **"Sudden SpO2 Desaturation"**.
5. **Watch the Laptop Screen**: Within 1 second, Bed B-1 turns flashing red with a **🚨 CRITICAL ALARM**, audio chime, and telemetry alert!
6. Click **"Explain with AI"** on your phone or laptop to generate an advisory bedside synthesis using Gemini 3.

---

### Troubleshooting Phone Connection

If your phone cannot reach `http://<YOUR_IP>:3000`:

1. **Check Wi-Fi Network**: Ensure your phone is NOT on cellular data (4G/5G). Both devices must be on the exact same Wi-Fi SSID.
2. **Campus / University Wi-Fi (AP Client Isolation)**:
   - Some institutional networks (e.g. university or corporate Wi-Fi) enable "Client Isolation", which prevents devices on the Wi-Fi from talking to each other.
   - **Quick Fix**: Turn on **Mobile Hotspot** on your phone or computer, connect both devices to that hotspot, run `ipconfig` to get the hotspot IP, and open `http://<HOTSPOT_IP>:3000`.
3. **Verify Port Listening**:
   In PowerShell on your computer, verify the services are listening on `0.0.0.0`:
   ```powershell
   netstat -ano | findstr "LISTENING" | findstr ":3000 :4000 :4001"
   ```
4. **Network Profile Set to Private**:
   In Windows Settings > Network & Internet > Wi-Fi > your Wi-Fi name > set **Network profile type** to **Private network**.

---

## 🌐 Application Endpoints & Port Map

| Component | Port | Local URL | LAN / Phone URL | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Clinical Dashboard** | `3000` | [http://localhost:3000](http://localhost:3000) | `http://<YOUR_IP>:3000` | Primary ward clinical monitoring UI & EHR modals. |
| **Simulator Studio** | `4001` | [http://localhost:4001](http://localhost:4001) | `http://<YOUR_IP>:4001` | Live telemetry controls, patient selection & vital sliders. |
| **Fastify API Server** | `4000` | [http://localhost:4000](http://localhost:4000) | `http://<YOUR_IP>:4000` | REST API, Socket.IO, JWT Auth, and AI endpoints. |
| **Embedded MQTT Broker**| `1883` | `mqtt://localhost:1883` | `mqtt://<YOUR_IP>:1883` | TCP MQTT broker for high-speed wireless telemetry. |
| **MySQL Database** | `3306` | `localhost:3306` | — | Local MySQL 8.0 instance (`wicare` database). |

---

## 🔐 Demo User Accounts & Credentials

To test role-based access control (RBAC) in the Clinical Dashboard, click **Login** in the top right navbar of `http://localhost:3000`:

| Role | Email | Password | Permissions |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@wicare.local` | `AdminPass123!` | Full privileges: modify ward thresholds, control simulator, use AI Explainer, acknowledge/resolve alarms. |
| **Clinician** | `clinician@wicare.local` | `ClinicianPass123!` | Clinical privileges: acknowledge/resolve alarms, view complete EHR, use AI Explainer. |
| **Viewer** | `viewer@wicare.local` | `ViewerPass123!` | Read-only observation. AI Explainer action is restricted. |

---

## 🎮 Step-by-Step Feature Walkthrough

### 1. ICU Clinical Workstation (Left Bed Bar & Right Selected Canvas)
1. Open **`http://localhost:3000`** in your browser (or on your phone).
2. The dashboard opens in the **Clinical Workstation** view:
   - **Left Bar (Ward Beds Roster)**:
     - Displays all ICU beds with real-time status dots (green pulsing if online, flashing red if critical alarm).
     - Filter beds instantly using the search box or tabs: **Active**, **All (50 Beds)**, or **Alarms**.
     - Each bed item displays live mini-vitals: `HR`, `SpO₂`, `RR`, and `Temp`.
     - Click on any bed in the left bar to immediately display that patient on the main right canvas!
   - **Right Canvas (Main Selected Bed)**:
     - Prominently displays the active selected patient with full clinical demographics: Bed ID, Name, Age, Gender, Blood Group, Ward, Attending Doctor, and Primary ICU Diagnosis.
     - Live telemetry link metrics (Freshness latency in ms, packet loss %).
     - 5 comprehensive clinical workstation tabs:
       - **Live Telemetry & Waveforms**: ECG Lead II, SpO₂ Plethysmograph, and respiration trend charts with threshold alarms and manual vital override sliders.
       - **AI Clinical Explainer (Gemini 3)**: On-demand AI Deterioration synthesis.
       - **Clinical Labs & Biomarkers**: ABG pH, Lactate, Hemoglobin, Creatinine, Electrolytes.
       - **Medical History & Comorbidities**: Known allergies, chronic conditions.
       - **Clinical Round Notes**: Progress notes and consultation logs.
   - **View Switcher**: Click **"⊞ Ward Overview (Grid)"** in the top right to view all bed cards in a traditional grid, or **"☷ Workstation (Split Canvas)"** for the side-by-side workstation!

---

### 4. Triggering the AI Clinical Deterioration Explainer (Gemini 3)
1. Ensure you are signed in as **Clinician** or **Admin** (e.g. `admin@wicare.local` / `AdminPass123!`).
2. Open any patient's detail modal.
3. Click the **Explain with AI** button in the modal header or switch to the **AI Clinical Explainer** tab.
4. Configure parameters:
   - **Analysis Window**: Select 5, 10, 15 (Default), 30, or 60 minutes.
   - **Focus Alert**: Select a specific active alarm (e.g. `[CRITICAL] heart_rate (145)`) or general telemetry.
5. Click **Explain with AI**:
   - The panel displays a loading animation with accessible screen-reader status updates.
   - Gemini 3 (`gemini-3.5-flash`) analyzes telemetry trends, ward safety limits, and wireless link quality.
   - The response renders across 7 structured clinical sections:
     1. **Executive Summary** with model name and generation timestamp.
     2. **Observed Facts** derived strictly from real measurements.
     3. **Differential Hypotheses** labeled as non-definitive possibilities.
     4. **Supporting Evidence** linking vital readings to ward threshold limits.
     5. **Data Quality & Link Integrity** highlighting AoI freshness and packet loss.
     6. **Suggested Bedside Verification Steps** for qualified nursing and medical staff.
     7. **Clinical Advisory Notice** confirming output is decision support, not an autonomous diagnosis.

---

## 📡 MQTT Packet Drop Recorder & Network Health Web UI

WiCare includes a built-in **MQTT Packet Drop Recorder & Network Health Monitor** designed for wireless telemetry research, network impairment experiments, and packet loss analysis.

### How to Access:
1. **From Main ICU Dashboard**: Click the **"MQTT Drops"** button in the top navigation bar.
2. **Direct Browser URL**: Open [http://localhost:3000/mqtt-drops](http://localhost:3000/mqtt-drops) (or `http://<YOUR_IP>:3000/mqtt-drops` on your phone).

### Core Functionalities:
- **Real-Time Sequence Gap Detection**: Detects missing sequence numbers in real-time as MQTT telemetry packets arrive from wireless patient monitors.
- **Recording Sessions**:
  - Name your session (e.g. `Run #1 - 15% Packet Loss`).
  - Click **"Start Recording"** (shows live elapsed timer and blinking `● REC` badge in navbar).
  - Click **"Stop Recording"** when finished.
- **Data Export**:
  - **Export CSV**: Download a `.csv` log with `Timestamp, Bed, Device, Patient, Expected Seq, Received Seq, Dropped Packets, AoI (ms), QoS, Session ID`.
  - **Export JSON**: Download the full structured JSON dataset.
- **Interactive Network Impairment (Live Testing)**:
  - Quickly toggle simulated packet loss directly from the UI (`0% Clean`, `5% Loss`, `15% Loss`, `30% Severe`, `50% Extreme`).
  - Watch the MQTT drops table record sequence gaps in real-time!

---

## 🧪 Testing & Verification Commands

WiCare includes an automated test suite with 100% mocked isolation for deterministic testing:

### 1. Run Complete Automated Test Suite (147 tests)
```powershell
npm test
```
Runs Vitest across all workspace packages:
- Device registry & ring buffer tests
- Telemetry network emulator tests
- Alert engine threshold tests
- Patient generator & virtual patient tests
- Backend explainer API & RBAC authorization tests
- 12 End-to-end simulator scenario tests
- Frontend clinical explainer component tests
- Clinical evidence grounding verification tests
- MQTT drop recorder and sequence gap detection tests

### 2. Run TypeScript Typechecking
```powershell
npm run typecheck
```
Performs strict `--noEmit` typechecking across all 7 workspace packages and Next.js web application.

### 3. Run Code Quality & Linting
```powershell
npm run lint
npm --prefix apps/web run lint
```

### 4. Run Live Gemini Smoke Test
```powershell
npm run test:smoke:gemini
```
Dispatches a single bounded test against Google Gemini 3 (`gemini-3.5-flash`) using synthetic context and reports real roundtrip latency and schema validation.

---

## ❓ Troubleshooting & Common Issues

### 1. Phone cannot connect to `http://<IP>:3000`
- **Solution**: Run the Windows Firewall rule in PowerShell as Administrator:
  ```powershell
  New-NetFirewallRule -DisplayName "WiCare Local Network" -Direction Inbound -LocalPort 3000,4000,4001,1883 -Protocol TCP -Action Allow
  ```
- If on campus/enterprise Wi-Fi with client isolation enabled, enable Mobile Hotspot on your phone or laptop and connect both devices to the hotspot.

---

### 2. `EADDRINUSE: address already in use 0.0.0.0:4001` (or port 4000/3000/1883)
- **Cause**: An earlier instance of the simulator, API, or web server is already running in another terminal or background process.
- **Solution (Windows PowerShell)**:
  ```powershell
  # Check which process is on port 4001
  netstat -ano | findstr :4001
  # Stop the process by PID (replace <PID> with the number from the last column)
  taskkill /PID <PID> /F
  ```

---

### 3. Dashboard shows "Waiting for telemetry devices to broadcast packets"
- **Cause**: The API server and dashboard are running, but the Simulator service has not been started.
- **Solution**: In a separate terminal, run:
  ```powershell
  npm run simulator
  ```

---

### 4. Database or MySQL Connection Errors
- **Cause**: MySQL service is stopped or database needs synchronization.
- **Solution**:
  ```powershell
  # Ensure MySQL service is running
  Start-Service MySQL80

  # Synchronize schema and seed default data
  npm run db:push
  npm run db:seed
  ```

---

## 📄 License & Attribution

WiCare is built for clinical telemetry research and local hospital software simulation. All synthetic patient records use randomized, fictional Indian demographic profiles. AI clinical explanations are assistive decision support and not clinically validated autonomous medical diagnoses.
