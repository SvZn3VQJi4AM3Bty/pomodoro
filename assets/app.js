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
    showCurrentTime: true,
    showTimerNumber: false,
    showInfoSections: true,
    /** @type {"mute"|"single"|"double"|"triple"|"long"} */
    endSoundPattern: "triple",
    /** @type {"low"|"med"|"high"} */
    endSoundVolume: "med",
  });

  const SOUND_PATTERNS = new Set(["mute", "single", "double", "triple", "long"]);
  const SOUND_VOLUMES = new Set(["low", "med", "high"]);

  /** @type {"focus"|"short"|"long"} */
  const Mode = {
    FOCUS: "focus",
    SHORT: "short",
    LONG: "long",
  };

  const MODE_THEME = Object.freeze({
    [Mode.FOCUS]: Object.freeze({
      accent: "#5f6672",
      label: "#e6edf8",
      chipBorder: "#5c6673",
      chipBg: "#343d49",
      chipText: "#f1f5fb",
    }),
    [Mode.SHORT]: Object.freeze({
      accent: "#4f7b63",
      label: "#dff3e7",
      chipBorder: "#4f7b63",
      chipBg: "#2b4336",
      chipText: "#ecfaf1",
    }),
    [Mode.LONG]: Object.freeze({
      accent: "#75608b",
      label: "#eee4fa",
      chipBorder: "#75608b",
      chipBg: "#43384f",
      chipText: "#f5effc",
    }),
  });

  const el = {
    timeText: document.getElementById("timeText"),
    timerNumberWrap: document.getElementById("timerNumberWrap"),
    progressCircle: document.getElementById("progressCircle"),
    currentTimeWrap: document.getElementById("currentTimeWrap"),
    infoSectionsWrap: document.getElementById("infoSectionsWrap"),
    currentDateText: document.getElementById("currentDateText"),
    currentTimeText: document.getElementById("currentTimeText"),
    calendarMonthText: document.getElementById("calendarMonthText"),
    calendarGrid: document.getElementById("calendarGrid"),
    calendarPrevBtn: document.getElementById("calendarPrevBtn"),
    calendarNextBtn: document.getElementById("calendarNextBtn"),
    startPauseBtn: document.getElementById("startPauseBtn"),
    resetBtn: document.getElementById("resetBtn"),
    resetSessionsBtn: document.getElementById("resetSessionsBtn"),
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
    showTimerNumber: document.getElementById("showTimerNumber"),
    showCurrentTime: document.getElementById("showCurrentTime"),
    showInfoSections: document.getElementById("showInfoSections"),
    endSoundPattern: document.getElementById("endSoundPattern"),
    endSoundVolume: document.getElementById("endSoundVolume"),
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
        showCurrentTime: typeof parsed.showCurrentTime === "boolean" ? parsed.showCurrentTime : DEFAULTS.showCurrentTime,
        showTimerNumber:
          typeof parsed.showTimerNumber === "boolean" ? parsed.showTimerNumber : DEFAULTS.showTimerNumber,
        showInfoSections:
          typeof parsed.showInfoSections === "boolean" ? parsed.showInfoSections : DEFAULTS.showInfoSections,
        endSoundPattern: patternRaw,
        endSoundVolume: volumeRaw,
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

  function formatCurrentTime(nowDate) {
    const hh = String(nowDate.getHours()).padStart(2, "0");
    const mm = String(nowDate.getMinutes()).padStart(2, "0");
    const ss = String(nowDate.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  function formatCurrentDate(nowDate) {
    const yyyy = String(nowDate.getFullYear());
    const mm = String(nowDate.getMonth() + 1).padStart(2, "0");
    const dd = String(nowDate.getDate()).padStart(2, "0");
    const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
    const weekday = weekdays[nowDate.getDay()];
    return `${yyyy}/${mm}/${dd} (${weekday})`;
  }

  function dateKey(year, month1, day) {
    return `${year}-${String(month1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function nthMonday(year, monthIndex, nth) {
    const firstDayWeek = new Date(year, monthIndex, 1).getDay();
    const firstMonday = 1 + ((8 - firstDayWeek) % 7);
    return firstMonday + (nth - 1) * 7;
  }

  // 春分・秋分の近似式（1980-2099年の一般的な判定に十分な精度）
  function vernalEquinoxDay(year) {
    return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  }

  function autumnEquinoxDay(year) {
    return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  }

  function getJapaneseHolidays(year) {
    /** @type {Map<string, string>} */
    const map = new Map();
    const add = (month1, day, name) => map.set(dateKey(year, month1, day), name);

    // 固定日
    add(1, 1, "元日");
    add(2, 11, "建国記念の日");
    add(2, 23, "天皇誕生日");
    add(4, 29, "昭和の日");
    add(5, 3, "憲法記念日");
    add(5, 4, "みどりの日");
    add(5, 5, "こどもの日");
    add(8, 11, "山の日");
    add(11, 3, "文化の日");
    add(11, 23, "勤労感謝の日");

    // ハッピーマンデー
    add(1, nthMonday(year, 0, 2), "成人の日");
    add(7, nthMonday(year, 6, 3), "海の日");
    add(9, nthMonday(year, 8, 3), "敬老の日");
    add(10, nthMonday(year, 9, 2), "スポーツの日");

    // 春分・秋分
    add(3, vernalEquinoxDay(year), "春分の日");
    add(9, autumnEquinoxDay(year), "秋分の日");

    // 振替休日（日曜に重なった祝日の翌平日）
    const baseEntries = Array.from(map.entries());
    for (const [key, name] of baseEntries) {
      const d = new Date(`${key}T00:00:00`);
      if (d.getDay() !== 0) continue;
      const sub = new Date(d);
      do {
        sub.setDate(sub.getDate() + 1);
      } while (map.has(dateKey(sub.getFullYear(), sub.getMonth() + 1, sub.getDate())));
      map.set(
        dateKey(sub.getFullYear(), sub.getMonth() + 1, sub.getDate()),
        `振替休日（${name}）`
      );
    }

    // 国民の休日（祝日に挟まれた平日）
    const day = new Date(year, 0, 2);
    while (day.getFullYear() === year) {
      const prev = new Date(day);
      prev.setDate(day.getDate() - 1);
      const next = new Date(day);
      next.setDate(day.getDate() + 1);
      const currKey = dateKey(year, day.getMonth() + 1, day.getDate());
      const prevKey = dateKey(prev.getFullYear(), prev.getMonth() + 1, prev.getDate());
      const nextKey = dateKey(next.getFullYear(), next.getMonth() + 1, next.getDate());
      if (!map.has(currKey) && map.has(prevKey) && map.has(nextKey) && day.getDay() !== 0) {
        map.set(currKey, "国民の休日");
      }
      day.setDate(day.getDate() + 1);
    }

    return map;
  }

  function renderCalendar(nowDate) {
    const displayDate = new Date(nowDate.getFullYear(), nowDate.getMonth() + calendarOffsetMonths, 1);
    const year = displayDate.getFullYear();
    const month = displayDate.getMonth();
    const holidays = getJapaneseHolidays(year);

    el.calendarMonthText.textContent = `${year}年${String(month + 1).padStart(2, "0")}月`;

    const firstWeekday = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    const totalCells = Math.ceil((firstWeekday + lastDate) / 7) * 7;

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < totalCells; i += 1) {
      const cell = document.createElement("span");
      cell.className = "calendarDay";
      if (i < firstWeekday || i >= firstWeekday + lastDate) {
        cell.classList.add("isBlank");
        cell.textContent = "";
      } else {
        const day = i - firstWeekday + 1;
        const weekday = i % 7;
        const key = dateKey(year, month + 1, day);
        const holidayName = holidays.get(key);
        cell.textContent = String(day);
        if (weekday === 0) {
          cell.classList.add("isSunday");
        } else if (weekday === 6) {
          cell.classList.add("isSaturday");
        }
        if (holidayName) {
          cell.classList.add("isHoliday");
          cell.title = holidayName;
        }
        const isToday =
          calendarOffsetMonths === 0 &&
          day === nowDate.getDate() &&
          month === nowDate.getMonth() &&
          year === nowDate.getFullYear();
        if (isToday) {
          cell.classList.add("isToday");
        }
      }
      fragment.appendChild(cell);
    }

    el.calendarGrid.replaceChildren(fragment);
  }

  function modeLabel(mode) {
    if (mode === Mode.FOCUS) return "没入";
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
   * 終了通知の音（外部音声ファイルなし）。
   * @param {{ endSoundPattern: string, endSoundVolume: string }} prefs
   */
  async function playEndSound(prefs) {
    try {
      if (prefs.endSoundPattern === "mute") return;
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
  let currentTimeIntervalId = null;
  let calendarOffsetMonths = 0;

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

  function applyModeTheme() {
    const theme = MODE_THEME[mode] || MODE_THEME[Mode.FOCUS];
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--accent", theme.accent);
    rootStyle.setProperty("--modeLabelColor", theme.label);
    rootStyle.setProperty("--modeChipBorder", theme.chipBorder);
    rootStyle.setProperty("--modeChipBg", theme.chipBg);
    rootStyle.setProperty("--modeChipText", theme.chipText);
  }

  function render() {
    applyModeTheme();
    el.timeText.textContent = formatMMSS(remainingSec);
    el.timerNumberWrap.hidden = !settings.showTimerNumber;
    el.currentTimeWrap.hidden = !settings.showCurrentTime;
    el.infoSectionsWrap.hidden = !settings.showInfoSections;

    const pct = durationSec === 0 ? 0 : ((durationSec - remainingSec) / durationSec) * 100;
    const clampedPct = Math.min(100, Math.max(0, pct));
    el.progressCircle.style.setProperty("--progress", `${clampedPct}%`);

    el.startPauseBtn.textContent = running ? "一時停止" : "開始";
    el.statusText.textContent = running ? `${modeLabel(mode)}中` : "待機中";
    el.sessionCount.textContent = String(focusSessionsCompleted);

    renderModeButtons();
    setDocumentTitle();
  }

  function renderCurrentTime() {
    const now = new Date();
    el.currentDateText.textContent = formatCurrentDate(now);
    el.currentTimeText.textContent = formatCurrentTime(now);
    renderCalendar(now);
  }

  function startCurrentTimeTicker() {
    renderCurrentTime();
    if (currentTimeIntervalId != null) {
      window.clearInterval(currentTimeIntervalId);
    }
    currentTimeIntervalId = window.setInterval(renderCurrentTime, 1000);
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

  function resetSessionsCount() {
    const ok = window.confirm("セッション数を0にリセットします。よろしいですか？");
    if (!ok) return;
    focusSessionsCompleted = 0;
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
    el.showTimerNumber.checked = settings.showTimerNumber;
    el.showCurrentTime.checked = settings.showCurrentTime;
    el.showInfoSections.checked = settings.showInfoSections;
    el.endSoundPattern.value = settings.endSoundPattern;
    el.endSoundVolume.value = settings.endSoundVolume;
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
    };
  }

  function applySettingsFromForm(options = {}) {
    const { resetTimer = true } = options;
    const sound = readSoundPrefsFromForm();
    const next = {
      focusMinutes: clampInt(el.focusMinutes.value, 1, 180, DEFAULTS.focusMinutes),
      shortMinutes: clampInt(el.shortMinutes.value, 1, 60, DEFAULTS.shortMinutes),
      longMinutes: clampInt(el.longMinutes.value, 1, 120, DEFAULTS.longMinutes),
      longBreakEvery: clampInt(el.longBreakEvery.value, 2, 12, DEFAULTS.longBreakEvery),
      autoStartNext: Boolean(el.autoStartNext.checked),
      showTimerNumber: Boolean(el.showTimerNumber.checked),
      showCurrentTime: Boolean(el.showCurrentTime.checked),
      showInfoSections: Boolean(el.showInfoSections.checked),
      ...sound,
    };
    Object.assign(settings, next);
    saveSettings(settings);

    // 時間設定が変わった場合のみ残り時間をリセットする
    if (resetTimer) {
      durationSec = getDurationSeconds(mode, settings);
      remainingSec = durationSec;
    }
    render();
    persistNow();
  }

  function init() {
    syncSettingsForm();
    startCurrentTimeTicker();

    el.startPauseBtn.addEventListener("click", () => {
      if (running) pause();
      else start();
    });

    el.resetBtn.addEventListener("click", () => reset(true));
    el.resetSessionsBtn.addEventListener("click", resetSessionsCount);

    el.modeFocus.addEventListener("click", () => setMode(Mode.FOCUS));
    el.modeShort.addEventListener("click", () => setMode(Mode.SHORT));
    el.modeLong.addEventListener("click", () => setMode(Mode.LONG));
    el.calendarPrevBtn.addEventListener("click", () => {
      calendarOffsetMonths -= 1;
      renderCurrentTime();
    });
    el.calendarNextBtn.addEventListener("click", () => {
      calendarOffsetMonths += 1;
      renderCurrentTime();
    });

    el.settingsForm.addEventListener("change", (e) => {
      const target = e.target;
      if (!target || typeof target.id !== "string") return;
      const shouldResetTimer =
        target.id === "focusMinutes" ||
        target.id === "shortMinutes" ||
        target.id === "longMinutes" ||
        target.id === "longBreakEvery";
      applySettingsFromForm({ resetTimer: shouldResetTimer });
    });

    el.showTimerNumber.addEventListener("change", () => {
      settings.showTimerNumber = Boolean(el.showTimerNumber.checked);
      saveSettings(settings);
      render();
    });
    el.showCurrentTime.addEventListener("change", () => {
      settings.showCurrentTime = Boolean(el.showCurrentTime.checked);
      saveSettings(settings);
      render();
    });
    el.showInfoSections.addEventListener("change", () => {
      settings.showInfoSections = Boolean(el.showInfoSections.checked);
      saveSettings(settings);
      render();
    });

    el.restoreDefaultsBtn.addEventListener("click", () => {
      Object.assign(settings, { ...DEFAULTS });
      saveSettings(settings);
      syncSettingsForm();
      renderCurrentTime();
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
