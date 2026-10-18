# WiCare Wireless Medical Communication (WMC) Simulation: Empirical Results Analysis Report

**Document ID:** `WICARE-WMC-EXP-2026-001`  
**Dataset Reference:** [`docs/data/results/raw_experiment_runs.csv`](file:///d:/My_Projects/WMC_Project/docs/data/results/raw_experiment_runs.csv) (108 runs)  
**Aggregated Reference:** [`docs/data/results/aggregated_metrics.csv`](file:///d:/My_Projects/WMC_Project/docs/data/results/aggregated_metrics.csv) (36 conditions)  
**Metadata Manifest:** [`docs/data/results/summary_metrics.json`](file:///d:/My_Projects/WMC_Project/docs/data/results/summary_metrics.json)  
**Generated Visualizations:** [`docs/images/`](file:///d:/My_Projects/WMC_Project/docs/images/)  

---

## 1. Executive Summary

This report delivers an independent, empirical analysis of the completed software-simulation benchmark for the **WiCare Wireless Medical Communication (WMC)** patient telemetry prototype. The evaluation examines the multi-node scalability, packet delivery reliability, transport latency, data freshness, and acute alert responsiveness under varying network impairments and transmission strategies.

### Core Benchmark Metrics Summary
- **Experimental Matrix Executed:** 108 independent runs (36 configurations $\times$ 3 pseudo-random seeds: `101`, `202`, `303`), each simulating 30 seconds of live clinical telemetry.
- **Node Densities:** 10, 25, and 50 concurrent virtual ICU patient telemetry nodes.
- **Simulated Packet Loss Rates:** 0%, 10%, and 25%.
- **MQTT Transport Qualities of Service:** QoS 0 and QoS 1.
- **Transmission Strategies Evaluated:** Fixed-rate baseline (1.0 Hz periodic) vs. Adaptive risk-network strategy (1.0 Hz baseline, 3.33 Hz / 300ms acute clinical acceleration, with a $1.3\times$ network backoff under 25% loss).
- **Packet Delivery Ratio (PDR):** Under 0% simulated loss, both strategies achieved **100.00% PDR** with zero variance across all scales. Under 10% loss, empirical PDR averaged **90.44% to 90.65%**. Under 25% loss, empirical PDR averaged **75.46% to 76.82%**, tightly matching the theoretical boundary $(1 - p)$.
- **Transport Latency & Freshness:** Mean end-to-end transport latency across all 36 conditions was bounded between **37 ms and 40 ms** (P95: 42–49 ms), directly reflecting the configured $30\text{ ms} \pm 10\text{ ms}$ delay profile plus loopback IPC/socket queuing. Arrival-instant Age of Information (AoI) closely tracked transport latency.
- **Urgent Deterioration Latency:** Alert delivery latency for high-acuity deterioration packets averaged between **32 ms and 40 ms** across all valid conditions.
- **Buffer Integrity:** **0 buffer overflows** occurred across all 108 runs, proving the client-side ring buffers accommodated transmission bursts without loss.

---

## 2. Experimental Methodology

### 2.1 Architecture and Test Pipeline
The software simulation tests end-to-end clinical telemetry streaming over an embedded MQTT infrastructure:
1. **Virtual Patients ([`patient.ts`](file:///d:/My_Projects/WMC_Project/simulator/patient-generator/src/patient.ts)):** Each patient model simulates 5 vital sign channels (heart rate, SpO2, blood pressure, respiration rate, body temperature) and continuous single-lead ECG wave generation. Every patient has an internal clock accumulator, a priority offline ring buffer (capacity 100 frames), and an active transmission strategy.
2. **Network Impairment Emulation ([`emulator.ts`](file:///d:/My_Projects/WMC_Project/simulator/network-emulator/src/emulator.ts)):** Impairments are simulated prior to network publication. A pseudorandom number generator determines packet drop probability ($p \in \{0.00, 0.10, 0.25\}$) and applies fixed transmission delay ($30\text{ ms}$) plus uniform jitter ($\pm 10\text{ ms}$).
3. **Transport Layer:** Ephemeral local Aedes MQTT broker instances listening on designated localhost TCP ports. Patients publish to topic hierarchies (`wicare/icu/EXP/{bedId}/{deviceId}/vitals` and `.../vitals/critical`).
4. **Subscriber & Ingest Registry ([`device-registry.ts`](file:///d:/My_Projects/WMC_Project/apps/api/src/mqtt/device-registry.ts)):** An API subscriber decodes arriving JSON telemetry, measures reception timestamps against sender timestamps, ingests readings, and tracks sequence gaps using a deduplication sliding window.

### 2.2 Comparison Baseline and Strategies
- **Comparison Baseline:** The **Fixed-Rate Strategy** serves as the control baseline ($1000\text{ ms}$ fixed interval, 1.0 Hz constant dispatch).
- **Evaluated Strategy:** The **Adaptive Risk-Network Strategy** dynamically recalculates sampling intervals on every patient tick:
  - *Normal Acuity:* Base interval is $1000\text{ ms}$ (1.0 Hz).
  - *High Acuity / Urgent Deterioration:* When an urgent scenario (`falling_spo2`, `rising_hr`, `deterioration`) or abnormal vitals ($\text{SpO}_2 < 94\%$, $\text{HR} > 110$ or $< 55\text{ bpm}$) are detected, the interval drops to $\min(\text{interval}, 300\text{ ms})$ ($3.33\text{ Hz}$).
  - *Network Congestion Backoff:* When measured packet loss exceeds 15% ($\text{lossRate} > 0.15$), a congestion multiplier is applied: $\text{interval} = \text{interval} \times [1.0 + (\text{lossRate} - 0.15) \times 3.0]$. At 25% loss, this expands the stable interval to $1300\text{ ms}$ (30% backoff).
  - *Hard Bounds:* The calculated interval is clamped between $[200\text{ ms}, 3000\text{ ms}]$.
- **Deterioration Scenario Trigger:** At 33% of run duration ($t = 10\text{ seconds}$), exactly 20% of the patient nodes ($\max(1, \lfloor N \times 0.2 \rfloor)$) transition to the `falling_spo2` scenario.

### 2.3 Metric Definitions and Measurement Points
- **Total Dispatched ($N_{\text{tx}}$):** Total telemetry frames actually handed to `networkEmulator.publish()` by virtual patients (derived from `VirtualPatient.messagesDispatched`).
- **Total Received ($N_{\text{rx}}$):** Total valid frames decoded by `MqttSubscriber` (tracked via `onMessageReceived`).
- **Packet Delivery Ratio (PDR %):** $\text{PDR} = \frac{N_{\text{rx}}}{N_{\text{tx}}} \times 100\%$. Direction of improvement: **Higher is better ($\uparrow$)**.
- **Transport Latency ($L_{\text{transport}}$):** Measured as $t_{\text{recv}} - t_{\text{dispatch}}$ using sender and receiver timestamps. Direction of improvement: **Lower is better ($\downarrow$)**.
- **Arrival Freshness / Age of Information ($\text{AoI}_{\text{arrival}}$):** Evaluated at message arrival as $t_{\text{recv}} - t_{\text{gen}}$. Evaluates data age upon packet reception. Direction of improvement: **Lower is better ($\downarrow$)**.
- **Alert Delivery Latency ($L_{\text{alert}}$):** Wall-clock duration elapsed from the clinical deterioration trigger ($T_{\text{event}}$) to subscriber receipt of the first qualifying post-event frame ($T_{\text{recv}}$ with $T_{\text{gen}} \ge T_{\text{event}}$). Direction of improvement: **Lower is better ($\downarrow$)**.
- **Ingest Throughput:** Number of frames received per second ($\text{msg/s}$) and equivalent payload bitrate ($\text{kbps}$). Direction of improvement: **Context-dependent** (higher throughput is desirable during clinical deterioration to provide high-frequency vital sampling; lower/controlled throughput is desirable under channel contention to prevent buffer overflow and network collapse).
- **Buffer Drops:** Number of frames dropped from the offline ring buffer due to capacity overflow. Direction of improvement: **Lower is better ($\downarrow$)**.

---

## 3. Comprehensive Empirical Results

### 3.1 All 36 Experimental Conditions Table
The table below presents the verified empirical measurements from [`docs/data/results/aggregated_metrics.csv`](file:///d:/My_Projects/WMC_Project/docs/data/results/aggregated_metrics.csv). Values represent the arithmetic mean across the three seeds (`101`, `202`, `303`), with PDR standard deviation reported.

| Nodes | Loss (%) | QoS | Strategy | PDR Mean (%) | PDR Std (%) | Mean Lat (ms) | P95 Lat (ms) | P99 Lat (ms) | P95 AoI (ms) | Alert Lat (ms) | Throughput (msg/s) | Throughput (kbps) | Buffer Drops |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 10 | 0% | 0 | Fixed | **100.00** | ±0.00 | 38 | 49 | 50 | 49 | 34 | 10.00 | 14.40 | 0 |
| 10 | 0% | 0 | Adaptive | **100.00** | ±0.00 | 38 | 48 | 49 | 48 | 35 | 13.27 | 19.10 | 0 |
| 10 | 0% | 1 | Fixed | **100.00** | ±0.00 | 38 | 49 | 50 | 49 | 33 | 10.00 | 14.40 | 0 |
| 10 | 0% | 1 | Adaptive | **100.00** | ±0.00 | 38 | 49 | 50 | 49 | 34 | 13.27 | 19.10 | 0 |
| 10 | 10% | 0 | Fixed | **90.44** | ±0.68 | 38 | 48 | 49 | 48 | 34 | 9.04 | 13.02 | 0 |
| 10 | 10% | 0 | Adaptive | **90.06** | ±0.93 | 38 | 48 | 49 | 48 | 37 | 11.48 | 16.53 | 0 |
| 10 | 10% | 1 | Fixed | **90.44** | ±0.68 | 38 | 49 | 49 | 49 | 34 | 9.04 | 13.02 | 0 |
| 10 | 10% | 1 | Adaptive | **90.06** | ±0.93 | 38 | 49 | 51 | 49 | 33 | 11.48 | 16.53 | 0 |
| 10 | 25% | 0 | Fixed | **76.44** | ±0.42 | 37 | 48 | 49 | 48 | 38 | 7.64 | 11.01 | 0 |
| 10 | 25% | 0 | Adaptive | **76.82** | ±1.96 | 38 | 48 | 49 | 48 | 32 | 7.94 | 11.44 | 0 |
| 10 | 25% | 1 | Fixed | **76.44** | ±0.42 | 37 | 48 | 49 | 48 | 38 | 7.64 | 11.01 | 0 |
| 10 | 25% | 1 | Adaptive | **76.82** | ±1.96 | 38 | 48 | 49 | 48 | 32 | 7.94 | 11.44 | 0 |
| 25 | 0% | 0 | Fixed | **100.00** | ±0.00 | 37 | 48 | 49 | 48 | 34 | 25.00 | 36.00 | 0 |
| 25 | 0% | 0 | Adaptive | **100.00** | ±0.00 | 38 | 49 | 54 | 49 | 37 | 33.17 | 47.76 | 0 |
| 25 | 0% | 1 | Fixed | **100.00** | ±0.00 | 37 | 48 | 49 | 48 | 34 | 25.00 | 36.00 | 0 |
| 25 | 0% | 1 | Adaptive | **100.00** | ±0.00 | 37 | 49 | 50 | 49 | 36 | 33.17 | 47.76 | 0 |
| 25 | 10% | 0 | Fixed | **90.44** | ±0.23 | 37 | 49 | 49 | 49 | 34 | 22.61 | 32.56 | 0 |
| 25 | 10% | 0 | Adaptive | **90.47** | ±0.88 | 38 | 49 | 49 | 49 | 34 | 28.69 | 41.31 | 0 |
| 25 | 10% | 1 | Fixed | **90.44** | ±0.23 | 37 | 48 | 50 | 48 | 36 | 22.61 | 32.56 | 0 |
| 25 | 10% | 1 | Adaptive | **90.47** | ±0.88 | 38 | 49 | 50 | 49 | 34 | 28.69 | 41.31 | 0 |
| 25 | 25% | 0 | Fixed | **76.04** | ±1.20 | 37 | 49 | 50 | 49 | 33 | 19.01 | 27.38 | 0 |
| 25 | 25% | 0 | Adaptive | **76.33** | ±1.93 | 38 | 49 | 49 | 49 | 32 | 19.39 | 27.92 | 0 |
| 25 | 25% | 1 | Fixed | **76.04** | ±1.20 | 37 | 49 | 50 | 49 | 35 | 19.01 | 27.38 | 0 |
| 25 | 25% | 1 | Adaptive | **76.33** | ±1.93 | 38 | 49 | 52 | 49 | 33 | 19.39 | 27.92 | 0 |
| 50 | 0% | 0 | Fixed | **100.00** | ±0.00 | 37 | 45 | 50 | 45 | 37 | 50.00 | 72.00 | 0 |
| 50 | 0% | 0 | Adaptive | **100.00** | ±0.00 | 37 | 48 | 50 | 48 | 40 | 66.33 | 95.52 | 0 |
| 50 | 0% | 1 | Fixed | **100.00** | ±0.00 | 40 | 43 | 45 | 43 | 39 | 50.00 | 72.00 | 0 |
| 50 | 0% | 1 | Adaptive | **100.00** | ±0.00 | 39 | 48 | 51 | 48 | 40 | 66.33 | 95.52 | 0 |
| 50 | 10% | 0 | Fixed | **90.55** | ±0.19 | 37 | 48 | 49 | 48 | 37 | 45.28 | 65.20 | 0 |
| 50 | 10% | 0 | Adaptive | **90.65** | ±0.46 | 38 | 49 | 52 | 49 | 38 | 57.34 | 82.57 | 0 |
| 50 | 10% | 1 | Fixed | **90.55** | ±0.19 | 39 | 43 | 45 | 43 | 38 | 45.28 | 65.20 | 0 |
| 50 | 10% | 1 | Adaptive | **90.65** | ±0.46 | 38 | 49 | 50 | 49 | 37 | 57.34 | 82.57 | 0 |
| 50 | 25% | 0 | Fixed | **75.47** | ±0.90 | 37 | 48 | 49 | 48 | 36 | 37.73 | 54.34 | 0 |
| 50 | 25% | 0 | Adaptive | **75.46** | ±1.28 | 38 | 49 | 50 | 49 | 35 | 37.79 | 54.42 | 0 |
| 50 | 25% | 1 | Fixed | **75.47** | ±0.90 | 38 | 42 | 47 | 42 | 37 | 37.73 | 54.34 | 0 |
| 50 | 25% | 1 | Adaptive | **75.46** | ±1.28 | 38 | 49 | 50 | 49 | 35 | 37.79 | 54.42 | 0 |

---

## 4. Comparative Analysis: Fixed vs. Adaptive Transmission

To evaluate the operational characteristics of the adaptive mechanism against the fixed baseline, Table 2 computes the absolute differences ($\Delta = \text{Adaptive} - \text{Fixed}$) and relative percentage changes ($\%\Delta = \frac{\Delta}{\text{Fixed}} \times 100\%$) across all 18 condition pairs.

### Table 2: Comparative Metric Shifts (Adaptive Relative to Fixed Baseline)

| Node Scale | Loss (%) | QoS | PDR Diff ($\Delta$ %) | Latency P95 Diff ($\Delta$ ms) | AoI P95 Diff ($\Delta$ ms) | Alert Delay Diff ($\Delta$ ms) | Throughput Fixed (msg/s) | Throughput Adapt (msg/s) | Throughput $\Delta$ (msg/s) | Throughput Change ($\%\Delta$) |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **10 Nodes** | 0% | 0 | 0.00% | -1 ms | -1 ms | +1 ms | 10.00 | 13.27 | +3.27 | **+32.7%** |
| **10 Nodes** | 0% | 1 | 0.00% | 0 ms | 0 ms | +1 ms | 10.00 | 13.27 | +3.27 | **+32.7%** |
| **10 Nodes** | 10% | 0 | -0.38% | 0 ms | 0 ms | +3 ms | 9.04 | 11.48 | +2.44 | **+27.0%** |
| **10 Nodes** | 10% | 1 | -0.38% | 0 ms | 0 ms | -1 ms | 9.04 | 11.48 | +2.44 | **+27.0%** |
| **10 Nodes** | 25% | 0 | +0.38% | 0 ms | 0 ms | -6 ms | 7.64 | 7.94 | +0.30 | **+3.9%** |
| **10 Nodes** | 25% | 1 | +0.38% | 0 ms | 0 ms | -6 ms | 7.64 | 7.94 | +0.30 | **+3.9%** |
| **25 Nodes** | 0% | 0 | 0.00% | +1 ms | +1 ms | +3 ms | 25.00 | 33.17 | +8.17 | **+32.7%** |
| **25 Nodes** | 0% | 1 | 0.00% | +1 ms | +1 ms | +2 ms | 25.00 | 33.17 | +8.17 | **+32.7%** |
| **25 Nodes** | 10% | 0 | +0.03% | 0 ms | 0 ms | 0 ms | 22.61 | 28.69 | +6.08 | **+26.9%** |
| **25 Nodes** | 10% | 1 | +0.03% | +1 ms | +1 ms | -2 ms | 22.61 | 28.69 | +6.08 | **+26.9%** |
| **25 Nodes** | 25% | 0 | +0.29% | 0 ms | 0 ms | -1 ms | 19.01 | 19.39 | +0.38 | **+2.0%** |
| **25 Nodes** | 25% | 1 | +0.29% | 0 ms | 0 ms | -2 ms | 19.01 | 19.39 | +0.38 | **+2.0%** |
| **50 Nodes** | 0% | 0 | 0.00% | +3 ms | +3 ms | +3 ms | 50.00 | 66.33 | +16.33 | **+32.7%** |
| **50 Nodes** | 0% | 1 | 0.00% | +5 ms | +5 ms | +1 ms | 50.00 | 66.33 | +16.33 | **+32.7%** |
| **50 Nodes** | 10% | 0 | +0.10% | +1 ms | +1 ms | +1 ms | 45.28 | 57.34 | +12.06 | **+26.6%** |
| **50 Nodes** | 10% | 1 | +0.10% | +6 ms | +6 ms | -1 ms | 45.28 | 57.34 | +12.06 | **+26.6%** |
| **50 Nodes** | 25% | 0 | -0.01% | +1 ms | +1 ms | -1 ms | 37.73 | 37.79 | +0.06 | **+0.2%** |
| **50 Nodes** | 25% | 1 | -0.01% | +7 ms | +7 ms | -2 ms | 37.73 | 37.79 | +0.06 | **+0.2%** |

---

## 5. In-Depth Interpretation & Trade-Offs

### 5.1 Throughput Dynamics and Clinical Adaptation
1. **Low-Loss Regimes (0% Loss):**
   Across all scale tiers (10, 25, 50 nodes), adaptive transmission delivered an exact **+32.7% higher throughput** compared to the fixed baseline.
   - *Underlying Cause:* For the first 9.9 seconds (99 ticks), all nodes streamed at 1.0 Hz ($1000\text{ ms}$). At $t \approx 10\text{s}$ (tick 99), 20% of the nodes (2 beds in a 10-node ward) transitioned to the `falling_spo2` scenario, accelerating their sampling interval to $300\text{ ms}$ ($3.33\text{ Hz}$). Over the 30-second duration, the 8 stable nodes dispatched exactly 240 frames ($8 \times 30\text{ frames}$), while the 2 deteriorating nodes dispatched 158 frames ($2 \times 79\text{ frames}$), resulting in exactly 398 dispatched and received frames under 0% loss: $\frac{398\text{ frames}}{30\text{ s}} = \mathbf{13.27\text{ msg/s}}$ (a $+32.7\%$ increase over the $10.00\text{ msg/s}$ baseline).
2. **Moderate-Loss Regimes (10% Loss):**
   Adaptive transmission throughput remained elevated at **+26.6% to +27.0%** above baseline.
3. **Severe-Loss Regimes (25% Loss):**
   At 25% loss, adaptive throughput was nearly identical to fixed throughput (**+0.2% to +3.9%**).
   - *Underlying Cause:* Because packet loss exceeded the 15% threshold, the network congestion adaptation mechanism engaged:
     $$\text{congestionMultiplier} = 1.0 + (0.25 - 0.15) \times 3.0 = 1.30$$
     The base interval for stable patients expanded from $1000\text{ ms}$ to $1300\text{ ms}$ (a 30% reduction in transmission frequency), and the accelerated rate expanded from $300\text{ ms}$ to $390\text{ ms}$. This deliberate throttle throttled back stable telemetry to prevent channel saturation, counterbalancing the surge from the deteriorated cohort.
4. **Clinical-Fidelity vs. Channel-Congestion Trade-Off:**
   Higher throughput is not unconditionally beneficial. In wireless medical telemetry, an unconstrained increase in message frequency risks RF channel contention, queue buildup, and battery depletion. The adaptive mechanism is structured around a deliberate trade-off: under low-loss conditions, it dedicates bandwidth to the deteriorating patient cohort (+32.7% throughput) to maximize diagnostic acuity; under high-loss conditions (25%), it automatically applies congestion backoff to stable nodes, damping the throughput surge (+0.2% to +3.9%) to protect channel stability.

### 5.2 Delivery Reliability (PDR)
- The absolute difference in PDR between fixed and adaptive transmission remained negligible across all conditions (ranging from $-0.38\%$ to $+0.38\%$).
- This confirms that packet loss in this architecture is governed strictly by the channel drop probability applied by `NetworkEmulator` rather than queue saturation or transmission pacing.
- Standard deviation across seeds remained tight: $\pm 0.00\%$ under 0% loss, $\pm 0.19\%$ to $\pm 0.93\%$ under 10% loss, and $\pm 0.42\%$ to $\pm 1.96\%$ under 25% loss.

### 5.3 Latency and Data Freshness (Age of Information)
- **Mean End-to-End Latency:** Consistently ranged between $37\text{ ms}$ and $40\text{ ms}$ regardless of node scale (10 to 50 beds).
- **P95 Latency & P95 AoI:** Maintained between $42\text{ ms}$ and $49\text{ ms}$.
- **Scale Impact at 50 Nodes:** Under 50 nodes and QoS 1, the adaptive strategy exhibited a minor increase of $+5\text{ ms}$ to $+7\text{ ms}$ in P95 latency (48–49 ms vs. 42–43 ms for fixed). This is attributed to the increased event loop queueing of handling 66.3 msg/s concurrently over a single Node.js process thread compared to 50 msg/s for fixed.
- **Alert Latency:** Remained stable between $32\text{ ms}$ and $40\text{ ms}$ across all conditions, demonstrating rapid central station notification when clinical deterioration occurred.

---

## 6. Threats to Validity and Experimental Limitations

To maintain academic rigor, the following experimental boundaries must be recognized:

1. **Pre-Publication Loss Model vs. Transport QoS:**
   Simulated packet loss occurs in userland within `NetworkEmulator` before invoking `mqttClient.publish()`. Consequently, dropped packets never enter the network transport socket. Because surviving packets travel over a local loopback TCP connection with zero socket-level loss, MQTT QoS 1 shows identical delivery ratios to QoS 0. This experiment models application resilience to link drops, but does not evaluate broker-level PUBACK transport retransmissions.
2. **Arrival-Instant Freshness vs. Continuous Inter-Arrival AoI:**
   The reported AoI metric evaluates data freshness at message reception ($t_{\text{recv}} - t_{\text{gen}}$). It quantifies the transmission freshness of delivered frames ($38\text{ ms}$ mean), but does not compute time-average continuous AoI or peak AoI (PAoI), which would grow to $1000\text{ ms}$ (or $2000\text{ ms}+$ during dropped intervals) until the next packet arrives.
3. **Local Loopback Transport & Scheduling Overhead:**
   All virtual nodes and the MQTT broker execute on a single physical host over loopback (`127.0.0.1`). Network delay and jitter are simulated via JavaScript timers (`setTimeout`), introducing $7\text{ to }10\text{ ms}$ of Node.js event-loop scheduling overhead on top of the configured $30\text{ ms}$ delay.
4. **Seed Sample Size:**
   While 3 random seeds (`101`, `202`, `303`) per configuration provide consistent deterministic validation across 108 runs, wider Monte Carlo sweeps (10–30 seeds) would be required to establish formal confidence intervals under stochastic physical channel models.

---

## 7. Conclusions & Future Work

### Conclusions
1. The empirical simulation pipeline successfully demonstrates that risk-adaptive telemetry transmission increases telemetry throughput by **+32.7%** during patient deterioration under clear network conditions, providing higher clinical resolution when it is most critical.
2. Under degraded channel conditions (25% packet loss), the congestion backoff mechanism throttles stable telemetry rates by 30%, constraining overall throughput surge to **+0.2% to +3.9%** and preventing network collapse.
3. Delivery reliability (PDR) is accurately measured at 100% under 0% loss, ~90.4% under 10% loss, and ~75.9% under 25% loss, confirming the correction of prior sequence accounting and tick denominator defects.

### Future Work
1. **Physical Wireless Channel Testbed:** Deploy virtual patient clients on distributed single-board computers (e.g., Raspberry Pi) communicating over 802.11 Wi-Fi or 802.15.4 Zigbee mesh networks to evaluate true RF contention and physical-layer packet collisions.
2. **Kernel-Level Impairment Emulation:** Transition from application-level `setTimeout` delay emulation to kernel-level traffic shaping using Linux NetEm (`tc-netem`) or WAN emulators to evaluate true MQTT QoS 1 TCP socket retransmissions.
3. **Continuous Peak Age of Information (PAoI) Tracking:** Implement discrete continuous time-integral tracking of AoI at the central station subscriber to formally quantify data obsolescence during prolonged packet drop intervals.
