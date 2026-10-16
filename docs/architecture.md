# WiCare System Architecture & Technical Specification

WiCare is a completely local, software-simulated, communication-aware wireless patient-monitoring system. Synthetic vitals produced by independent virtual patient node publishers traverse an MQTT broker, pass through rule-based and local AI anomaly detectors, and stream in real time to Next.js web dashboards on laptops and mobile devices.

---

## 🏗 System Architecture Diagram (Mermaid)

```mermaid
flowchart TB
    subgraph EdgeDevices["Virtual Patient Nodes (ICU Ward)"]
        DP1["Patient Node 1\n(Fixed/Adaptive Strategy)"]
        DP2["Patient Node 2\n(Drop-Oldest Buffer)"]
        DPN["Patient Node N"]
    end

    subgraph NetEmul["Network Emulator Layer"]
        Loss["Probabilistic Packet Loss (0-50%)"]
        Delay["Fixed Delay + Jitter"]
        Disc["Disconnect Window Handler"]
    end

    subgraph MQTTBroker["MQTT Broker (Mosquitto / Aedes)"]
        TopicRoutine["wicare/{ward}/{bed}/{dev}/vitals\n(QoS 0 / 1 Routine)"]
        TopicCritical["wicare/{ward}/{bed}/{dev}/vitals/critical\n(QoS 1 Priority)"]
        TopicStatus["wicare/{ward}/{bed}/{dev}/status\n(LWT Retained)"]
    end

    subgraph BackendAPI["Fastify API Server (Port 4000)"]
        Sub["MQTT Subscriber & Ingest"]
        Auth["Auth & Security (Crypto / JWT)"]
        RBAC["RBAC Middleware (Admin/Clinician/Viewer)"]
        AlertEng["Rule Engine & AI Client"]
        DB[(Prisma + SQLite)]
        WsSrv["Socket.IO Server"]
    end

    subgraph AIEngine["Local AI Engine (Port 5000)"]
        IsoForest["Isolation Forest Anomaly Model"]
        FastAPI["FastAPI REST Endpoint"]
    end

    subgraph Clients["Web Dashboards"]
        LaptopUI["Laptop Browser (http://localhost:3000)"]
        PhoneUI["Smartphone LAN (http://<LAN-IP>:3000)"]
    end

    DP1 & DP2 & DPN --> NetEmul
    NetEmul -->|Routine Telemetry| TopicRoutine
    NetEmul -->|Critical Vitals| TopicCritical
    NetEmul -->|Status & LWT| TopicStatus

    TopicRoutine & TopicCritical & TopicStatus --> Sub
    Sub --> DB
    Sub --> AlertEng
    AlertEng <-->|POST /score| FastAPI
    FastAPI <--> IsoForest
    AlertEng --> WsSrv
    Sub --> WsSrv

    LaptopUI & PhoneUI <-->|REST + Auth Bearer| RBAC
    RBAC --> Auth
    LaptopUI & PhoneUI <-->|Socket.IO Real-time| WsSrv
```

---

## 🔄 End-to-End Prioritized Telemetry Sequence

```mermaid
sequenceDiagram
    autonumber
    participant Device as Virtual Patient Node
    participant Strategy as Adaptive Strategy
    participant Buffer as Device Bounded Queue
    participant Broker as MQTT Broker
    participant API as Fastify API Server
    participant AI as Local AI Engine
    participant Web as Phone / Laptop Dashboard

    Device->>Strategy: Evaluate clinical risk & network loss
    alt High Risk (SpO2 < 90)
        Strategy-->>Device: Accelerate interval to 300ms
        Device->>Broker: Publish to wicare/.../vitals/critical (QoS 1)
    else Network Loss > 15%
        Strategy-->>Device: Back off interval to 2500ms
    end

    alt Network Disconnected
        Device->>Buffer: Store reading (bounded 100, drop-oldest)
    else Network Reconnected
        Buffer->>Broker: Flush priority critical/latest samples
    end

    Broker->>API: Deliver vitals payload
    API->>API: Deduplicate (seq + timestamp) & store DB
    API->>AI: POST /score (window of recent vitals)
    AI-->>API: Return anomaly score & explanations
    API->>API: Evaluate thresholds & hysteresis
    API->>Web: Broadcast vitals:update & alert:new via Socket.IO
```

---

## 🔐 Security & Role-Based Access Control (RBAC)

1. **Authentication**: Passwords stored as `scrypt` hashes (`salt:hash`). Tokens signed using HMAC-SHA256 (`crypto.createHmac`). Zero external dependencies.
2. **Roles & Endpoint Permissions**:
   - `admin`: Can execute simulation control, scenario injection (`POST /simulation/...`), and modify thresholds (`PUT /thresholds/...`).
   - `clinician`: Can acknowledge (`POST /alerts/:id/ack`) and resolve (`POST /alerts/:id/resolve`) clinical alerts.
   - `viewer`: Read-only access to `/patients`, `/readings`, `/alerts`, `/thresholds`.
3. **Socket.IO Handshake Authentication**: Real-time WebSocket connection validates JWT token passed in `auth.token`.

---

## 🌐 Network Scheme & MQTT Topics

| Topic | QoS | Payload | Description |
| :--- | :---: | :--- | :--- |
| `wicare/{ward}/{bed}/{dev}/vitals` | 0 / 1 | `VitalsMessage` | Periodic vital signs (heart rate, SpO2, temp, resp rate). |
| `wicare/{ward}/{bed}/{dev}/vitals/critical` | 1 | `VitalsMessage` | High-priority urgent readings bypassing routine telemetry queue. |
| `wicare/{ward}/{bed}/{dev}/status` | 1 | `StatusMessage` | Connection status (`online` / `offline`) via MQTT Last Will and Testament. |

---

## 📱 LAN Mobile Access

- **Binding**: Both Fastify API (`0.0.0.0:4000`) and Next.js Web App (`0.0.0.0:3000`) listen on all network interfaces.
- **Dynamic URL Discovery**: Server outputs local LAN IP on startup using `os.networkInterfaces()`.
- **CORS Configuration**: API server dynamically accepts origins from any LAN IP (`http://<LAN-IP>:3000`).
- **Dynamic Browser Base URL**: Web dashboard dynamically connects to `http://${window.location.hostname}:4000` for REST & WebSocket requests.
