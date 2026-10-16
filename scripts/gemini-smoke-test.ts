/**
 * WiCare AI Clinical Deterioration Explainer — Live Gemini Smoke Test
 *
 * This command executes an isolated, opt-in live invocation against Google Gemini.
 * It uses purely synthetic, anonymized context with zero database or production dependencies.
 *
 * Requirements:
 * - Requires GEMINI_API_KEY to be set in environment or .env.
 * - Never prints the API key, authorization headers, full prompt, or sensitive provider stack traces.
 * - Enforces bounded timeout (default 10s).
 * - Validates response strictly against ExplainResponseSchema.
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { ExplainResponseSchema, type SanitizedPromptContext } from '@wicare/shared';
import { GeminiExplainerService, GeminiExplainerError } from '../apps/api/src/ai/gemini-explainer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

const apiKey = process.env.GEMINI_API_KEY?.trim();
const modelName = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
const isStrict = process.argv.includes('--require-key') || process.argv.includes('--strict');

console.log('================================================================');
console.log(' WiCare AI Clinical Explainer — Live Gemini Smoke Test');
console.log('================================================================');
console.log(`Configured Model: ${modelName}`);

if (!apiKey) {
  console.log('API Key Status:   NOT CONFIGURED (GEMINI_API_KEY is empty)');
  console.log('Execution Mode:   OPT-IN LIVE CHECK (Skipped)');
  console.log('----------------------------------------------------------------');
  console.log('[NOTICE] Live Gemini smoke test skipped because GEMINI_API_KEY');
  console.log('is not configured in the server environment or .env file.');
  console.log('');
  console.log('To run a live test against Google Gemini:');
  console.log('  1. Obtain a valid Gemini API key from Google AI Studio.');
  console.log('  2. Set GEMINI_API_KEY in your .env or shell environment.');
  console.log('  3. Run: npm run test:smoke:gemini');
  console.log('================================================================');

  if (isStrict) {
    console.error('[ERROR] Smoke test failed: --require-key was specified but GEMINI_API_KEY is not set.');
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// Key is configured: run live smoke test
const maskedKey = apiKey.length > 8
  ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)} (length: ${apiKey.length})`
  : '*** (masked)';
console.log(`API Key Status:   CONFIGURED [${maskedKey}]`);
console.log('Execution Mode:   LIVE GOOGLE GEMINI API CALL');
console.log('----------------------------------------------------------------');

// 1. Construct purely synthetic, anonymized test context
const syntheticContext: SanitizedPromptContext = {
  bedId: 'SYNTH-ICU-BED-99',
  ward: 'ICU-SMOKE-TEST',
  age: 64,
  gender: 'Female',
  primaryDiagnosis: 'Post-operative monitoring following elective surgical stabilization',
  recentReadings: [
    {
      timestamp: new Date(Date.now() - 120000).toISOString(),
      seq: 101,
      vitals: {
        heart_rate: { value: 76, unit: 'bpm' },
        spo2: { value: 98, unit: '%' },
        temperature: { value: 36.8, unit: '°C' },
        respiratory_rate: { value: 16, unit: 'brpm' },
      },
    },
    {
      timestamp: new Date(Date.now() - 60000).toISOString(),
      seq: 102,
      vitals: {
        heart_rate: { value: 78, unit: 'bpm' },
        spo2: { value: 97, unit: '%' },
        temperature: { value: 36.9, unit: '°C' },
        respiratory_rate: { value: 17, unit: 'brpm' },
      },
    },
    {
      timestamp: new Date().toISOString(),
      seq: 103,
      vitals: {
        heart_rate: { value: 77, unit: 'bpm' },
        spo2: { value: 98, unit: '%' },
        temperature: { value: 36.8, unit: '°C' },
        respiratory_rate: { value: 16, unit: 'brpm' },
      },
    },
  ],
  activeAlerts: [],
  thresholds: [
    { measurement: 'heart_rate', minWarning: 55, maxWarning: 100, minCritical: 45, maxCritical: 130, unit: 'bpm' },
    { measurement: 'spo2', minWarning: 94, maxWarning: null, minCritical: 90, maxCritical: null, unit: '%' },
    { measurement: 'respiratory_rate', minWarning: 10, maxWarning: 24, minCritical: 8, maxCritical: 30, unit: 'brpm' },
  ],
  telemetryFreshnessSeconds: 1.5,
  packetLossRate: 0.0,
};

async function runSmokeTest(): Promise<void> {
  const service = new GeminiExplainerService({
    apiKey,
    modelName,
    timeoutMs: 15000,
  });

  const startTime = performance.now();
  console.log('Dispatching request to Google Gemini API...');

  try {
    const response = await service.explain({
      patientId: 'SYNTH-PATIENT-99',
      context: syntheticContext,
    });
    const elapsedMs = performance.now() - startTime;

    console.log(`Provider Response Received in ${elapsedMs.toFixed(1)} ms.`);
    console.log('Validating response against ExplainResponseSchema...');

    const parseResult = ExplainResponseSchema.safeParse(response);
    if (!parseResult.success) {
      console.error('[FAIL] Schema validation failed for live Gemini response:');
      console.error(parseResult.error.format());
      process.exit(1);
    }

    // Assert required invariants
    if (response.isAdvisoryOnly !== true) {
      console.error('[FAIL] Invariant violation: response.isAdvisoryOnly is not true.');
      process.exit(1);
    }

    if (!response.summary || response.observedFacts.length === 0) {
      console.error('[FAIL] Invariant violation: response missing summary or observed facts.');
      process.exit(1);
    }

    console.log('----------------------------------------------------------------');
    console.log('[SUCCESS] Live Gemini Smoke Test PASSED!');
    console.log(`- Model:                      ${response.modelName}`);
    console.log(`- Roundtrip Latency:          ${elapsedMs.toFixed(1)} ms (Single-run observation)`);
    console.log(`- Advisory Only Flag:         ${response.isAdvisoryOnly ? 'VERIFIED (true)' : 'FAILED'}`);
    console.log(`- Summary Length:             ${response.summary.length} characters`);
    console.log(`- Observed Facts Count:       ${response.observedFacts.length}`);
    console.log(`- Interpretations Count:      ${response.possibleInterpretations.length}`);
    console.log(`- Bedside Verification Steps: ${response.suggestedVerificationSteps.length}`);
    console.log('================================================================');
    process.exit(0);
  } catch (err: unknown) {
    const elapsedMs = performance.now() - startTime;
    console.error('----------------------------------------------------------------');
    console.error(`[FAILURE] Live Gemini smoke test failed after ${elapsedMs.toFixed(1)} ms.`);

    if (err instanceof GeminiExplainerError) {
      console.error(`- Sanitized Error Code:   ${err.code}`);
      console.error(`- HTTP Status Equivalent: ${err.statusCode}`);
      console.error(`- Error Description:     ${err.message}`);

      if (err.message.toLowerCase().includes('not found') || err.message.toLowerCase().includes('model')) {
        console.warn(`[NOTE] If model '${modelName}' is unavailable for your Gemini API tier,`);
        console.warn('consider testing with GEMINI_MODEL=gemini-2.0-flash or gemini-1.5-flash.');
      }
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`- Error: ${msg}`);
    }

    console.error('================================================================');
    process.exit(1);
  }
}

runSmokeTest();
