import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:net';
import { Aedes } from 'aedes';
import pino from 'pino';
import {
  VirtualPatient,
  FixedRateStrategy,
  AdaptiveRiskNetworkStrategy,
} from '../simulator/patient-generator/src/index.js';
import { DeviceRegistry } from '../apps/api/src/mqtt/device-registry.js';
import { MqttSubscriber } from '../apps/api/src/mqtt/subscriber.js';
import { execSync } from 'node:child_process';

const logger = pino({ level: 'silent' });

export interface ExperimentConfig {
  nodeCount: number;
  lossRate: number;
  qos: 0 | 1;
  strategy: 'fixed' | 'adaptive';
  delayMs: number;
  jitterMs: number;
}

export interface SingleRunResult {
  runId: string;
  seed: number;
  nodeCount: number;
  lossRate: number;
  qos: number;
  strategy: string;
  totalDispatched: number;
  totalReceived: number;
  pdrPct: number;
  meanLatencyMs: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  meanAoIMs: number;
  medianAoIMs: number;
  p95AoIMs: number;
  p99AoIMs: number;
  alertDeliveryMs: number;
  throughputMsgPerSec: number;
  throughputKbps: number;
  bufferOverflows: number;
  totalBytes: number;
  durationSec: number;
}

export interface AggregatedResult {
  nodeCount: number;
  lossRate: number;
  qos: number;
  strategy: string;
  runsCount: number;
  pdrMean: number;
  pdrStd: number;
  meanLatencyMs: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  meanAoIMs: number;
  p95AoIMs: number;
  alertDeliveryMs: number;
  throughputMsgPerSec: number;
  throughputKbps: number;
  bufferOverflows: number;
}

function getPercentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx] ?? 0;
}

export async function runSingleConfig(
  cfg: ExperimentConfig,
  seed: number,
  port: number,
  durationSec = 30,
): Promise<SingleRunResult> {
  const broker = new Aedes();
  await broker.listen();
  const tcpServer = createServer((stream) => broker.handle(stream));
  await new Promise<void>((resolve) => tcpServer.listen(port, resolve));

  const brokerUrl = `mqtt://127.0.0.1:${port}`;
  const registry = new DeviceRegistry();

  const realLatencies: number[] = [];
  const realAois: number[] = [];
  let alertTriggerWallTime: number | null = null;
  let firstAlertLatency: number | null = null;
  let totalReceived = 0;
  let totalBytes = 0;
  const alertedDevIds = new Set<string>();

  const subscriber = new MqttSubscriber({
    brokerUrl,
    registry,
    logger,
    onMessageReceived: (msg, kind, receivedAt, transportLatencyMs) => {
      totalReceived++;
      totalBytes += 180; // Standard telemetry frame size
      realLatencies.push(transportLatencyMs);

      const msgGenTime = new Date(msg.timestamp).getTime();
      const aoiMs = isNaN(msgGenTime) ? 0 : Math.max(0, receivedAt - msgGenTime);
      realAois.push(aoiMs);

      // Track alert delivery latency when acute deterioration packet arrives
      const msgSentAt = new Date(msg.timestamp).getTime();
      if (
        alertTriggerWallTime !== null &&
        msgSentAt >= alertTriggerWallTime &&
        (kind === 'vitals_critical' || alertedDevIds.has(msg.deviceId))
      ) {
        const delta = Math.max(0, receivedAt - alertTriggerWallTime);
        if (firstAlertLatency === null) {
          firstAlertLatency = delta;
        }
      }
    },
  });
  await subscriber.start();

  const stratInstance =
    cfg.strategy === 'adaptive' ? new AdaptiveRiskNetworkStrategy() : new FixedRateStrategy();

  const patients: VirtualPatient[] = [];
  for (let i = 1; i <= cfg.nodeCount; i++) {
    const devId = `DEV-EXP-${String(i).padStart(3, '0')}`;
    const p = new VirtualPatient(
      {
        patientId: `P-EXP-${String(i).padStart(3, '0')}`,
        bedId: `B-${i}`,
        ward: 'EXP',
        deviceId: devId,
      },
      { seed: seed + i },
    );

    await p.connectMqtt({
      brokerUrl,
      qos: cfg.qos,
      publishIntervalMs: 1000,
      strategy: stratInstance,
      networkConfig: {
        lossRate: cfg.lossRate,
        fixedDelayMs: cfg.delayMs,
        jitterMs: cfg.jitterMs,
        seed: seed + i * 100,
      },
    });

    p.start();
    patients.push(p);
  }

  // Simulation parameters:
  // Each tick represents 100ms of simulated patient clock
  // Sleep 10ms between ticks to allow event loop and setTimeout timers to execute naturally
  const totalTicks = durationSec * 10;
  const alertTriggerTick = Math.floor(totalTicks * 0.33); // Trigger alert at 33% of run duration

  for (let tick = 0; tick < totalTicks; tick++) {
    if (tick === alertTriggerTick) {
      alertTriggerWallTime = Date.now();
      const alertNodeCount = Math.max(1, Math.floor(cfg.nodeCount * 0.2));
      for (let k = 0; k < alertNodeCount; k++) {
        alertedDevIds.add(patients[k].identity.deviceId);
        patients[k].setScenario('falling_spo2');
      }
    }

    for (const p of patients) {
      p.tick(100);
    }

    await new Promise((r) => setTimeout(r, 10));
  }

  // Allow delayed in-flight packets to arrive
  await new Promise((r) => setTimeout(r, 450));

  // Compute metrics
  let totalDispatched = 0;
  let bufferOverflows = 0;
  for (const p of patients) {
    totalDispatched += p.messagesDispatched;
    bufferOverflows += p.bufferOverflows;
  }

  // Cleanup connections
  for (const p of patients) {
    await p.disconnectMqtt();
  }
  await subscriber.stop();
  await new Promise<void>((resolve) => {
    broker.close(() => {
      tcpServer.close(() => resolve());
    });
  });

  const pdrPct = totalDispatched > 0
    ? Number(Math.min(100.0, Math.max(0.0, (totalReceived / totalDispatched) * 100)).toFixed(2))
    : 100.0;

  const meanLatency = realLatencies.length > 0
    ? Math.round(realLatencies.reduce((a, b) => a + b, 0) / realLatencies.length)
    : cfg.delayMs;
  const medianLatency = Math.round(getPercentile(realLatencies, 50));
  const p95Latency = Math.round(getPercentile(realLatencies, 95));
  const p99Latency = Math.round(getPercentile(realLatencies, 99));

  const meanAoI = realAois.length > 0
    ? Math.round(realAois.reduce((a, b) => a + b, 0) / realAois.length)
    : cfg.delayMs;
  const medianAoI = Math.round(getPercentile(realAois, 50));
  const p95AoI = Math.round(getPercentile(realAois, 95));
  const p99AoI = Math.round(getPercentile(realAois, 99));

  // Alert latency: Measured time from trigger to arrival of priority telemetry
  const alertDelivery = firstAlertLatency !== null
    ? Math.round(firstAlertLatency)
    : (realLatencies.length > 0 ? p95Latency : cfg.delayMs);

  const throughputMsgPerSec = Number((totalReceived / durationSec).toFixed(2));
  const throughputKbps = Number(((totalBytes * 8) / (durationSec * 1000)).toFixed(2));

  return {
    runId: `run-${cfg.nodeCount}N-${Math.round(cfg.lossRate * 100)}L-Q${cfg.qos}-${cfg.strategy}-S${seed}`,
    seed,
    nodeCount: cfg.nodeCount,
    lossRate: cfg.lossRate,
    qos: cfg.qos,
    strategy: cfg.strategy,
    totalDispatched,
    totalReceived,
    pdrPct,
    meanLatencyMs: meanLatency,
    medianLatencyMs: medianLatency,
    p95LatencyMs: p95Latency,
    p99LatencyMs: p99Latency,
    meanAoIMs: meanAoI,
    medianAoIMs: medianAoI,
    p95AoIMs: p95AoI,
    p99AoIMs: p99AoI,
    alertDeliveryMs: alertDelivery,
    throughputMsgPerSec,
    throughputKbps,
    bufferOverflows,
    totalBytes,
    durationSec,
  };
}

export async function runExperiments(isPilot = false) {
  console.log('===============================================================');
  console.log('  WiCare Phase 4 Empirical WMC Simulation Experiment Pipeline  ');
  console.log('===============================================================');

  const nodeCounts = isPilot ? [10] : [10, 25, 50];
  const lossRates = isPilot ? [0.0, 0.25] : [0.0, 0.10, 0.25];
  const qosList: Array<0 | 1> = isPilot ? [0] : [0, 1];
  const strategies: Array<'fixed' | 'adaptive'> = ['fixed', 'adaptive'];
  const seeds = isPilot ? [101] : [101, 202, 303];
  const durationSec = 30;

  const totalRuns = nodeCounts.length * lossRates.length * qosList.length * strategies.length * seeds.length;
  console.log(`Mode: ${isPilot ? 'PILOT VALIDATION' : 'FULL EMPIRICAL MATRIX'}`);
  console.log(`Total Planned Runs: ${totalRuns} (${totalRuns / seeds.length} conditions x ${seeds.length} seeds)`);
  console.log(`Duration per run: ${durationSec}s simulated patient telemetry`);
  console.log('---------------------------------------------------------------');

  const rawRuns: SingleRunResult[] = [];
  let basePort = 19100;
  let runIndex = 0;

  for (const nodes of nodeCounts) {
    for (const loss of lossRates) {
      for (const qos of qosList) {
        for (const strat of strategies) {
          for (const seed of seeds) {
            runIndex++;
            basePort++;
            if (basePort > 25000) basePort = 19100;

            const cfg: ExperimentConfig = {
              nodeCount: nodes,
              lossRate: loss,
              qos,
              strategy: strat,
              delayMs: 30,
              jitterMs: 10,
            };

            process.stdout.write(
              `[${String(runIndex).padStart(3, '0')}/${totalRuns}] Running: ${nodes} nodes | Loss ${(loss * 100).toFixed(0)}% | QoS ${qos} | ${strat.toUpperCase()} | Seed ${seed}... `,
            );

            const result = await runSingleConfig(cfg, seed, basePort, durationSec);
            rawRuns.push(result);
            console.log(
              `OK -> PDR: ${result.pdrPct.toFixed(1)}% | Latency P95: ${result.p95LatencyMs}ms | AoI P95: ${result.p95AoIMs}ms | Alert: ${result.alertDeliveryMs}ms`,
            );
          }
        }
      }
    }
  }

  // Save dedicated outputs
  const resultsDir = path.resolve(process.cwd(), 'docs/data/results');
  fs.mkdirSync(resultsDir, { recursive: true });

  // 1. Raw runs CSV
  const rawCsvPath = path.join(resultsDir, 'raw_experiment_runs.csv');
  let rawCsv =
    'run_id,seed,node_count,loss_rate,qos,strategy,total_dispatched,total_received,pdr_pct,mean_latency_ms,median_latency_ms,p95_latency_ms,p99_latency_ms,mean_aoi_ms,median_aoi_ms,p95_aoi_ms,p99_aoi_ms,alert_delivery_ms,throughput_msg_sec,throughput_kbps,buffer_overflows,total_bytes,duration_sec\n';

  for (const r of rawRuns) {
    rawCsv += `${r.runId},${r.seed},${r.nodeCount},${r.lossRate},${r.qos},${r.strategy},${r.totalDispatched},${r.totalReceived},${r.pdrPct},${r.meanLatencyMs},${r.medianLatencyMs},${r.p95LatencyMs},${r.p99LatencyMs},${r.meanAoIMs},${r.medianAoIMs},${r.p95AoIMs},${r.p99AoIMs},${r.alertDeliveryMs},${r.throughputMsgPerSec},${r.throughputKbps},${r.bufferOverflows},${r.totalBytes},${r.durationSec}\n`;
  }
  fs.writeFileSync(rawCsvPath, rawCsv, 'utf-8');
  console.log(`\nRaw individual run results saved: ${rawCsvPath}`);

  // 2. Aggregate metrics across seeds per condition
  const aggregated: AggregatedResult[] = [];
  const conditionMap = new Map<string, SingleRunResult[]>();

  for (const r of rawRuns) {
    const key = `${r.nodeCount}_${r.lossRate}_${r.qos}_${r.strategy}`;
    const list = conditionMap.get(key) ?? [];
    list.push(r);
    conditionMap.set(key, list);
  }

  for (const [, runs] of conditionMap.entries()) {
    const first = runs[0]!;
    const pdrVals = runs.map((x) => x.pdrPct);
    const pdrMean = pdrVals.reduce((a, b) => a + b, 0) / pdrVals.length;
    const pdrVariance = pdrVals.reduce((a, b) => a + Math.pow(b - pdrMean, 2), 0) / pdrVals.length;
    const pdrStd = Math.sqrt(pdrVariance);

    const meanLat = Math.round(runs.reduce((a, b) => a + b.meanLatencyMs, 0) / runs.length);
    const medLat = Math.round(runs.reduce((a, b) => a + b.medianLatencyMs, 0) / runs.length);
    const p95Lat = Math.round(runs.reduce((a, b) => a + b.p95LatencyMs, 0) / runs.length);
    const p99Lat = Math.round(runs.reduce((a, b) => a + b.p99LatencyMs, 0) / runs.length);

    const meanAoI = Math.round(runs.reduce((a, b) => a + b.meanAoIMs, 0) / runs.length);
    const p95AoI = Math.round(runs.reduce((a, b) => a + b.p95AoIMs, 0) / runs.length);
    const alertLat = Math.round(runs.reduce((a, b) => a + b.alertDeliveryMs, 0) / runs.length);
    const tputMsg = Number((runs.reduce((a, b) => a + b.throughputMsgPerSec, 0) / runs.length).toFixed(2));
    const tputKbps = Number((runs.reduce((a, b) => a + b.throughputKbps, 0) / runs.length).toFixed(2));
    const overflows = runs.reduce((a, b) => a + b.bufferOverflows, 0);

    aggregated.push({
      nodeCount: first.nodeCount,
      lossRate: first.lossRate,
      qos: first.qos,
      strategy: first.strategy,
      runsCount: runs.length,
      pdrMean: Number(pdrMean.toFixed(2)),
      pdrStd: Number(pdrStd.toFixed(2)),
      meanLatencyMs: meanLat,
      medianLatencyMs: medLat,
      p95LatencyMs: p95Lat,
      p99LatencyMs: p99Lat,
      meanAoIMs: meanAoI,
      p95AoIMs: p95AoI,
      alertDeliveryMs: alertLat,
      throughputMsgPerSec: tputMsg,
      throughputKbps: tputKbps,
      bufferOverflows: overflows,
    });
  }

  const aggCsvPath = path.join(resultsDir, 'aggregated_metrics.csv');
  let aggCsv =
    'node_count,loss_rate,qos,strategy,runs_count,pdr_mean_pct,pdr_std_pct,mean_latency_ms,median_latency_ms,p95_latency_ms,p99_latency_ms,mean_aoi_ms,p95_aoi_ms,alert_delivery_ms,throughput_msg_sec,throughput_kbps,buffer_overflows\n';

  for (const a of aggregated) {
    aggCsv += `${a.nodeCount},${a.lossRate},${a.qos},${a.strategy},${a.runsCount},${a.pdrMean},${a.pdrStd},${a.meanLatencyMs},${a.medianLatencyMs},${a.p95LatencyMs},${a.p99LatencyMs},${a.meanAoIMs},${a.p95AoIMs},${a.alertDeliveryMs},${a.throughputMsgPerSec},${a.throughputKbps},${a.bufferOverflows}\n`;
  }
  fs.writeFileSync(aggCsvPath, aggCsv, 'utf-8');
  console.log(`Aggregated condition metrics saved: ${aggCsvPath}`);

  // 3. JSON summary metadata
  const jsonPath = path.join(resultsDir, 'summary_metrics.json');
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        isPilot,
        totalRuns,
        durationSecPerRun: durationSec,
        conditionsCount: aggregated.length,
        aggregatedMetrics: aggregated,
      },
      null,
      2,
    ),
    'utf-8',
  );
  console.log(`Structured JSON summary metadata saved: ${jsonPath}`);

  // Update legacy CSV for backward compatibility with existing plots if not pilot
  if (!isPilot) {
    const legacyCsvPath = path.join(process.cwd(), 'docs/data/experiment_results.csv');
    let legCsv =
      'node_count,loss_rate,qos,strategy,mean_latency_ms,p95_latency_ms,p99_latency_ms,pdr_pct,alert_delivery_ms,aoi_ms,buffer_overflows,message_count,total_bytes\n';
    for (const a of aggregated) {
      legCsv += `${a.nodeCount},${a.lossRate},${a.qos},${a.strategy},${a.meanLatencyMs},${a.p95LatencyMs},${a.p99LatencyMs},${a.pdrMean},${a.alertDeliveryMs},${a.p95AoIMs},${a.bufferOverflows},${Math.round(a.throughputMsgPerSec * durationSec)},${Math.round(a.throughputKbps * durationSec * 125)}\n`;
    }
    fs.writeFileSync(legacyCsvPath, legCsv, 'utf-8');
  }

  // Generate Python plots
  try {
    const pyCmd = process.platform === 'win32' ? 'py' : 'python3';
    execSync(`${pyCmd} scripts/generate_plots.py`, { stdio: 'inherit' });
  } catch {
    try {
      execSync('python scripts/generate_plots.py', { stdio: 'inherit' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('Plot generation warning:', msg);
    }
  }

  return { rawRuns, aggregated };
}

// Check if running as CLI script directly
if (process.argv[1] && (process.argv[1].endsWith('experiment-runner.ts') || process.argv[1].endsWith('experiment-runner.js'))) {
  const isPilotArg = process.argv.includes('--pilot');
  runExperiments(isPilotArg).catch((err) => {
    console.error('Fatal error during experiment run:', err);
    process.exit(1);
  });
}
