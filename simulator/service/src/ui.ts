export function getSimulatorHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WiCare Virtual ICU Telemetry Simulator Studio</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090e1a;
      --card-bg: #0f172a;
      --card-border: #1e293b;
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --accent: #2563eb;
      --accent-hover: #1d4ed8;
      --success: #10b981;
      --danger: #ef4444;
      --warning: #f59e0b;
      --cyan: #06b6d4;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding: 1rem 1.25rem;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
      padding: 0.85rem 1.25rem;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      margin-bottom: 1rem;
    }
    .brand { display: flex; align-items: center; gap: 0.75rem; }
    .brand-icon {
      width: 36px; height: 36px;
      background: var(--accent);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.1rem; font-weight: 800; color: #fff;
    }
    .brand-title { font-size: 1.15rem; font-weight: 800; }
    .brand-sub { font-size: 0.75rem; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; }
    
    .badge {
      display: inline-flex; align-items: center; gap: 0.4rem;
      padding: 0.3rem 0.65rem; border-radius: 9999px;
      font-size: 0.75rem; font-weight: 600;
    }
    .badge-live { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }
    .badge-offline { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }

    .btn {
      padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.82rem; font-weight: 600;
      border: none; cursor: pointer; transition: all 0.15s;
      display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
    }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-primary { background: #2563eb; color: #fff; }
    .btn-primary:hover:not(:disabled) { background: #1d4ed8; }
    .btn-success { background: #10b981; color: #fff; }
    .btn-danger { background: #ef4444; color: #fff; }
    .btn-outline {
      background: rgba(255, 255, 255, 0.05); color: var(--text);
      border: 1px solid var(--card-border);
    }
    .btn-outline:hover:not(:disabled) { background: rgba(255, 255, 255, 0.1); border-color: #334155; }
    .btn-sm { padding: 0.35rem 0.65rem; font-size: 0.75rem; }

    /* Master-Detail Split Screen Layout */
    .sim-layout {
      display: grid;
      grid-template-columns: 340px 1fr;
      gap: 1.25rem;
      align-items: start;
    }
    @media (max-width: 960px) {
      .sim-layout { grid-template-columns: 1fr; }
    }

    /* Left Sidebar: Beds List */
    .sidebar {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      max-height: calc(100vh - 120px);
    }
    .sidebar-header {
      padding: 0.85rem 1rem;
      border-bottom: 1px solid var(--card-border);
      background: rgba(15, 23, 42, 0.8);
    }
    .sidebar-controls {
      display: flex;
      gap: 0.4rem;
      align-items: center;
      margin-top: 0.5rem;
    }
    .bed-list {
      overflow-y: auto;
      padding: 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .bed-item {
      padding: 0.75rem 0.85rem;
      border-radius: 8px;
      border: 1px solid transparent;
      background: rgba(255, 255, 255, 0.02);
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .bed-item:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: #334155;
    }
    .bed-item.active {
      background: #1e293b;
      border-color: #3b82f6;
      box-shadow: 0 0 0 1px #3b82f6;
    }
    .bed-item-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.25rem;
    }
    .bed-name {
      font-weight: 700;
      font-size: 0.88rem;
      color: #fff;
    }
    .bed-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.72rem;
      font-weight: 700;
      background: #2563eb;
      color: #fff;
      padding: 1px 6px;
      border-radius: 4px;
    }
    .bed-info {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-bottom: 0.35rem;
    }
    .bed-vitals-row {
      display: flex;
      gap: 0.6rem;
      font-size: 0.75rem;
      font-family: 'JetBrains Mono', monospace;
    }

    /* Right Panel */
    .detail-panel {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 1.25rem;
    }
    .card-title {
      font-size: 1rem;
      font-weight: 700;
      margin-bottom: 0.3rem;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .card-desc {
      font-size: 0.78rem;
      color: var(--text-muted);
      margin-bottom: 1rem;
    }

    /* Sliders Styling */
    .slider-box {
      background: #0a0f1d;
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 1rem;
      margin-bottom: 0.85rem;
    }
    .slider-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 0.4rem;
    }
    .slider-title {
      font-size: 0.88rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .slider-value-badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 1.25rem;
      font-weight: 800;
    }
    .vital-limits-bar {
      display: flex;
      justify-content: space-between;
      font-size: 0.68rem;
      color: #64748b;
      font-family: 'JetBrains Mono', monospace;
      margin-top: 0.35rem;
    }
    
    input[type="range"].vital-slider {
      width: 100%;
      height: 8px;
      border-radius: 5px;
      outline: none;
      -webkit-appearance: none;
      background: #1e293b;
      cursor: pointer;
    }
    input[type="range"].vital-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #fff;
      cursor: pointer;
      box-shadow: 0 0 8px rgba(0,0,0,0.5);
    }
    .hr-slider::-webkit-slider-thumb { background: #f43f5e !important; }
    .spo2-slider::-webkit-slider-thumb { background: #06b6d4 !important; }
    .temp-slider::-webkit-slider-thumb { background: #f59e0b !important; }
    .rr-slider::-webkit-slider-thumb { background: #10b981 !important; }

    .preset-btns {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
      margin-top: 0.75rem;
    }

    /* Scenarios Grid */
    .scenarios-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 0.5rem;
    }
    .sc-btn {
      padding: 0.65rem 0.8rem;
      border-radius: 8px;
      border: 1px solid var(--card-border);
      background: rgba(255, 255, 255, 0.02);
      color: #fff;
      cursor: pointer;
      font-size: 0.78rem;
      font-weight: 600;
      text-align: left;
      transition: all 0.15s;
    }
    .sc-btn:hover {
      background: rgba(255, 255, 255, 0.06);
      border-color: #3b82f6;
    }
    .sc-btn.active {
      background: rgba(37, 99, 235, 0.2);
      border-color: #3b82f6;
      color: #60a5fa;
    }
    .sc-btn span {
      display: block;
      font-size: 0.68rem;
      color: var(--text-muted);
      font-weight: 400;
      margin-top: 2px;
    }

    #banner {
      display: none;
      padding: 0.65rem 1rem;
      border-radius: 8px;
      margin-bottom: 1rem;
      font-size: 0.85rem;
      font-weight: 600;
    }
    #banner.success { display: block; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); color: #34d399; }
    #banner.info { display: block; background: rgba(37, 99, 235, 0.15); border: 1px solid rgba(37, 99, 235, 0.3); color: #60a5fa; }
  </style>
</head>
<body>
  <!-- Top Bar -->
  <div class="header">
    <div class="brand">
      <div class="brand-icon">Wi</div>
      <div>
        <div class="brand-title">WiCare Virtual ICU Telemetry Studio</div>
        <div class="brand-sub">Standalone Wireless MQTT Patient Node Fleet &bull; Indian ICU Demographics</div>
      </div>
    </div>

    <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
      <span id="statusBadge" class="badge badge-offline">
        <span id="statusText">Simulator Offline</span>
      </span>
      <button id="btnStart" class="btn btn-success btn-sm" onclick="startSim()">Start Fleet</button>
      <button id="btnStop" class="btn btn-danger btn-sm" onclick="stopSim()">Stop Fleet</button>
      <button class="btn btn-outline btn-sm" onclick="addBed()">+ Add Bed</button>
      <button class="btn btn-outline btn-sm" onclick="removeBed()">- Remove Bed</button>
    </div>
  </div>

  <div id="banner"></div>

  <!-- Master Detail Layout -->
  <div class="sim-layout">
    <!-- Left Sidebar: All Beds Selection -->
    <div class="sidebar">
      <div class="sidebar-header">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.85rem; font-weight: 700; color: #f8fafc;">Active ICU Beds</span>
          <span id="bedCountBadge" class="badge badge-live" style="font-size: 0.72rem;">0 Beds</span>
        </div>
        <div style="font-size: 0.72rem; color: #64748b; margin-top: 2px;">
          Select any bed to control vitals with sliders:
        </div>
      </div>

      <div id="bedsList" class="bed-list">
        <!-- Injected dynamically via JS -->
      </div>
    </div>

    <!-- Right Control Panel: Selected Bed Sliders & Details -->
    <div class="detail-panel">
      <!-- Selected Bed Header Info Card -->
      <div class="card" style="padding: 1rem 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;">
              <span id="curBedBadge" class="bed-tag" style="font-size: 0.88rem; padding: 2px 8px;">B-1</span>
              <h2 id="curPatientName" style="font-size: 1.25rem; font-weight: 800; color: #fff;">Rajesh Sharma</h2>
              <span id="curDemographics" style="font-size: 0.8rem; color: #94a3b8;">(58y Male &bull; UHID-IND-2026-1001)</span>
              <span id="curMqttStatus" style="font-size: 0.72rem; color: #10b981;">● Connected</span>
            </div>
            <div style="font-size: 0.8rem; color: #cbd5e1; margin-top: 0.3rem;">
              Diagnosis: <strong id="curDiagnosis" style="color: #e2e8f0;">Acute Anterior Wall STEMI - Post Primary PCI</strong>
            </div>
            <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.15rem;">
              Ward: <span id="curWard">Apex ICU Wing A</span> &bull; Device: <span id="curDeviceId" class="mono">DEV-001</span> &bull; Scenario: <span id="curScenario" style="color: #38bdf8;">stable</span>
            </div>
          </div>

          <div style="display: flex; gap: 0.5rem;">
            <button class="btn btn-outline btn-sm" onclick="resetCurrentPatient()">
              🔄 Reset to Normal (72 bpm / 98% / 36.8°C / 16)
            </button>
          </div>
        </div>
      </div>

      <!-- Real-Time Sliders Control (Requested by User) -->
      <div class="card">
        <div class="card-title">🎛️ Real-Time Vital Signs Sliders Control</div>
        <div class="card-desc">Drag any slider to directly manipulate live telemetry values broadcast over MQTT in real-time.</div>

        <!-- 1. Heart Rate Slider -->
        <div class="slider-box">
          <div class="slider-header">
            <span class="slider-title" style="color: #f43f5e;">
              ❤️ Heart Rate (HR)
            </span>
            <span id="hrValDisplay" class="slider-value-badge" style="color: #f43f5e;">72 bpm</span>
          </div>
          <input
            id="hrSlider"
            type="range"
            class="vital-slider hr-slider"
            min="30"
            max="200"
            step="1"
            value="72"
            oninput="onVitalSliderChange('heart_rate', this.value, 'hrValDisplay', 'bpm')"
          />
          <div class="vital-limits-bar">
            <span style="color: #ef4444;">&lt;45 (Crit Low)</span>
            <span style="color: #f59e0b;">55 (Warn Low)</span>
            <span style="color: #10b981;">Normal: 55 - 100 bpm</span>
            <span style="color: #f59e0b;">100 (Warn High)</span>
            <span style="color: #ef4444;">&gt;130 (Crit High)</span>
          </div>
        </div>

        <!-- 2. SpO2 Slider -->
        <div class="slider-box">
          <div class="slider-header">
            <span class="slider-title" style="color: #06b6d4;">
              🫁 Oxygen Saturation (SpO2)
            </span>
            <span id="spo2ValDisplay" class="slider-value-badge" style="color: #06b6d4;">98 %</span>
          </div>
          <input
            id="spo2Slider"
            type="range"
            class="vital-slider spo2-slider"
            min="60"
            max="100"
            step="1"
            value="98"
            oninput="onVitalSliderChange('spo2', this.value, 'spo2ValDisplay', '%')"
          />
          <div class="vital-limits-bar">
            <span style="color: #ef4444;">&lt;90% (Critical Hypoxia)</span>
            <span style="color: #f59e0b;">90 - 94% (Low Alert)</span>
            <span style="color: #10b981;">Normal Range: &ge; 94%</span>
            <span style="color: #06b6d4;">100% (Max)</span>
          </div>
        </div>

        <!-- 3. Temperature Slider -->
        <div class="slider-box">
          <div class="slider-header">
            <span class="slider-title" style="color: #f59e0b;">
              🌡️ Body Temperature
            </span>
            <span id="tempValDisplay" class="slider-value-badge" style="color: #f59e0b;">36.8 °C</span>
          </div>
          <input
            id="tempSlider"
            type="range"
            class="vital-slider temp-slider"
            min="34.0"
            max="42.0"
            step="0.1"
            value="36.8"
            oninput="onVitalSliderChange('temperature', this.value, 'tempValDisplay', '°C')"
          />
          <div class="vital-limits-bar">
            <span style="color: #ef4444;">&lt;35.0 (Hypothermia)</span>
            <span style="color: #10b981;">Normal: 36.0 - 37.8 °C</span>
            <span style="color: #f59e0b;">&gt;37.8 (Fever)</span>
            <span style="color: #ef4444;">&gt;39.0 (High Fever)</span>
          </div>
        </div>

        <!-- 4. Respiratory Rate Slider -->
        <div class="slider-box">
          <div class="slider-header">
            <span class="slider-title" style="color: #10b981;">
              💨 Respiratory Rate (RR)
            </span>
            <span id="rrValDisplay" class="slider-value-badge" style="color: #10b981;">16 brpm</span>
          </div>
          <input
            id="rrSlider"
            type="range"
            class="vital-slider rr-slider"
            min="4"
            max="45"
            step="1"
            value="16"
            oninput="onVitalSliderChange('respiratory_rate', this.value, 'rrValDisplay', 'brpm')"
          />
          <div class="vital-limits-bar">
            <span style="color: #ef4444;">&lt;8 (Crit Low)</span>
            <span style="color: #f59e0b;">&lt;10 (Low)</span>
            <span style="color: #10b981;">Normal: 10 - 24 brpm</span>
            <span style="color: #f59e0b;">&gt;24 (Tachypnea)</span>
            <span style="color: #ef4444;">&gt;30 (Crit High)</span>
          </div>
        </div>

        <!-- Quick Threshold Snap Presets -->
        <div style="margin-top: 1rem;">
          <div style="font-size: 0.78rem; font-weight: 700; color: #94a3b8; margin-bottom: 0.4rem;">
            Instant Threshold Breachers (Sets slider &amp; triggers alarm immediately):
          </div>
          <div class="preset-btns">
            <button class="btn btn-danger btn-sm" onclick="setSliderPreset('heart_rate', 145, 'hrSlider', 'hrValDisplay', 'bpm')">
              🚨 Tachycardia (145 bpm)
            </button>
            <button class="btn btn-danger btn-sm" onclick="setSliderPreset('heart_rate', 42, 'hrSlider', 'hrValDisplay', 'bpm')">
              🚨 Bradycardia (42 bpm)
            </button>
            <button class="btn btn-danger btn-sm" onclick="setSliderPreset('spo2', 82, 'spo2Slider', 'spo2ValDisplay', '%')">
              🚨 Hypoxia (82%)
            </button>
            <button class="btn btn-danger btn-sm" onclick="setSliderPreset('temperature', 39.5, 'tempSlider', 'tempValDisplay', '°C')">
              🚨 High Fever (39.5°C)
            </button>
            <button class="btn btn-danger btn-sm" onclick="setSliderPreset('respiratory_rate', 34, 'rrSlider', 'rrValDisplay', 'brpm')">
              🚨 Tachypnea (34 brpm)
            </button>
          </div>
        </div>
      </div>

      <!-- Clinical Scenarios -->
      <div class="card">
        <div class="card-title">🩺 Clinical Deterioration Scenarios</div>
        <div class="card-desc">Trigger automated physiological scenarios programmed into the patient generator engine.</div>
        <div class="scenarios-grid">
          <button class="sc-btn" onclick="applyScenario('stable')">
            🟢 Stable Baseline
            <span>Physiologically normal baseline</span>
          </button>
          <button class="sc-btn" onclick="applyScenario('rising_hr')">
            🔴 Rising HR (Tachycardia)
            <span>Ramps heart rate &gt; 130 bpm</span>
          </button>
          <button class="sc-btn" onclick="applyScenario('falling_spo2')">
            🔵 Falling SpO2 (Hypoxia)
            <span>Oxygen drops &lt; 90%</span>
          </button>
          <button class="sc-btn" onclick="applyScenario('deterioration')">
            🟣 Acute Deterioration
            <span>Multi-vital collapse</span>
          </button>
          <button class="sc-btn" onclick="applyScenario('sudden_change')">
            🟡 Sudden Cardiac Spike
            <span>Arrhythmic spike</span>
          </button>
          <button class="sc-btn" onclick="applyScenario('sensor_malfunction')">
            🟠 Sensor Malfunction
            <span>Noise and flatline artifacts</span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <script>
    let state = { running: false, config: {}, patients: [] };
    let selectedPatientId = null;
    let overrideDebounce = {};

    function showBanner(msg, type = 'success') {
      const b = document.getElementById('banner');
      b.className = type;
      b.innerText = msg;
      b.style.display = 'block';
      setTimeout(() => { b.style.display = 'none'; }, 3500);
    }

    async function fetchStatus() {
      try {
        const res = await fetch('/status');
        const data = await res.json();
        state = data;
        renderAll();
      } catch (err) {
        document.getElementById('statusBadge').className = 'badge badge-offline';
        document.getElementById('statusText').innerText = 'Simulator Offline';
      }
    }

    function selectPatient(id) {
      selectedPatientId = id;
      renderAll(true);
    }

    function renderAll(forceSliderSync = false) {
      // Top status
      const badge = document.getElementById('statusBadge');
      const text = document.getElementById('statusText');
      if (state.running) {
        badge.className = 'badge badge-live';
        text.innerText = 'Active Telemetry Fleet';
        document.getElementById('btnStart').disabled = true;
        document.getElementById('btnStop').disabled = false;
      } else {
        badge.className = 'badge badge-offline';
        text.innerText = 'Fleet Idle / Stopped';
        document.getElementById('btnStart').disabled = false;
        document.getElementById('btnStop').disabled = true;
      }

      const count = state.patients ? state.patients.length : 0;
      document.getElementById('bedCountBadge').innerText = count + ' Beds';

      // Ensure active patient selection
      if (!selectedPatientId && state.patients && state.patients.length > 0) {
        selectedPatientId = state.patients[0].patientId;
      }

      // Render Left Sidebar List
      const listEl = document.getElementById('bedsList');
      if (!state.patients || state.patients.length === 0) {
        listEl.innerHTML = '<div style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.8rem;">No active beds. Click "Start Fleet" to launch virtual devices.</div>';
      } else {
        listEl.innerHTML = state.patients.map(p => {
          const isActive = p.patientId === selectedPatientId;
          const v = p.vitals || {};
          const hr = v.heart_rate !== null && v.heart_rate !== undefined ? v.heart_rate : '—';
          const spo2 = v.spo2 !== null && v.spo2 !== undefined ? v.spo2 : '—';
          const name = p.name || ('Patient ' + p.patientId);

          return \`
            <div class="bed-item \${isActive ? 'active' : ''}" onclick="selectPatient('\${p.patientId}')">
              <div class="bed-item-top">
                <span class="bed-name">\${p.bedId}: \${name}</span>
                <span class="bed-tag">\${p.bedId}</span>
              </div>
              <div class="bed-info">\${p.uhid || p.patientId} &bull; \${p.scenario || 'stable'}</div>
              <div class="bed-vitals-row">
                <span style="color: #f43f5e;">HR: \${hr}</span>
                <span style="color: #06b6d4;">SpO2: \${spo2}%</span>
                <span style="color: #10b981; margin-left: auto;">\${p.isMqttConnected ? '● Online' : '○ Offline'}</span>
              </div>
            </div>
          \`;
        }).join('');
      }

      // Render Selected Patient Details & Sliders
      const activePatient = (state.patients || []).find(p => p.patientId === selectedPatientId);
      if (activePatient) {
        document.getElementById('curBedBadge').innerText = activePatient.bedId;
        document.getElementById('curPatientName').innerText = activePatient.name || ('Patient ' + activePatient.patientId);
        document.getElementById('curDemographics').innerText = '(' + (activePatient.age || 55) + 'y ' + (activePatient.gender || 'Male') + ' • ' + (activePatient.uhid || activePatient.patientId) + ')';
        document.getElementById('curDiagnosis').innerText = activePatient.diagnosis || 'Acute ICU Telemetry Monitoring';
        document.getElementById('curWard').innerText = activePatient.ward || 'ICU';
        document.getElementById('curDeviceId').innerText = activePatient.deviceId || 'DEV-001';
        document.getElementById('curScenario').innerText = activePatient.scenario || 'stable';
        document.getElementById('curMqttStatus').innerText = activePatient.isMqttConnected ? '● Streaming over MQTT' : '○ Connecting';
        document.getElementById('curMqttStatus').style.color = activePatient.isMqttConnected ? '#10b981' : '#f59e0b';

        // Sync slider values if forced or if not actively dragging
        if (forceSliderSync && activePatient.vitals) {
          const v = activePatient.vitals;
          if (v.heart_rate !== null) {
            document.getElementById('hrSlider').value = v.heart_rate;
            document.getElementById('hrValDisplay').innerText = v.heart_rate + ' bpm';
          }
          if (v.spo2 !== null) {
            document.getElementById('spo2Slider').value = v.spo2;
            document.getElementById('spo2ValDisplay').innerText = v.spo2 + ' %';
          }
          if (v.temperature !== null) {
            document.getElementById('tempSlider').value = v.temperature;
            document.getElementById('tempValDisplay').innerText = v.temperature + ' °C';
          }
          if (v.respiratory_rate !== null) {
            document.getElementById('rrSlider').value = v.respiratory_rate;
            document.getElementById('rrValDisplay').innerText = v.respiratory_rate + ' brpm';
          }
        }
      }
    }

    // Interactive Slider Handler
    function onVitalSliderChange(vital, value, displayId, unit) {
      document.getElementById(displayId).innerText = value + ' ' + unit;

      if (!selectedPatientId) return;

      clearTimeout(overrideDebounce[vital]);
      overrideDebounce[vital] = setTimeout(async () => {
        try {
          await fetch('/patients/' + encodeURIComponent(selectedPatientId) + '/override', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vital, value: parseFloat(value) })
          });
          showBanner('Set ' + vital + ' = ' + value + ' ' + unit + ' on ' + selectedPatientId, 'info');
        } catch (e) {
          console.error(e);
        }
      }, 80);
    }

    async function setSliderPreset(vital, value, sliderId, displayId, unit) {
      document.getElementById(sliderId).value = value;
      onVitalSliderChange(vital, value, displayId, unit);
    }

    async function applyScenario(scId) {
      if (!selectedPatientId) return alert('No bed selected');
      const res = await fetch('/patients/' + encodeURIComponent(selectedPatientId) + '/scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: scId })
      });
      if (res.ok) {
        showBanner('Injected scenario "' + scId + '" into ' + selectedPatientId);
        fetchStatus();
      }
    }

    async function resetCurrentPatient() {
      if (!selectedPatientId) return alert('No bed selected');
      await applyScenario('stable');
      for (const vital of ['heart_rate', 'spo2', 'temperature', 'respiratory_rate']) {
        await fetch('/patients/' + encodeURIComponent(selectedPatientId) + '/override', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vital, value: null })
        });
      }
      showBanner('Reset ' + selectedPatientId + ' to normal physiological baseline');
      fetchStatus();
    }

    async function startSim(count = 5) {
      const res = await fetch('/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count })
      });
      if (res.ok) {
        showBanner('Started virtual telemetry fleet!');
        fetchStatus();
      }
    }

    async function stopSim() {
      const res = await fetch('/stop', { method: 'POST' });
      if (res.ok) {
        showBanner('Stopped virtual telemetry fleet', 'info');
        fetchStatus();
      }
    }

    async function addBed() {
      const res = await fetch('/add-bed', { method: 'POST' });
      if (res.ok) {
        showBanner('Added virtual ICU bed');
        fetchStatus();
      }
    }

    async function removeBed() {
      const res = await fetch('/remove-bed', { method: 'POST' });
      if (res.ok) {
        showBanner('Removed virtual bed', 'info');
        fetchStatus();
      }
    }

    fetchStatus();
    setInterval(fetchStatus, 1500);
  </script>
</body>
</html>`;
}
