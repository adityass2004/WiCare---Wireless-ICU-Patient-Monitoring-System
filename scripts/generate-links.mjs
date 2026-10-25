import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectLanIp, generateAccessLinksMarkdown } from '../packages/shared/dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Load environment variables (.env / .env.local)
function loadEnv() {
  const env = { ...process.env };
  const envPath = path.join(rootDir, '.env');
  const envLocalPath = path.join(rootDir, '.env.local');

  const parseFile = (filePath) => {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let val = match[2].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          env[key] = val;
        }
      }
    }
  };

  parseFile(envPath);
  parseFile(envLocalPath);
  return env;
}

const env = loadEnv();

const ports = {
  web: env.WEB_PORT || '3000',
  api: env.API_PORT || '4000',
  simulator: env.SIMULATOR_PORT || '4001',
  mqtt: env.MQTT_PORT || '1883',
};

export function runGenerateLinks() {
  const lanResult = detectLanIp();
  const md = generateAccessLinksMarkdown(lanResult, ports);

  const outputPath = path.join(rootDir, 'links.md');
  fs.writeFileSync(outputPath, md, 'utf-8');

  const { primaryIp, primaryInterface, isLocalOnly, warning } = lanResult;

  if (isLocalOnly) {
    console.log(`
========================================================================
  🏥 WiCare Development Links Generated -> links.md
  
  ⚠️ NOTICE: ${warning}
  
  🌐 Web App (Local):     http://localhost:${ports.web}
  🧪 Simulator UI (Local): http://localhost:${ports.simulator}
  ⚡ API (Health):         http://localhost:${ports.api}/health
  📊 Simulator Status:     http://localhost:${ports.simulator}/status
  
  📄 Full access details saved to: links.md
========================================================================
`);
  } else {
    console.log(`
========================================================================
  🏥 WiCare Development Links Generated -> links.md
  
  🌐 Web App (Local):     http://localhost:${ports.web}
  📱 Web App (LAN/Phone):  http://${primaryIp}:${ports.web}
  
  🧪 Simulator UI (Local): http://localhost:${ports.simulator}
  🧪 Simulator UI (LAN):   http://${primaryIp}:${ports.simulator}
  
  ⚡ API (Health):         http://${primaryIp}:${ports.api}/health
  📊 Simulator Status:     http://${primaryIp}:${ports.simulator}/status
  
  📡 Active LAN Adapter:   ${primaryInterface} (${primaryIp})
  📄 Full access details saved to: links.md
========================================================================
`);
  }

  return lanResult;
}

runGenerateLinks();
