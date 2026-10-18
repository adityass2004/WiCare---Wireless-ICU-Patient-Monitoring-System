import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { runSingleConfig, type ExperimentConfig, type SingleRunResult, type AggregatedResult } from './experiment-runner.js';

interface FlaggedTarget {
  runId: string;
  cfg: ExperimentConfig;
  seed: number;
  port: number;
}

const targets: FlaggedTarget[] = [
  {
    runId: 'run-50N-10L-Q0-adaptive-S202',
    cfg: { nodeCount: 50, lossRate: 0.10, qos: 0, strategy: 'adaptive', delayMs: 30, jitterMs: 10 },
    seed: 202,
    port: 29101,
  },
  {
    runId: 'run-50N-10L-Q1-adaptive-S202',
    cfg: { nodeCount: 50, lossRate: 0.10, qos: 1, strategy: 'adaptive', delayMs: 30, jitterMs: 10 },
    seed: 202,
    port: 29102,
  },
  {
    runId: 'run-50N-25L-Q0-adaptive-S202',
    cfg: { nodeCount: 50, lossRate: 0.25, qos: 0, strategy: 'adaptive', delayMs: 30, jitterMs: 10 },
    seed: 202,
    port: 29103,
  },
];

async function main() {
  console.log('===============================================================');
  console.log('  Targeted Re-execution of Flagged Runs with Alert Guard Pass  ');
  console.log('===============================================================');

  const resultsDir = path.resolve(process.cwd(), 'docs/data/results');
  const rawCsvPath = path.join(resultsDir, 'raw_experiment_runs.csv');
  const backupCsvPath = path.join(resultsDir, 'raw_experiment_runs_pre_patch.csv');

  if (!fs.existsSync(backupCsvPath)) {
    fs.copyFileSync(rawCsvPath, backupCsvPath);
    console.log(`Created backup of original raw data: ${backupCsvPath}`);
  }

  // Parse existing raw CSV
  const rawLines = fs.readFileSync(rawCsvPath, 'utf-8').trim().split('\n');
  const header = rawLines[0]!;
  const cols = header.split(',');

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < rawLines.length; i++) {
    const vals = rawLines[i]!.split(',');
    const obj: Record<string, string> = {};
    cols.forEach((c, idx) => {
      obj[c] = vals[idx] ?? '';
    });
    rows.push(obj);
  }

  console.log(`Loaded ${rows.length} existing raw runs from ${rawCsvPath}`);

  // Re-run the 3 flagged configurations
  const replacements: { runId: string; oldAlert: number; newAlert: number; result: SingleRunResult }[] = [];

  for (const t of targets) {
    console.log(`\nRe-running flagged: ${t.runId} (50 nodes | ${t.cfg.lossRate * 100}% loss | QoS ${t.cfg.qos} | seed ${t.seed})...`);
    const oldRow = rows.find((r) => r.run_id === t.runId);
    const oldAlert = oldRow ? Number(oldRow.alert_delivery_ms) : -1;

    const newResult = await runSingleConfig(t.cfg, t.seed, t.port, 30);
    console.log(`Finished: ${t.runId} -> Old Alert: ${oldAlert}ms | Corrected Alert: ${newResult.alertDeliveryMs}ms | PDR: ${newResult.pdrPct}%`);
    replacements.push({
      runId: t.runId,
      oldAlert,
      newAlert: newResult.alertDeliveryMs,
      result: newResult,
    });

    // Update in-memory row
    const targetIdx = rows.findIndex((r) => r.run_id === t.runId);
    if (targetIdx !== -1) {
      rows[targetIdx] = {
        run_id: newResult.runId,
        seed: String(newResult.seed),
        node_count: String(newResult.nodeCount),
        loss_rate: String(newResult.lossRate),
        qos: String(newResult.qos),
        strategy: newResult.strategy,
        total_dispatched: String(newResult.totalDispatched),
        total_received: String(newResult.totalReceived),
        pdr_pct: String(newResult.pdrPct),
        mean_latency_ms: String(newResult.meanLatencyMs),
        median_latency_ms: String(newResult.medianLatencyMs),
        p95_latency_ms: String(newResult.p95LatencyMs),
        p99_latency_ms: String(newResult.p99LatencyMs),
        mean_aoi_ms: String(newResult.meanAoIMs),
        median_aoi_ms: String(newResult.medianAoIMs),
        p95_aoi_ms: String(newResult.p95AoIMs),
        p99_aoi_ms: String(newResult.p99AoIMs),
        alert_delivery_ms: String(newResult.alertDeliveryMs),
        throughput_msg_sec: String(newResult.throughputMsgPerSec),
        throughput_kbps: String(newResult.throughputKbps),
        buffer_overflows: String(newResult.bufferOverflows),
        total_bytes: String(newResult.totalBytes),
        duration_sec: String(newResult.durationSec),
      };
    }
  }

  // 1. Write updated raw CSV
  let updatedRawCsv = header + '\n';
  for (const r of rows) {
    updatedRawCsv += cols.map((c) => r[c]).join(',') + '\n';
  }
  fs.writeFileSync(rawCsvPath, updatedRawCsv, 'utf-8');
  console.log(`\nUpdated raw CSV saved to: ${rawCsvPath}`);

  // 2. Recompute aggregated condition metrics
  const conditionMap = new Map<string, Record<string, string>[]>();
  for (const r of rows) {
    const key = `${r.node_count}_${r.loss_rate}_${r.qos}_${r.strategy}`;
    const list = conditionMap.get(key) ?? [];
    list.push(r);
    conditionMap.set(key, list);
  }

  const aggregated: AggregatedResult[] = [];
  for (const [, runList] of conditionMap.entries()) {
    const first = runList[0]!;
    const pdrVals = runList.map((x) => Number(x.pdr_pct));
    const pdrMean = pdrVals.reduce((a, b) => a + b, 0) / pdrVals.length;
    const pdrVariance = pdrVals.reduce((a, b) => a + Math.pow(b - pdrMean, 2), 0) / pdrVals.length;
    const pdrStd = Math.sqrt(pdrVariance);

    const meanLat = Math.round(runList.reduce((a, b) => a + Number(b.mean_latency_ms), 0) / runList.length);
    const medLat = Math.round(runList.reduce((a, b) => a + Number(b.median_latency_ms), 0) / runList.length);
    const p95Lat = Math.round(runList.reduce((a, b) => a + Number(b.p95_latency_ms), 0) / runList.length);
    const p99Lat = Math.round(runList.reduce((a, b) => a + Number(b.p99_latency_ms), 0) / runList.length);

    const meanAoI = Math.round(runList.reduce((a, b) => a + Number(b.mean_aoi_ms), 0) / runList.length);
    const p95AoI = Math.round(runList.reduce((a, b) => a + Number(b.p95_aoi_ms), 0) / runList.length);
    const alertLat = Math.round(runList.reduce((a, b) => a + Number(b.alert_delivery_ms), 0) / runList.length);
    const tputMsg = Number((runList.reduce((a, b) => a + Number(b.throughput_msg_sec), 0) / runList.length).toFixed(2));
    const tputKbps = Number((runList.reduce((a, b) => a + Number(b.throughput_kbps), 0) / runList.length).toFixed(2));
    const overflows = runList.reduce((a, b) => a + Number(b.buffer_overflows), 0);

    aggregated.push({
      nodeCount: Number(first.node_count),
      lossRate: Number(first.loss_rate),
      qos: Number(first.qos) as 0 | 1,
      strategy: first.strategy as 'fixed' | 'adaptive',
      runsCount: runList.length,
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
  console.log(`Updated aggregated CSV saved to: ${aggCsvPath}`);

  // 3. Update summary JSON
  const jsonPath = path.join(resultsDir, 'summary_metrics.json');
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        isPilot: false,
        totalRuns: rows.length,
        durationSecPerRun: 30,
        conditionsCount: aggregated.length,
        aggregatedMetrics: aggregated,
      },
      null,
      2,
    ),
    'utf-8',
  );
  console.log(`Updated JSON summary saved to: ${jsonPath}`);

  // 4. Update legacy CSV
  const legacyCsvPath = path.join(process.cwd(), 'docs/data/experiment_results.csv');
  let legCsv =
    'node_count,loss_rate,qos,strategy,mean_latency_ms,p95_latency_ms,p99_latency_ms,pdr_pct,alert_delivery_ms,aoi_ms,buffer_overflows,message_count,total_bytes\n';
  for (const a of aggregated) {
    legCsv += `${a.nodeCount},${a.lossRate},${a.qos},${a.strategy},${a.meanLatencyMs},${a.p95LatencyMs},${a.p99LatencyMs},${a.pdrMean},${a.alertDeliveryMs},${a.p95AoIMs},${a.bufferOverflows},${Math.round(a.throughputMsgPerSec * 30)},${Math.round(a.throughputKbps * 30 * 125)}\n`;
  }
  fs.writeFileSync(legacyCsvPath, legCsv, 'utf-8');
  console.log(`Updated legacy CSV saved to: ${legacyCsvPath}`);

  // 5. Regenerate plots
  console.log('\nRegenerating plots via generate_plots.py...');
  const pyCmd = process.platform === 'win32' ? 'py' : 'python3';
  execSync(`${pyCmd} scripts/generate_plots.py`, { stdio: 'inherit' });

  console.log('\n===============================================================');
  console.log('  Patch Summary of Targeted Replaced Runs:                    ');
  console.log('===============================================================');
  for (const rep of replacements) {
    console.log(`- ${rep.runId}: alert_delivery_ms changed from ${rep.oldAlert}ms to ${rep.newAlert}ms (PDR: ${rep.result.pdrPct}%)`);
  }
}

main().catch((err) => {
  console.error('Error during patch execution:', err);
  process.exit(1);
});
