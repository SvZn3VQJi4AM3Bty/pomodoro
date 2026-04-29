/* global window, document, localStorage, Audio */

(() => {
  "use strict";

  const STORAGE_KEY = "pomodoro.settings.v1";
  const STATE_KEY = "pomodoro.state.v1";

  const DEFAULTS = Object.freeze({
    focusMinutes: 25,
    shortMinutes: 5,
    longMinutes: 15,
    longBreakEvery: 4,
    autoStartNext: false,
    /** @type {"single"|"double"|"triple"|"long"} */
    endSoundPattern: "triple",
    /** @type {"low"|"med"|"high"} */
    endSoundVolume: "med",
    endVibrate: true,
  });

  const SOUND_PATTERNS = new Set(["single", "double", "triple", "long"]);
  const SOUND_VOLUMES = new Set(["low", "med", "high"]);

  /** @type {"focus"|"short"|"long"} */
  const Mode = {
    FOCUS: "focus",
    SHORT: "short",
    LONG: "long",
  };

  const el = {
    timeText: document.getElementById("timeText"),
    progressBar: document.getElementById("progressBar"),
    startPauseBtn: document.getElementById("startPauseBtn"),
    resetBtn: document.getElementById("resetBtn"),
    statusText: document.getElementById("statusText"),
    sessionCount: document.getElementById("sessionCount"),
    modeFocus: document.getElementById("modeFocus"),
    modeShort: document.getElementById("modeShort"),
    modeLong: document.getElementById("modeLong"),
    settingsForm: document.getElementById("settingsForm"),
    focusMinutes: document.getElementById("focusMinutes"),
    shortMinutes: document.getElementById("shortMinutes"),
    longMinutes: document.getElementById("longMinutes"),
    longBreakEvery: document.getElementById("longBreakEvery"),
    autoStartNext: document.getElementById("autoStartNext"),
    endSoundPattern: document.getElementById("endSoundPattern"),
    endSoundVolume: document.getElementById("endSoundVolume"),
    endVibrate: document.getElementById("endVibrate"),
    vibrateSupportText: document.getElementById("vibrateSupportText"),
    vibrateRequestText: document.getElementById("vibrateRequestText"),
    restoreDefaultsBtn: document.getElementById("restoreDefaultsBtn"),
    previewEndSoundBtn: document.getElementById("previewEndSoundBtn"),
  };

  function clampInt(value, min, max, fallback) {
    const n = Number.parseInt(String(value), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULTS };
      const parsed = JSON.parse(raw);
      const patternRaw =
        typeof parsed.endSoundPattern === "string" && SOUND_PATTERNS.has(parsed.endSoundPattern)
          ? parsed.endSoundPattern
          : DEFAULTS.endSoundPattern;
      const volumeRaw =
        typeof parsed.endSoundVolume === "string" && SOUND_VOLUMES.has(parsed.endSoundVolume)
          ? parsed.endSoundVolume
          : DEFAULTS.endSoundVolume;
      return {
        focusMinutes: clampInt(parsed.focusMinutes, 1, 180, DEFAULTS.focusMinutes),
        shortMinutes: clampInt(parsed.shortMinutes, 1, 60, DEFAULTS.shortMinutes),
        longMinutes: clampInt(parsed.longMinutes, 1, 120, DEFAULTS.longMinutes),
        longBreakEvery: clampInt(parsed.longBreakEvery, 2, 12, DEFAULTS.longBreakEvery),
        autoStartNext: Boolean(parsed.autoStartNext),
        endSoundPattern: patternRaw,
        endSoundVolume: volumeRaw,
        endVibrate:
          typeof parsed.endVibrate === "boolean" ? parsed.endVibrate : DEFAULTS.endVibrate,
      };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function saveState(state) {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  function formatMMSS(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  function modeLabel(mode) {
    if (mode === Mode.FOCUS) return "集中";
    if (mode === Mode.SHORT) return "小休憩";
    return "長休憩";
  }

  function getDurationSeconds(mode, settings) {
    const minutes =
      mode === Mode.FOCUS
        ? settings.focusMinutes
        : mode === Mode.SHORT
          ? settings.shortMinutes
          : settings.longMinutes;
    return minutes * 60;
  }

  // ブラウザの自動再生制限を避けるため、最初のユーザー操作以降に音を鳴らす
  let audioUnlocked = false;
  const unlockOnce = () => {
    if (audioUnlocked) return;
    audioUnlocked = true;

    // モバイルでは AudioContext.resume() が「ユーザー操作直後」でないと失敗しやすい。
    // 先に resume しておくことで、タイマー終了時（ユーザー操作の後）でも鳴る確率が上がる。
    void resumeAudioContextIfNeeded();

    window.removeEventListener("pointerdown", unlockOnce);
    window.removeEventListener("touchstart", unlockOnce);
    window.removeEventListener("mousedown", unlockOnce);
    window.removeEventListener("keydown", unlockOnce);
  };
  window.addEventListener("pointerdown", unlockOnce, { once: true });
  window.addEventListener("touchstart", unlockOnce, { once: true, passive: true });
  window.addEventListener("mousedown", unlockOnce, { once: true });
  window.addEventListener("keydown", unlockOnce, { once: true });

  /** @type {AudioContext | null} */
  let sharedAudioCtx = null;

  function getOrCreateAudioContext() {
    if (!sharedAudioCtx) {
      sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return sharedAudioCtx;
  }

  /**
   * モバイル（特に Android Chrome）では AudioContext が suspended のままだと無音になる。
   * resume() は Promise を返すので、完了を待ってからオシレータを叩く必要がある。
   */
  async function resumeAudioContextIfNeeded() {
    const ctx = getOrCreateAudioContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    return ctx;
  }

  const settings = loadSettings();

  /**
   * @param {{ endSoundVolume: "low"|"med"|"high" }} prefs
   */
  function endSoundVolumeMultiplierFor(prefs) {
    if (prefs.endSoundVolume === "low") return 0.55;
    if (prefs.endSoundVolume === "high") return 1.45;
    return 1.0;
  }

  /**
   * 終了通知の音・振動（外部音声ファイルなし）。
   * @param {{ endSoundPattern: string, endSoundVolume: string, endVibrate: boolean }} prefs
   */
  async function playEndSound(prefs) {
    if (!prefs.endVibrate) {
      setVibrateRequestText("OFF");
    } else if (typeof navigator.vibrate === "function") {
      try {
        let pattern;
        if (prefs.endSoundPattern === "single") {
          pattern = [220];
        } else if (prefs.endSoundPattern === "double") {
          pattern = [140, 100, 200];
        } else if (prefs.endSoundPattern === "long") {
          pattern = [280];
        } else {
          pattern = [160, 110, 160, 110, 220];
        }
        const accepted = navigator.vibrate(pattern);
        setVibrateRequestText(accepted ? "受理" : "拒否");
      } catch {
        setVibrateRequestText("失敗");
      }
    } else {
      setVibrateRequestText("未対応");
    }

    try {
      const ctx = await resumeAudioContextIfNeeded();
      const now = ctx.currentTime;
      const volMul = endSoundVolumeMultiplierFor(prefs);
      const cap = 0.32;

      /**
       * @param {number} startAt
       * @param {number} freqHz
       * @param {number} durationSec
       * @param {number} peakGain
       */
      const playTone = (startAt, freqHz, durationSec, peakGain) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freqHz, startAt);

        const peak = Math.min(cap, Math.max(0.02, peakGain * volMul));
        const endAt = startAt + durationSec;
        g.gain.setValueAtTime(0.0001, startAt);
        g.gain.exponentialRampToValueAtTime(peak, startAt + 0.025);
        g.gain.exponentialRampToValueAtTime(0.0001, endAt);

        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(startAt);
        osc.stop(endAt + 0.02);
      };

      const base = 0.17;
      const p = prefs.endSoundPattern;
      if (p === "single") {
        playTone(now, 880, 0.42, base);
      } else if (p === "double") {
        playTone(now, 880, 0.28, base);
        playTone(now + 0.34, 1046, 0.28, base * 0.95);
      } else if (p === "long") {
        playTone(now, 698, 0.78, base * 1.05);
      } else {
        playTone(now + 0.0, 880, 0.32, base);
        playTone(now + 0.34, 1046, 0.32, base);
        playTone(now + 0.68, 784, 0.38, base * 1.05);
      }
    } catch {
      // 失敗してもアプリ自体は動かす
    }
  }

  function beep() {
    if (!audioUnlocked) return;
    // 「保存」しなくても、フォームで選んだ終了音設定が即座に反映されるようにする
    void playEndSound(readSoundPrefsFromForm());
  }

  const persisted = loadState();
  const initialMode =
    persisted && (persisted.mode === Mode.FOCUS || persisted.mode === Mode.SHORT || persisted.mode === Mode.LONG)
      ? persisted.mode
      : Mode.FOCUS;

  let mode = initialMode;
  let focusSessionsCompleted = clampInt(persisted?.focusSessionsCompleted, 0, 999, 0);

  let running = false;
  let durationSec = getDurationSeconds(mode, settings);
  let remainingSec = clampInt(persisted?.remainingSec, 0, durationSec, durationSec);
  let startedAtMs = null; // epoch ms
  let rafId = null;

  function setDocumentTitle() {
    const prefix = running ? "▶" : "⏸";
    document.title = `${prefix} ${formatMMSS(remainingSec)} | ${modeLabel(mode)}`;
  }

  function renderModeButtons() {
    const setPressed = (button, pressed) => {
      button.setAttribute("aria-pressed", pressed ? "true" : "false");
    };
    setPressed(el.modeFocus, mode === Mode.FOCUS);
    setPressed(el.modeShort, mode === Mode.SHORT);
    setPressed(el.modeLong, mode === Mode.LONG);
  }

  function render() {
    el.timeText.textContent = formatMMSS(remainingSec);

    const pct = durationSec === 0 ? 0 : ((durationSec - remainingSec) / durationSec) * 100;
    el.progressBar.style.width = `${Math.min(100, Math.max(0, pct))}%`;

    el.startPauseBtn.textContent = running ? "一時停止" : "開始";
    el.statusText.textContent = running ? `${modeLabel(mode)}中` : "待機中";
    el.sessionCount.textContent = String(focusSessionsCompleted);

    renderModeButtons();
    setDocumentTitle();
  }

  function persistNow() {
    saveState({
      mode,
      remainingSec,
      focusSessionsCompleted,
      savedAt: Date.now(),
    });
  }

  function stopTicker() {
    if (rafId != null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function tick() {
    if (!running) return;
    const now = Date.now();
    const elapsed = Math.floor((now - startedAtMs) / 1000);
    const nextRemaining = Math.max(0, durationSec - elapsed);
    if (nextRemaining !== remainingSec) {
      remainingSec = nextRemaining;
      render();
      persistNow();
    }

    if (remainingSec <= 0) {
      running = false;
      stopTicker();
      onFinished();
      return;
    }
    rafId = window.requestAnimationFrame(tick);
  }

  function start() {
    if (running) return;
    running = true;
    startedAtMs = Date.now() - (durationSec - remainingSec) * 1000;
    rafId = window.requestAnimationFrame(tick);
    render();
    persistNow();
  }

  function pause() {
    if (!running) return;
    running = false;
    stopTicker();
    render();
    persistNow();
  }

  function reset(keepMode = true) {
    pause();
    if (!keepMode) mode = Mode.FOCUS;
    durationSec = getDurationSeconds(mode, settings);
    remainingSec = durationSec;
    render();
    persistNow();
  }

  function setMode(nextMode) {
    if (running) return; // 走ってる最中の誤操作を防ぐ
    mode = nextMode;
    durationSec = getDurationSeconds(mode, settings);
    remainingSec = durationSec;
    render();
    persistNow();
  }

  function nextAfterFinish() {
    if (mode === Mode.FOCUS) {
      focusSessionsCompleted += 1;
      const shouldLong = focusSessionsCompleted % settings.longBreakEvery === 0;
      return shouldLong ? Mode.LONG : Mode.SHORT;
    }
    return Mode.FOCUS;
  }

  function onFinished() {
    beep();

    const next = nextAfterFinish();
    mode = next;
    durationSec = getDurationSeconds(mode, settings);
    remainingSec = durationSec;
    render();
    persistNow();

    if (settings.autoStartNext) start();
  }

  function syncSettingsForm() {
    el.focusMinutes.value = String(settings.focusMinutes);
    el.shortMinutes.value = String(settings.shortMinutes);
    el.longMinutes.value = String(settings.longMinutes);
    el.longBreakEvery.value = String(settings.longBreakEvery);
    el.autoStartNext.checked = settings.autoStartNext;
    el.endSoundPattern.value = settings.endSoundPattern;
    el.endSoundVolume.value = settings.endSoundVolume;
    el.endVibrate.checked = settings.endVibrate;
  }

  function readSoundPrefsFromForm() {
    const patternVal =
      typeof el.endSoundPattern.value === "string" && SOUND_PATTERNS.has(el.endSoundPattern.value)
        ? el.endSoundPattern.value
        : DEFAULTS.endSoundPattern;
    const volumeVal =
      typeof el.endSoundVolume.value === "string" && SOUND_VOLUMES.has(el.endSoundVolume.value)
        ? el.endSoundVolume.value
        : DEFAULTS.endSoundVolume;
    return {
      endSoundPattern: patternVal,
      endSoundVolume: volumeVal,
      endVibrate: Boolean(el.endVibrate.checked),
    };
  }

  function setVibrateSupportText() {
    if (!el.vibrateSupportText) return;
    const supported = typeof navigator.vibrate === "function";
    el.vibrateSupportText.textContent = `この端末は振動API対応: ${supported ? "あり" : "なし"}`;
  }

  /**
   * @param {"未実行"|"受理"|"拒否"|"未対応"|"OFF"|"失敗"} status
   */
  function setVibrateRequestText(status) {
    if (!el.vibrateRequestText) return;
    el.vibrateRequestText.textContent = `振動リクエスト: ${status}`;
  }

  function applySettingsFromForm() {
    const sound = readSoundPrefsFromForm();
    const next = {
      focusMinutes: clampInt(el.focusMinutes.value, 1, 180, DEFAULTS.focusMinutes),
      shortMinutes: clampInt(el.shortMinutes.value, 1, 60, DEFAULTS.shortMinutes),
      longMinutes: clampInt(el.longMinutes.value, 1, 120, DEFAULTS.longMinutes),
      longBreakEvery: clampInt(el.longBreakEvery.value, 2, 12, DEFAULTS.longBreakEvery),
      autoStartNext: Boolean(el.autoStartNext.checked),
      ...sound,
    };
    Object.assign(settings, next);
    saveSettings(settings);

    // 設定変更時は現在モードの残り時間も更新（初学者向けに挙動を分かりやすく）
    durationSec = getDurationSeconds(mode, settings);
    remainingSec = durationSec;
    render();
    persistNow();
  }

  function init() {
    syncSettingsForm();
    setVibrateSupportText();
    setVibrateRequestText("未実行");

    el.startPauseBtn.addEventListener("click", () => {
      if (running) pause();
      else start();
    });

    el.resetBtn.addEventListener("click", () => reset(true));

    el.modeFocus.addEventListener("click", () => setMode(Mode.FOCUS));
    el.modeShort.addEventListener("click", () => setMode(Mode.SHORT));
    el.modeLong.addEventListener("click", () => setMode(Mode.LONG));

    el.settingsForm.addEventListener("submit", (e) => {
      e.preventDefault();
      applySettingsFromForm();
    });

    el.restoreDefaultsBtn.addEventListener("click", () => {
      Object.assign(settings, { ...DEFAULTS });
      saveSettings(settings);
      syncSettingsForm();
      reset(false);
    });

    el.previewEndSoundBtn.addEventListener("click", () => {
      audioUnlocked = true;
      void playEndSound(readSoundPrefsFromForm());
    });

    // 復元：保存時刻が古すぎる場合は捨てる（長期放置でおかしくなるのを避ける）
    if (persisted?.savedAt && typeof persisted.savedAt === "number") {
      const ageMs = Date.now() - persisted.savedAt;
      const tooOld = ageMs > 1000 * 60 * 60 * 24 * 7; // 7日
      if (tooOld) {
        localStorage.removeItem(STATE_KEY);
        remainingSec = durationSec;
      } else {
        // durationSec は設定値に依存するので再計算後にクランプ
        durationSec = getDurationSeconds(mode, settings);
        remainingSec = clampInt(persisted.remainingSec, 0, durationSec, durationSec);
      }
    }

    render();
    persistNow();
  }

  init();
})();
