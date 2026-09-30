/* =============================================
   Mic Testing App — Application Logic
   ============================================= */

(function () {
  'use strict';

  // ──────────────────────────────────────────
  // DOM References
  // ──────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    // Cards
    idleCard:     $('#idle-card'),
    testingCard:  $('#testing-card'),
    resultsCard:  $('#results-card'),
    errorCard:    $('#error-card'),

    // Buttons
    startBtn:     $('#start-test-btn'),
    stopBtn:      $('#stop-test-btn'),
    testAgainBtn: $('#test-again-btn'),
    errorRetryBtn:$('#error-retry-btn'),
    playbackToggle: $('#playback-toggle'),
    themeToggle:  $('#theme-toggle'),
    mobileMenuBtn:$('#mobile-menu-btn'),
    checkPermsBtn:$('#check-perms-btn'),

    // Canvases
    vizCanvas:    $('#viz-canvas'),
    waveCanvas:   $('#waveform-canvas'),

    // Status / info
    statusBadge:  $('#test-status'),
    statusText:   $('#status-text'),
    volumeFill:   $('#volume-fill'),
    volumePct:    $('#volume-pct'),
    infoDevice:   $('#info-device'),
    infoSignal:   $('#info-signal'),
    infoInput:    $('#info-input'),

    // Playback
    playbackWarning: $('#playback-warning'),

    // Device selector
    deviceWrapper:$('#device-selector-wrapper'),
    micSelect:    $('#mic-select'),

    // Results
    resultsChecklist: $('#results-checklist'),
    overallStatus:    $('#overall-status'),
    resultsMainIcon:  $('#results-main-icon'),

    // Error
    errorTitle:   $('#error-title'),
    errorMessage: $('#error-message'),

    // Mobile
    mobileOverlay:$('#mobile-menu-overlay'),
    navLinks:     $('#nav-links'),
  };

  // ──────────────────────────────────────────
  // MicTester — Audio Logic
  // ──────────────────────────────────────────
  class MicTester {
    constructor() {
      this.audioContext = null;
      this.analyser = null;
      this.source = null;
      this.stream = null;
      this.gainNode = null;
      this.isRunning = false;
      this.isPlaybackOn = false;
      this.peakVolume = 0;
      this.hasDetectedSignal = false;
      this.volumeHistory = [];
      this.testStartTime = null;
    }

    async start(deviceId) {
      try {
        const constraints = {
          audio: deviceId
            ? { deviceId: { exact: deviceId } }
            : { echoCancellation: true, noiseSuppression: true }
        };

        this.stream = await navigator.mediaDevices.getUserMedia(constraints);

        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        // Resume if suspended (some browsers require user gesture)
        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
        }

        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.82;

        this.source = this.audioContext.createMediaStreamSource(this.stream);

        // Gain node for optional playback
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = 0; // muted by default

        this.source.connect(this.analyser);
        this.source.connect(this.gainNode);
        this.gainNode.connect(this.audioContext.destination);

        this.isRunning = true;
        this.isPlaybackOn = false;
        this.peakVolume = 0;
        this.hasDetectedSignal = false;
        this.volumeHistory = [];
        this.testStartTime = Date.now();

        return { success: true };
      } catch (err) {
        return { success: false, error: MicTester.parseError(err) };
      }
    }

    stop() {
      if (this.stream) {
        this.stream.getTracks().forEach((t) => t.stop());
        this.stream = null;
      }
      if (this.source) {
        try { this.source.disconnect(); } catch (_) {}
        this.source = null;
      }
      if (this.gainNode) {
        try { this.gainNode.disconnect(); } catch (_) {}
        this.gainNode = null;
      }
      if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close().catch(() => {});
        this.audioContext = null;
      }
      this.analyser = null;
      this.isRunning = false;
      this.isPlaybackOn = false;
    }

    setPlayback(on) {
      if (!this.gainNode) return;
      this.gainNode.gain.setTargetAtTime(on ? 0.8 : 0, this.audioContext.currentTime, 0.05);
      this.isPlaybackOn = on;
    }

    /** Returns RMS volume 0–1 */
    getVolume() {
      if (!this.analyser) return 0;
      const buf = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      // Scale: typical speech RMS ≈ 0.02–0.1 → map to 0–1 with headroom
      const vol = Math.min(1, rms * 5);
      if (vol > 0.015) this.hasDetectedSignal = true;
      if (vol > this.peakVolume) this.peakVolume = vol;
      this.volumeHistory.push(vol);
      // Keep history bounded
      if (this.volumeHistory.length > 600) this.volumeHistory.shift();
      return vol;
    }

    getTimeDomainData() {
      if (!this.analyser) return new Uint8Array(0);
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteTimeDomainData(data);
      return data;
    }

    getFrequencyData() {
      if (!this.analyser) return new Uint8Array(0);
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(data);
      return data;
    }

    getDeviceName() {
      if (!this.stream) return 'Unknown';
      const track = this.stream.getAudioTracks()[0];
      return track ? (track.label || 'Default Microphone') : 'Unknown';
    }

    getResults() {
      const avg = this.volumeHistory.length
        ? this.volumeHistory.reduce((a, b) => a + b, 0) / this.volumeHistory.length
        : 0;
      return {
        micDetected: true,
        signalDetected: this.hasDetectedSignal,
        peakVolume: this.peakVolume,
        avgVolume: avg,
        levelNormal: this.peakVolume > 0.08,
        levelQuiet: this.peakVolume > 0.015 && this.peakVolume <= 0.08,
        levelSilent: this.peakVolume <= 0.015,
      };
    }

    static async enumerateDevices() {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        return all.filter((d) => d.kind === 'audioinput');
      } catch (_) {
        return [];
      }
    }

    static parseError(err) {
      const name = err.name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        return {
          title: 'Microphone Permission Blocked',
          message:
            'Please allow microphone access in your browser settings and try again.',
          type: 'permission',
        };
      }
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        return {
          title: 'No Microphone Detected',
          message:
            'No microphone was found on your device. Please connect a microphone and try again.',
          type: 'not-found',
        };
      }
      if (name === 'NotReadableError' || name === 'TrackStartError') {
        return {
          title: 'Microphone Unavailable',
          message:
            'Your microphone may be in use by another application. Close other apps and try again.',
          type: 'in-use',
        };
      }
      if (name === 'OverconstrainedError') {
        return {
          title: 'Microphone Not Available',
          message:
            'The selected microphone could not be used. Try selecting a different microphone.',
          type: 'overconstrained',
        };
      }
      return {
        title: 'Microphone Error',
        message:
          'An unexpected error occurred while accessing your microphone. Please try again.',
        type: 'unknown',
      };
    }

    static isSupported() {
      return !!(
        navigator.mediaDevices &&
        navigator.mediaDevices.getUserMedia &&
        (window.AudioContext || window.webkitAudioContext)
      );
    }
  }

  // ──────────────────────────────────────────
  // Visualization
  // ──────────────────────────────────────────
  class Visualizer {
    constructor(vizCanvas, waveCanvas) {
      this.vizCanvas = vizCanvas;
      this.waveCanvas = waveCanvas;
      this.vizCtx = vizCanvas.getContext('2d');
      this.waveCtx = waveCanvas.getContext('2d');
      this.animId = null;
      this.smoothVolume = 0;
    }

    /** Set canvas pixel size accounting for device pixel ratio */
    resizeCanvas(canvas) {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize() {
      this.resizeCanvas(this.vizCanvas);
      this.resizeCanvas(this.waveCanvas);
    }

    startLoop(tester) {
      this.resize();
      const self = this;

      const tick = () => {
        if (!tester.isRunning) return;
        const volume = tester.getVolume();
        self.smoothVolume += (volume - self.smoothVolume) * 0.25;

        self.drawCircular(tester.getFrequencyData(), self.smoothVolume);
        self.drawWaveform(tester.getTimeDomainData());

        self.animId = requestAnimationFrame(tick);
      };
      tick();
    }

    stopLoop() {
      if (this.animId) {
        cancelAnimationFrame(this.animId);
        this.animId = null;
      }
    }

    drawCircular(freqData, vol) {
      const ctx = this.vizCtx;
      const rect = this.vizCanvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const cx = w / 2;
      const cy = h / 2;
      const baseR = Math.min(w, h) * 0.26;

      ctx.clearRect(0, 0, w, h);

      // Outer glow
      const glowR = baseR + 12 + vol * 50;
      const glow = ctx.createRadialGradient(cx, cy, baseR * 0.4, cx, cy, glowR);
      glow.addColorStop(0, `rgba(59,130,246,${0.07 + vol * 0.18})`);
      glow.addColorStop(0.45, `rgba(139,92,246,${0.04 + vol * 0.1})`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // Inner filled circle
      ctx.beginPath();
      ctx.arc(cx, cy, baseR - 1, 0, Math.PI * 2);
      const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
      ctx.fillStyle = isDark ? 'rgba(6,6,15,0.85)' : 'rgba(248,250,252,0.85)';
      ctx.fill();

      // Base ring
      ctx.beginPath();
      ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(59,130,246,${0.25 + vol * 0.35})`;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Frequency bars around the circle
      const barCount = 80;
      const freqLen = freqData.length;
      for (let i = 0; i < barCount; i++) {
        const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
        // Sample from lower half of spectrum (more interesting for voice)
        const idx = Math.floor((i / barCount) * freqLen * 0.45);
        const val = (freqData[idx] || 0) / 255;
        const barLen = val * baseR * 0.75 + 2;

        const x1 = cx + Math.cos(angle) * (baseR + 4);
        const y1 = cy + Math.sin(angle) * (baseR + 4);
        const x2 = cx + Math.cos(angle) * (baseR + 4 + barLen);
        const y2 = cy + Math.sin(angle) * (baseR + 4 + barLen);

        const hue = 210 + (i / barCount) * 70; // blue → purple
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = `hsla(${hue},75%,62%,${0.35 + val * 0.65})`;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Second inner ring (subtle)
      ctx.beginPath();
      ctx.arc(cx, cy, baseR * 0.68 + vol * 4, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(6,182,212,${0.08 + vol * 0.15})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    drawWaveform(waveData) {
      const ctx = this.waveCtx;
      const rect = this.waveCanvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      ctx.clearRect(0, 0, w, h);

      // Center line
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (!waveData.length) return;

      // Waveform line
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#3b82f6');
      grad.addColorStop(0.5, '#8b5cf6');
      grad.addColorStop(1, '#06b6d4');

      ctx.beginPath();
      const step = w / waveData.length;
      for (let i = 0; i < waveData.length; i++) {
        const v = waveData[i] / 128.0;
        const y = (v * h) / 2;
        if (i === 0) ctx.moveTo(0, y);
        else ctx.lineTo(i * step, y);
      }
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 6;
      ctx.shadowColor = 'rgba(59,130,246,0.35)';
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  // ──────────────────────────────────────────
  // App Controller
  // ──────────────────────────────────────────
  let tester = new MicTester();
  let viz = null;
  let uiUpdateInterval = null;

  function showView(view) {
    dom.idleCard.classList.add('hidden');
    dom.testingCard.classList.add('hidden');
    dom.resultsCard.classList.add('hidden');
    dom.errorCard.classList.add('hidden');

    const target = {
      idle: dom.idleCard,
      testing: dom.testingCard,
      results: dom.resultsCard,
      error: dom.errorCard,
    }[view];

    if (target) {
      target.classList.remove('hidden');
      target.classList.remove('card-enter');
      // Force reflow for animation restart
      void target.offsetWidth;
      target.classList.add('card-enter');
    }
  }

  function setStatus(text, type) {
    dom.statusText.textContent = text;
    dom.statusBadge.className = 'status-badge';
    if (type === 'warn') dom.statusBadge.classList.add('status-warning');
    if (type === 'error') dom.statusBadge.classList.add('status-error');
  }

  function updateVolumeMeter(vol) {
    const pct = Math.round(vol * 100);
    dom.volumeFill.style.width = pct + '%';
    dom.volumePct.textContent = pct + '%';
    dom.infoInput.textContent = pct + '%';

    // Update the meter's ARIA value
    const meterTrack = dom.volumeFill.parentElement;
    meterTrack.setAttribute('aria-valuenow', pct);

    // Color class
    dom.volumeFill.classList.remove('level-high', 'level-clip');
    if (vol > 0.85) dom.volumeFill.classList.add('level-clip');
    else if (vol > 0.6) dom.volumeFill.classList.add('level-high');
  }

  function updateSignalStatus(vol) {
    if (vol > 0.08) {
      dom.infoSignal.textContent = '● Strong';
      dom.infoSignal.style.color = 'var(--success)';
      setStatus('Microphone working', 'ok');
    } else if (vol > 0.015) {
      dom.infoSignal.textContent = '● Detected (quiet)';
      dom.infoSignal.style.color = 'var(--warning)';
      setStatus('Audio detected — speak louder', 'warn');
    } else {
      dom.infoSignal.textContent = '○ Waiting…';
      dom.infoSignal.style.color = 'var(--text-muted)';
    }
  }

  async function startTest(deviceId) {
    showView('testing');
    setStatus('Requesting permission…', 'ok');
    dom.infoDevice.textContent = 'Detecting…';
    dom.infoSignal.textContent = 'Waiting…';
    dom.infoSignal.style.color = 'var(--text-muted)';
    dom.infoInput.textContent = '0%';
    updateVolumeMeter(0);

    // Reset playback toggle
    dom.playbackToggle.setAttribute('aria-checked', 'false');
    dom.playbackWarning.classList.add('hidden');

    const result = await tester.start(deviceId || null);

    if (!result.success) {
      showError(result.error);
      return;
    }

    // Show device info
    dom.infoDevice.textContent = tester.getDeviceName();
    setStatus('Listening… Speak now', 'ok');

    // Populate device list
    populateDevices();

    // Start visualization
    viz = new Visualizer(dom.vizCanvas, dom.waveCanvas);
    viz.startLoop(tester);

    // UI update interval (volume meter, signal status) — runs at ~15 fps
    uiUpdateInterval = setInterval(() => {
      if (!tester.isRunning) return;
      const vol = tester.getVolume();
      updateVolumeMeter(vol);
      updateSignalStatus(vol);
    }, 66);

    // Watch for track ending (mic disconnected)
    const track = tester.stream && tester.stream.getAudioTracks()[0];
    if (track) {
      track.addEventListener('ended', () => {
        if (tester.isRunning) {
          stopTest();
          showError({
            title: 'Microphone Disconnected',
            message: 'Your microphone was disconnected during the test. Please reconnect and try again.',
            type: 'disconnected',
          });
        }
      });
    }
  }

  function stopTest() {
    const results = tester.isRunning ? tester.getResults() : null;
    tester.stop();

    if (viz) {
      viz.stopLoop();
      viz = null;
    }
    if (uiUpdateInterval) {
      clearInterval(uiUpdateInterval);
      uiUpdateInterval = null;
    }

    if (results) showResults(results);
  }

  function showResults(r) {
    showView('results');

    dom.resultsChecklist.innerHTML = '';

    const items = [];
    // Mic detected
    items.push({ ok: r.micDetected, text: 'Microphone detected' });
    // Signal detected
    if (r.signalDetected) {
      items.push({ ok: true, text: 'Audio signal detected' });
    } else {
      items.push({ ok: false, text: 'No audio signal detected', fail: true });
    }
    // Level
    if (r.levelNormal) {
      items.push({ ok: true, text: 'Input level normal' });
    } else if (r.levelQuiet) {
      items.push({ ok: false, text: 'Input level is very quiet', warn: true });
    } else {
      items.push({ ok: false, text: 'No microphone input detected', fail: true });
    }

    items.forEach((item) => {
      const li = document.createElement('li');
      const icon = item.ok ? '✅' : item.warn ? '⚠️' : '❌';
      const cls = item.ok ? 'result-ok' : item.warn ? 'result-warn' : 'result-fail';
      li.className = cls;
      li.innerHTML = `<span aria-hidden="true">${icon}</span> ${item.text}`;
      dom.resultsChecklist.appendChild(li);
    });

    // Overall status
    if (r.levelNormal && r.signalDetected) {
      dom.resultsMainIcon.textContent = '✅';
      dom.overallStatus.textContent = 'Overall Status: Microphone is working';
      dom.overallStatus.className = 'overall-status overall-ok';
    } else if (r.levelQuiet) {
      dom.resultsMainIcon.textContent = '⚠️';
      dom.overallStatus.textContent = 'Overall Status: Microphone input is very quiet';
      dom.overallStatus.className = 'overall-status overall-warn';
    } else {
      dom.resultsMainIcon.textContent = '❌';
      dom.overallStatus.textContent = 'Overall Status: No microphone input detected';
      dom.overallStatus.className = 'overall-status overall-fail';
    }
  }

  function showError(err) {
    tester.stop();
    if (viz) { viz.stopLoop(); viz = null; }
    if (uiUpdateInterval) { clearInterval(uiUpdateInterval); uiUpdateInterval = null; }

    dom.errorTitle.textContent = err.title;
    dom.errorMessage.textContent = err.message;
    showView('error');
  }

  async function populateDevices() {
    const devices = await MicTester.enumerateDevices();
    if (devices.length <= 1) {
      dom.deviceWrapper.classList.add('hidden');
      return;
    }

    dom.micSelect.innerHTML = '';
    devices.forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Microphone ${i + 1}`;
      dom.micSelect.appendChild(opt);
    });

    // Select current device
    if (tester.stream) {
      const track = tester.stream.getAudioTracks()[0];
      const settings = track && track.getSettings ? track.getSettings() : {};
      if (settings.deviceId) {
        dom.micSelect.value = settings.deviceId;
      }
    }

    dom.deviceWrapper.classList.remove('hidden');
  }

  // ──────────────────────────────────────────
  // Event Listeners
  // ──────────────────────────────────────────

  // Start test
  dom.startBtn.addEventListener('click', () => startTest());

  // Stop test
  dom.stopBtn.addEventListener('click', () => stopTest());

  // Test again
  dom.testAgainBtn.addEventListener('click', () => {
    tester = new MicTester();
    showView('idle');
  });

  // Error retry
  dom.errorRetryBtn.addEventListener('click', () => {
    tester = new MicTester();
    startTest();
  });

  // Playback toggle
  dom.playbackToggle.addEventListener('click', () => {
    const on = dom.playbackToggle.getAttribute('aria-checked') === 'true';
    const newState = !on;
    dom.playbackToggle.setAttribute('aria-checked', String(newState));
    tester.setPlayback(newState);
    dom.playbackWarning.classList.toggle('hidden', !newState);
  });

  // Device change
  dom.micSelect.addEventListener('change', async () => {
    const deviceId = dom.micSelect.value;
    if (tester.isRunning) {
      // Stop current, restart with new device
      tester.stop();
      if (viz) { viz.stopLoop(); viz = null; }
      if (uiUpdateInterval) { clearInterval(uiUpdateInterval); uiUpdateInterval = null; }
      tester = new MicTester();
      await startTest(deviceId);
    }
  });

  // Device change system event
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', async () => {
      if (tester.isRunning) {
        await populateDevices();
      }
    });
  }

  // Theme toggle
  dom.themeToggle.addEventListener('click', () => {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    try { localStorage.setItem('mic-app-theme', next); } catch (_) {}
  });

  // Restore saved theme
  try {
    const saved = localStorage.getItem('mic-app-theme');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  } catch (_) {}

  // Mobile menu
  dom.mobileMenuBtn.addEventListener('click', () => {
    const open = dom.mobileOverlay.classList.contains('hidden');
    dom.mobileOverlay.classList.toggle('hidden', !open);
    dom.mobileOverlay.setAttribute('aria-hidden', String(!open));
    dom.mobileMenuBtn.setAttribute('aria-expanded', String(open));
  });

  // Close mobile menu on link click
  dom.mobileOverlay.querySelectorAll('.mobile-link').forEach((link) => {
    link.addEventListener('click', () => {
      dom.mobileOverlay.classList.add('hidden');
      dom.mobileOverlay.setAttribute('aria-hidden', 'true');
      dom.mobileMenuBtn.setAttribute('aria-expanded', 'false');
    });
  });

  // Close mobile menu on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !dom.mobileOverlay.classList.contains('hidden')) {
      dom.mobileOverlay.classList.add('hidden');
      dom.mobileOverlay.setAttribute('aria-hidden', 'true');
      dom.mobileMenuBtn.setAttribute('aria-expanded', 'false');
    }
  });

  // Check browser permissions
  dom.checkPermsBtn.addEventListener('click', async () => {
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const result = await navigator.permissions.query({ name: 'microphone' });
        const stateMap = {
          granted: 'Microphone permission is currently ALLOWED. ✅',
          denied: 'Microphone permission is currently BLOCKED. ❌\n\nTo fix this, click the lock/site-info icon in your browser\'s address bar and allow microphone access, then reload the page.',
          prompt: 'Microphone permission has not been decided yet. Click "Test My Microphone" and your browser will ask for permission.',
        };
        alert(stateMap[result.state] || `Permission state: ${result.state}`);
      } catch (_) {
        // Permissions API may not support 'microphone' query (e.g. Firefox)
        alert(
          'Your browser does not support checking microphone permissions programmatically.\n\n' +
          'To check:\n' +
          '• Chrome/Edge: Click the lock icon in the address bar → Site settings → Microphone\n' +
          '• Firefox: Click the lock icon → Permissions → Use the Microphone\n' +
          '• Safari: Safari menu → Settings → Websites → Microphone'
        );
      }
    } else {
      alert(
        'To check microphone permissions:\n\n' +
        '• Chrome/Edge: Click the lock icon in the address bar → Site settings → Microphone\n' +
        '• Firefox: Click the lock icon → Permissions → Use the Microphone\n' +
        '• Safari: Safari menu → Settings → Websites → Microphone'
      );
    }
  });

  // Handle window resize for canvas
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (viz) viz.resize();
    }, 150);
  });

  // Smooth scroll for nav links
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // ──────────────────────────────────────────
  // Init — check browser support
  // ──────────────────────────────────────────
  if (!MicTester.isSupported()) {
    dom.startBtn.disabled = true;
    dom.startBtn.textContent = 'Browser Not Supported';
    dom.startBtn.title =
      'Your browser does not support the required audio APIs. Please use a modern browser like Chrome, Firefox, Edge, or Safari 14.1+.';
  }
})();
