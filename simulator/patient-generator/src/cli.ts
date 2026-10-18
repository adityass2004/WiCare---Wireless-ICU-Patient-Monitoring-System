import { SimulationManager } from './manager.js';
import type { ScenarioType, VitalType } from '@wicare/shared';
import type { NetworkEmulatorConfig } from '@wicare/network-emulator';

interface CliArgs {
  count: number;
  speed: number;
  durationMs: number | null;
  scenario: { patientId: string; scenario: string } | null;
  override: { patientId: string; vital: string; value: number } | null;
  mqtt: boolean;
  brokerUrl: string;
  qos: 0 | 1;
  publishIntervalMs: number;
  loss: number;
  delay: number;
  jitter: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    count: 3,
    speed: 1,
    durationMs: null,
    scenario: null,
    override: null,
    mqtt: true,
    brokerUrl: 'mqtt://localhost:1883',
    qos: 0,
    publishIntervalMs: 1000,
    loss: 0,
    delay: 0,
    jitter: 0,
  };

  const positional = argv.filter((a) => !a.startsWith('--'));
  if (positional[0]) args.count = Math.max(1, parseInt(positional[0], 10) || 3);

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--speed') {
      args.speed = parseFloat(argv[++i] ?? '1') || 1;
    } else if (a === '--duration') {
      args.durationMs = (parseFloat(argv[++i] ?? '0') || 0) * 1000;
    } else if (a === '--scenario') {
      args.scenario = { patientId: argv[++i] ?? '', scenario: argv[++i] ?? '' };
    } else if (a === '--override') {
      args.override = {
        patientId: argv[++i] ?? '',
        vital: argv[++i] ?? '',
        value: parseFloat(argv[++i] ?? '0'),
      };
    } else if (a === '--mqtt') {
      args.mqtt = true;
    } else if (a === '--no-mqtt') {
      args.mqtt = false;
    } else if (a === '--broker') {
      args.brokerUrl = argv[++i] ?? args.brokerUrl;
    } else if (a === '--qos') {
      args.qos = (parseInt(argv[++i] ?? '0', 10) === 1 ? 1 : 0) as 0 | 1;
    } else if (a === '--publish-interval') {
      args.publishIntervalMs = parseInt(argv[++i] ?? '1000', 10) || 1000;
    } else if (a === '--loss') {
      args.loss = parseFloat(argv[++i] ?? '0') || 0;
    } else if (a === '--delay') {
      args.delay = parseFloat(argv[++i] ?? '0') || 0;
    } else if (a === '--jitter') {
      args.jitter = parseFloat(argv[++i] ?? '0') || 0;
    }
  }
  return args;
}

function fmt(value: number, quality: string): string {
  const marker = quality === 'ok' ? '' : ` [${quality}]`;
  return `${value.toFixed(1)}${marker}`;
}

const SCENARIOS_LIST: ScenarioType[] = [
  'stable',
  'rising_hr',
  'falling_spo2',
  'deterioration',
  'sudden_change',
  'sensor_malfunction',
];

function render(manager: SimulationManager, tick: number, selectedId: string, actionBanner: string): string {
  const lines: string[] = [];
  lines.push('═'.repeat(108));
  lines.push(`  WiCare Interactive Patient Telemetry Simulator  |  Beds: ${manager.patientCount}  |  Speed: ${manager.speed}x  |  Tick: ${tick}`);
  lines.push('═'.repeat(108));
  const header =
    '   Patient   Bed   Ward   HR(bpm)   SpO2(%)   Temp(C)   RR(brpm)   ECG(mV)   Scenario';
  lines.push(header);
  lines.push('─'.repeat(108));

  for (const p of manager.listPatients()) {
    const isSelected = p.identity.patientId === selectedId;
    const prefix = isSelected ? '▶ ' : '  ';
    const latest = p.getLatest();
    const hr = latest.heart_rate;
    const spo2 = latest.spo2;
    const temp = latest.temperature;
    const rr = latest.respiratory_rate;
    const ecg = latest.ecg;
    lines.push(
      prefix +
      [
        p.identity.patientId.padEnd(9),
        p.identity.bedId.padEnd(5),
        p.identity.ward.padEnd(6),
        hr ? fmt(hr.value, hr.quality).padStart(8) : '—'.padStart(8),
        spo2 ? fmt(spo2.value, spo2.quality).padStart(9) : '—'.padStart(9),
        temp ? fmt(temp.value, temp.quality).padStart(9) : '—'.padStart(9),
        rr ? fmt(rr.value, rr.quality).padStart(10) : '—'.padStart(10),
        ecg ? fmt(ecg.value, ecg.quality).padStart(9) : '—'.padStart(9),
        p.currentScenario,
      ].join(' '),
    );
  }
  lines.push('─'.repeat(108));
  if (actionBanner) {
    lines.push(`  Action: >> ${actionBanner}`);
    lines.push('─'.repeat(108));
  }
  lines.push('  [+] Add Bed          [-] Remove Bed        [1-9] Select Bed');
  lines.push('  [s] Next Scenario    [h/l] HR (+10/-10)    [o/p] SpO2 (-3/+3%)    [t/r] Temp (+/-0.5)');
  lines.push('  [n] Reset Baseline   [f] Clock Speed       [q] Exit Simulator');
  lines.push('═'.repeat(108));
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manager = new SimulationManager({ speed: args.speed, tickIntervalMs: 1000, seed: 42 });

  const networkConfig: NetworkEmulatorConfig | undefined =
    args.loss > 0 || args.delay > 0 || args.jitter > 0
      ? { lossRate: args.loss, fixedDelayMs: args.delay, jitterMs: args.jitter, seed: 7 }
      : undefined;

  for (let i = 0; i < args.count; i++) {
    const id = `P-${String(i + 1).padStart(3, '0')}`;
    manager.addPatient({
      patientId: id,
      bedId: `B-${i + 1}`,
      ward: 'ICU',
      deviceId: `DEV-${String(i + 1).padStart(3, '0')}`,
    });
  }

  if (args.mqtt) {
    console.log(`Connecting ${args.count} devices to ${args.brokerUrl} (QoS ${args.qos})...`);
    if (networkConfig) {
      console.log(
        `Network emulator: loss=${(networkConfig.lossRate * 100).toFixed(0)}% delay=${networkConfig.fixedDelayMs}ms jitter=${networkConfig.jitterMs}ms`,
      );
    }
    await Promise.all(
      manager.listPatients().map((p) =>
        p.connectMqtt({
          brokerUrl: args.brokerUrl,
          qos: args.qos,
          publishIntervalMs: args.publishIntervalMs,
          networkConfig,
        }),
      ),
    );
    console.log('All devices connected and publishing.\n');
  }

  let tick = 0;
  let selectedIndex = 0;
  let actionBanner = `Interactive controller ready. Targeting Bed B-1.`;

  const getSelectedPatient = () => {
    const list = manager.listPatients();
    if (list.length === 0) return undefined;
    if (selectedIndex >= list.length) selectedIndex = list.length - 1;
    if (selectedIndex < 0) selectedIndex = 0;
    return list[selectedIndex];
  };

  const addBed = async () => {
    const list = manager.listPatients();
    const nextIdx = list.length + 1;
    if (nextIdx > 50) {
      actionBanner = 'Max 50 ward beds reached.';
      return;
    }
    const id = `P-${String(nextIdx).padStart(3, '0')}`;
    const p = manager.addPatient({
      patientId: id,
      bedId: `B-${nextIdx}`,
      ward: 'ICU',
      deviceId: `DEV-${String(nextIdx).padStart(3, '0')}`,
    });
    if (args.mqtt) {
      await p.connectMqtt({
        brokerUrl: args.brokerUrl,
        qos: args.qos,
        publishIntervalMs: args.publishIntervalMs,
        networkConfig,
      });
    }
    actionBanner = `Added Bed B-${nextIdx} (${id}) -> Live on MQTT!`;
  };

  const removeBed = async () => {
    const list = manager.listPatients();
    if (list.length <= 1) {
      actionBanner = 'Cannot remove last bed.';
      return;
    }
    const last = list[list.length - 1];
    if (last) {
      await last.disconnectMqtt();
      manager.removePatient(last.identity.patientId);
      if (selectedIndex >= manager.patientCount) {
        selectedIndex = Math.max(0, manager.patientCount - 1);
      }
      actionBanner = `Removed Bed ${last.identity.bedId} -> Sent offline status over MQTT.`;
    }
  };

  const cycleScenario = () => {
    const p = getSelectedPatient();
    if (!p) return;
    const curr = p.currentScenario as ScenarioType;
    const nextIdx = (SCENARIOS_LIST.indexOf(curr) + 1) % SCENARIOS_LIST.length;
    const nextScen = SCENARIOS_LIST[nextIdx] ?? 'stable';
    p.setScenario(nextScen);
    actionBanner = `Bed ${p.identity.bedId} scenario -> '${nextScen}'`;
  };

  const adjustVital = (vital: VitalType, delta: number, unit: string) => {
    const p = getSelectedPatient();
    if (!p) return;
    const latest = p.getLatest()[vital];
    const base = latest ? latest.value : (vital === 'heart_rate' ? 72 : vital === 'spo2' ? 98 : 37);
    const updated = Math.round((base + delta) * 10) / 10;
    p.setOverride(vital, updated);
    actionBanner = `Bed ${p.identity.bedId} override ${vital} -> ${updated} ${unit}`;
  };

  const resetPatient = () => {
    const p = getSelectedPatient();
    if (!p) return;
    p.clearOverride('heart_rate');
    p.clearOverride('spo2');
    p.clearOverride('temperature');
    p.clearOverride('respiratory_rate');
    p.setScenario('stable');
    actionBanner = `Bed ${p.identity.bedId} reset to Stable baseline.`;
  };

  const cycleSpeed = () => {
    const speeds = [1, 2, 5, 10];
    const curr = speeds.indexOf(manager.speed);
    const nextSpd = speeds[(curr + 1) % speeds.length] ?? 1;
    manager.setSpeed(nextSpd);
    actionBanner = `Clock speed -> ${nextSpd}x`;
  };

  manager.clock.onTick(() => {
    tick++;
    console.clear();
    const p = getSelectedPatient();
    console.log(render(manager, tick, p ? p.identity.patientId : '', actionBanner));
  });

  manager.start();

  const shutdown = async () => {
    if (process.stdin.isTTY) {
      try {
        process.stdin.setRawMode(false);
      } catch {
        // ignore stdin errors on shutdown
      }
    }
    manager.stop();
    if (args.mqtt) {
      console.log('\nDisconnecting MQTT devices and sending offline status...');
      await Promise.all(manager.listPatients().map((p) => p.disconnectMqtt()));
    }
    console.log('WiCare simulation stopped.');
    process.exit(0);
  };

  if (process.stdin.isTTY) {
    try {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', async (keyStr: string) => {
        const key = keyStr.toString();
        if (key === '\u0003' || key.toLowerCase() === 'q') {
          await shutdown();
        } else if (key === '+' || key === '=') {
          await addBed();
        } else if (key === '-' || key === '_') {
          await removeBed();
        } else if (key >= '1' && key <= '9') {
          const num = parseInt(key, 10) - 1;
          const list = manager.listPatients();
          const target = list[num];
          if (target) {
            selectedIndex = num;
            actionBanner = `Selected Bed ${target.identity.bedId} (${target.identity.patientId})`;
          }
        } else if (key === ']' || key === '\u001b[C' || key === '\u001b[B') {
          const list = manager.listPatients();
          if (list.length > 0) {
            selectedIndex = (selectedIndex + 1) % list.length;
            const target = list[selectedIndex];
            if (target) actionBanner = `Selected Bed ${target.identity.bedId}`;
          }
        } else if (key === '[' || key === '\u001b[D' || key === '\u001b[A') {
          const list = manager.listPatients();
          if (list.length > 0) {
            selectedIndex = (selectedIndex - 1 + list.length) % list.length;
            const target = list[selectedIndex];
            if (target) actionBanner = `Selected Bed ${target.identity.bedId}`;
          }
        } else if (key.toLowerCase() === 's') {
          cycleScenario();
        } else if (key === 'h') {
          adjustVital('heart_rate', 10, 'bpm');
        } else if (key === 'H') {
          adjustVital('heart_rate', 25, 'bpm');
        } else if (key === 'l') {
          adjustVital('heart_rate', -10, 'bpm');
        } else if (key === 'L') {
          adjustVital('heart_rate', -25, 'bpm');
        } else if (key.toLowerCase() === 'o') {
          adjustVital('spo2', -3, '%');
        } else if (key.toLowerCase() === 'p') {
          adjustVital('spo2', 3, '%');
        } else if (key.toLowerCase() === 't') {
          adjustVital('temperature', 0.5, '°C');
        } else if (key.toLowerCase() === 'r') {
          adjustVital('temperature', -0.5, '°C');
        } else if (key.toLowerCase() === 'n') {
          resetPatient();
        } else if (key.toLowerCase() === 'f') {
          cycleSpeed();
        }
        console.clear();
        const p = getSelectedPatient();
        console.log(render(manager, tick, p ? p.identity.patientId : '', actionBanner));
      });
    } catch {
      // Non-interactive fallback
    }
  }

  process.on('SIGINT', shutdown);

  if (args.durationMs) {
    setTimeout(shutdown, args.durationMs);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
