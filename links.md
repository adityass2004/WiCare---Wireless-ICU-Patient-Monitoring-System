# 🏥 WiCare Patient Monitoring System — Access Links

> **Auto-generated when running `npm run dev:all` or `npm run links`**  
> **Generated at:** `Oct 26, 2026, 8:11:30 AM`  
> **Primary LAN IP:** `10.197.188.63` *(Adapter: Wi-Fi)*

## 🚀 Quick Access (Recommended for Mobile / Other Devices)

Open these links on your phone, tablet, or another computer connected to the same Wi-Fi:

| Application | Mobile / LAN Link | Local Link (This PC) |
| :--- | :--- | :--- |
| **🏥 WiCare Web Dashboard** | [http://10.197.188.63:3000](http://10.197.188.63:3000) | [http://localhost:3000](http://localhost:3000) |
| **🧪 Simulator Web UI** | [http://10.197.188.63:4001](http://10.197.188.63:4001) | [http://localhost:4001](http://localhost:4001) |
| **⚙️ API Server (Health)** | [http://10.197.188.63:4000/health](http://10.197.188.63:4000/health) | [http://localhost:4000/health](http://localhost:4000/health) |
| **📊 Simulator Status API** | [http://10.197.188.63:4001/status](http://10.197.188.63:4001/status) | [http://localhost:4001/status](http://localhost:4001/status) |
| **📡 MQTT Broker** | `mqtt://10.197.188.63:1883` | `mqtt://localhost:1883` |

---

## 📱 Service Endpoints

### 1. WiCare Clinical Monitoring Web App
Real-time ICU patient monitoring dashboard with live waveforms, alerts, and AI Clinical Explainer.

- **Local (Current PC):** [http://localhost:3000](http://localhost:3000)
- **LAN (Phone / Tablet / Laptop):** [http://10.197.188.63:3000](http://10.197.188.63:3000)

### 2. Patient Telemetry Simulator
Interactive control panel for 5 simulated ICU beds (normal rhythm, tachycardia, hypoxia, cardiac arrest, signal dropouts).

- **Simulator Web UI (Local):** [http://localhost:4001](http://localhost:4001)
- **Simulator Web UI (LAN):** [http://10.197.188.63:4001](http://10.197.188.63:4001)
- **Simulator Status API:** [http://10.197.188.63:4001/status](http://10.197.188.63:4001/status)

### 3. WiCare Backend API & WebSocket Server
Fastify REST API & Socket.IO real-time stream.

- **Local API Root:** [http://localhost:4000](http://localhost:4000)
- **Local Health Check:** [http://localhost:4000/health](http://localhost:4000/health)
- **LAN Health Check:** [http://10.197.188.63:4000/health](http://10.197.188.63:4000/health)

### 4. MQTT Broker (Embedded Aedes)
Wireless telemetry transport broker (listens on `0.0.0.0:1883`).

- **Local Broker:** `mqtt://localhost:1883`
- **LAN Broker:** `mqtt://10.197.188.63:1883`

---

## 📋 Quick Copy & Paste Links

```text
Web Dashboard (LAN):  http://10.197.188.63:3000
Web Dashboard (Local): http://localhost:3000
Simulator UI (LAN):   http://10.197.188.63:4001
Simulator UI (Local):  http://localhost:4001
API Health (LAN):     http://10.197.188.63:4000/health
API Health (Local):    http://localhost:4000/health
Simulator Status (LAN): http://10.197.188.63:4001/status
MQTT Broker (LAN):    mqtt://10.197.188.63:1883
```

> [!TIP]
> **Network Reachability & Windows Firewall Guidance:**
> 1. Ensure your phone/tablet is connected to the same Wi-Fi network (`Wi-Fi`).
> 2. Ensure your Wi-Fi network profile in Windows Settings is set to **Private Network** (Public networks block incoming connections).
> 3. If a mobile device cannot load the page, verify that Windows Defender Firewall allows incoming connections for Node.js on Private networks.
