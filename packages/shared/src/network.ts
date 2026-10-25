export interface NetworkInterfaceLike {
  address: string;
  netmask?: string;
  family: string | number;
  mac?: string;
  internal?: boolean;
  cidr?: string | null;
  scopeid?: number;
}

export interface DetectedAdapter {
  name: string;
  address: string;
  netmask: string;
  isVirtual: boolean;
  isWifi: boolean;
  isEthernet: boolean;
  priority: number;
}

export interface LanDetectionResult {
  primaryIp: string;
  primaryInterface: string;
  isLocalOnly: boolean;
  adapters: DetectedAdapter[];
  warning?: string;
}

export interface ServicePorts {
  web: string | number;
  api: string | number;
  simulator: string | number;
  mqtt: string | number;
}

const VIRTUAL_REGEX = /warp|cloudflare|vethernet|virtual|vmware|vbox|docker|tailscale|zerotier|loopback|tap|tun|bluetooth|pseudo|wsl/i;
const WIFI_REGEX = /wi-fi|wifi|wireless|wlan/i;
const ETHERNET_REGEX = /ethernet|eth|en\d|local area/i;

export function isApipa(address: string): boolean {
  return address.startsWith('169.254.');
}

export function isLoopback(address: string): boolean {
  return address === '127.0.0.1' || address.startsWith('127.') || address === '::1';
}

export function detectLanIp(
  interfacesInput?: Record<string, NetworkInterfaceLike[] | undefined>
): LanDetectionResult {
  let interfaces = interfacesInput;

  if (!interfaces && typeof process !== 'undefined' && typeof process.versions?.node !== 'undefined') {
    try {
      // Safe dynamic require so client-side bundlers (Next.js/webpack) never encounter node:os
      const nodeRequire = eval('require');
      const os = nodeRequire('os');
      interfaces = os.networkInterfaces() as Record<string, NetworkInterfaceLike[]>;
    } catch {
      // Browser or non-Node environment fallback
    }
  }

  interfaces = interfaces ?? {};

  const allAdapters: DetectedAdapter[] = [];

  for (const [name, list] of Object.entries(interfaces)) {
    if (!list) continue;
    for (const iface of list) {
      const family = String(iface.family);
      const isIpv4 = family === 'IPv4' || family === '4';

      if (!isIpv4 || iface.internal || isLoopback(iface.address) || isApipa(iface.address)) {
        continue;
      }

      const isVirtual = VIRTUAL_REGEX.test(name);
      const isWifi = WIFI_REGEX.test(name);
      const isEthernet = ETHERNET_REGEX.test(name);

      let priority = 3;
      if (isWifi && !isVirtual) {
        priority = 1; // Preferred: active Wi-Fi on Windows
      } else if (isEthernet && !isVirtual) {
        priority = 2; // Second preference: physical Ethernet
      } else if (isVirtual) {
        priority = 4; // Deprioritized: VPN / virtual adapters
      }

      allAdapters.push({
        name,
        address: iface.address,
        netmask: iface.netmask || '255.255.255.0',
        isVirtual,
        isWifi,
        isEthernet,
        priority,
      });
    }
  }

  // Sort deterministically:
  // 1. Lower priority number first (1 = Wi-Fi, 2 = Ethernet, 3 = other physical, 4 = virtual)
  // 2. Private IP range preference (192.168.x.x, then 10.x.x.x, then 172.x.x.x)
  // 3. Adapter name alphabetically
  // 4. IP address alphabetically
  allAdapters.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    const scoreIp = (ip: string) => {
      if (ip.startsWith('192.168.')) return 1;
      if (ip.startsWith('10.')) return 2;
      if (ip.startsWith('172.')) return 3;
      return 4;
    };
    const scoreDiff = scoreIp(a.address) - scoreIp(b.address);
    if (scoreDiff !== 0) return scoreDiff;
    const nameDiff = a.name.localeCompare(b.name);
    if (nameDiff !== 0) return nameDiff;
    return a.address.localeCompare(b.address);
  });

  const physicalCandidates = allAdapters.filter((a) => !a.isVirtual);
  const bestCandidate = physicalCandidates[0] || allAdapters[0];

  if (!bestCandidate) {
    return {
      primaryIp: 'localhost',
      primaryInterface: 'None (Localhost Only)',
      isLocalOnly: true,
      adapters: [],
      warning:
        'No active physical Wi-Fi or Ethernet network adapter detected. Services will be reachable locally via localhost only.',
    };
  }

  return {
    primaryIp: bestCandidate.address,
    primaryInterface: bestCandidate.name,
    isLocalOnly: false,
    adapters: allAdapters,
  };
}

export function generateAccessLinksMarkdown(
  result: LanDetectionResult,
  ports: ServicePorts,
  timestampStr?: string
): string {
  const timestamp =
    timestampStr ||
    new Date().toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'medium',
      hour12: true,
    });

  const { primaryIp, primaryInterface, isLocalOnly, adapters, warning } = result;

  const dashboardLanUrl = isLocalOnly ? `http://localhost:${ports.web}` : `http://${primaryIp}:${ports.web}`;
  const simulatorLanUrl = isLocalOnly ? `http://localhost:${ports.simulator}` : `http://${primaryIp}:${ports.simulator}`;
  const apiHealthLanUrl = isLocalOnly ? `http://localhost:${ports.api}/health` : `http://${primaryIp}:${ports.api}/health`;
  const simStatusLanUrl = isLocalOnly ? `http://localhost:${ports.simulator}/status` : `http://${primaryIp}:${ports.simulator}/status`;
  const mqttLanUrl = isLocalOnly ? `mqtt://localhost:${ports.mqtt}` : `mqtt://${primaryIp}:${ports.mqtt}`;

  let md = `# 🏥 WiCare Patient Monitoring System — Access Links\n\n`;
  md += `> **Auto-generated when running \`npm run dev:all\` or \`npm run links\`**  \n`;
  md += `> **Generated at:** \`${timestamp}\`  \n`;

  if (isLocalOnly) {
    md += `> **Status:** ⚠️ Localhost-Only Mode *(No active LAN adapter)*  \n\n`;
    if (warning) {
      md += `> [!WARNING]\n> ${warning}\n\n`;
    }
  } else {
    md += `> **Primary LAN IP:** \`${primaryIp}\` *(Adapter: ${primaryInterface})*\n\n`;
  }

  md += `## 🚀 Quick Access (Recommended for Mobile / Other Devices)\n\n`;
  md += `Open these links on your phone, tablet, or another computer connected to the same Wi-Fi:\n\n`;
  md += `| Application | Mobile / LAN Link | Local Link (This PC) |\n`;
  md += `| :--- | :--- | :--- |\n`;
  md += `| **🏥 WiCare Web Dashboard** | [${dashboardLanUrl}](${dashboardLanUrl}) | [http://localhost:${ports.web}](http://localhost:${ports.web}) |\n`;
  md += `| **🧪 Simulator Web UI** | [${simulatorLanUrl}](${simulatorLanUrl}) | [http://localhost:${ports.simulator}](http://localhost:${ports.simulator}) |\n`;
  md += `| **⚙️ API Server (Health)** | [${apiHealthLanUrl}](${apiHealthLanUrl}) | [http://localhost:${ports.api}/health](http://localhost:${ports.api}/health) |\n`;
  md += `| **📊 Simulator Status API** | [${simStatusLanUrl}](${simStatusLanUrl}) | [http://localhost:${ports.simulator}/status](http://localhost:${ports.simulator}/status) |\n`;
  md += `| **📡 MQTT Broker** | \`${mqttLanUrl}\` | \`mqtt://localhost:${ports.mqtt}\` |\n\n`;

  md += `---\n\n`;

  md += `## 📱 Service Endpoints\n\n`;
  md += `### 1. WiCare Clinical Monitoring Web App\n`;
  md += `Real-time ICU patient monitoring dashboard with live waveforms, alerts, and AI Clinical Explainer.\n\n`;
  md += `- **Local (Current PC):** [http://localhost:${ports.web}](http://localhost:${ports.web})\n`;
  md += `- **LAN (Phone / Tablet / Laptop):** [${dashboardLanUrl}](${dashboardLanUrl})\n\n`;

  md += `### 2. Patient Telemetry Simulator\n`;
  md += `Interactive control panel for 5 simulated ICU beds (normal rhythm, tachycardia, hypoxia, cardiac arrest, signal dropouts).\n\n`;
  md += `- **Simulator Web UI (Local):** [http://localhost:${ports.simulator}](http://localhost:${ports.simulator})\n`;
  md += `- **Simulator Web UI (LAN):** [${simulatorLanUrl}](${simulatorLanUrl})\n`;
  md += `- **Simulator Status API:** [${simStatusLanUrl}](${simStatusLanUrl})\n\n`;

  md += `### 3. WiCare Backend API & WebSocket Server\n`;
  md += `Fastify REST API & Socket.IO real-time stream.\n\n`;
  md += `- **Local API Root:** [http://localhost:${ports.api}](http://localhost:${ports.api})\n`;
  md += `- **Local Health Check:** [http://localhost:${ports.api}/health](http://localhost:${ports.api}/health)\n`;
  md += `- **LAN Health Check:** [${apiHealthLanUrl}](${apiHealthLanUrl})\n\n`;

  md += `### 4. MQTT Broker (Embedded Aedes)\n`;
  md += `Wireless telemetry transport broker (listens on \`0.0.0.0:${ports.mqtt}\`).\n\n`;
  md += `- **Local Broker:** \`mqtt://localhost:${ports.mqtt}\`\n`;
  md += `- **LAN Broker:** \`${mqttLanUrl}\`\n\n`;

  if (adapters.length > 1) {
    md += `---\n\n`;
    md += `## 🌐 All Detected Network Adapters\n\n`;
    md += `If your device is connected to a different network (e.g. secondary Wi-Fi, Ethernet, or mobile hotspot), select the matching adapter:\n\n`;
    md += `| Adapter Name | IPv4 Address | Web App Link | Simulator Link |\n`;
    md += `| :--- | :--- | :--- | :--- |\n`;
    for (const item of adapters) {
      const isPrimary = item.address === primaryIp ? ' ⭐ *(Primary)*' : item.isVirtual ? ' *(Virtual/VPN)*' : '';
      md += `| **${item.name}**${isPrimary} | \`${item.address}\` | [http://${item.address}:${ports.web}](http://${item.address}:${ports.web}) | [http://${item.address}:${ports.simulator}](http://${item.address}:${ports.simulator}) |\n`;
    }
    md += `\n`;
  }

  md += `---\n\n`;
  md += `## 📋 Quick Copy & Paste Links\n\n`;
  md += `\`\`\`text\n`;
  md += `Web Dashboard (LAN):  ${dashboardLanUrl}\n`;
  md += `Web Dashboard (Local): http://localhost:${ports.web}\n`;
  md += `Simulator UI (LAN):   ${simulatorLanUrl}\n`;
  md += `Simulator UI (Local):  http://localhost:${ports.simulator}\n`;
  md += `API Health (LAN):     ${apiHealthLanUrl}\n`;
  md += `API Health (Local):    http://localhost:${ports.api}/health\n`;
  md += `Simulator Status (LAN): ${simStatusLanUrl}\n`;
  md += `MQTT Broker (LAN):    ${mqttLanUrl}\n`;
  md += `\`\`\`\n\n`;

  md += `> [!TIP]\n`;
  md += `> **Network Reachability & Windows Firewall Guidance:**\n`;
  md += `> 1. Ensure your phone/tablet is connected to the same Wi-Fi network (\`${primaryInterface}\`).\n`;
  md += `> 2. Ensure your Wi-Fi network profile in Windows Settings is set to **Private Network** (Public networks block incoming connections).\n`;
  md += `> 3. If a mobile device cannot load the page, verify that Windows Defender Firewall allows incoming connections for Node.js on Private networks.\n`;

  return md;
}
