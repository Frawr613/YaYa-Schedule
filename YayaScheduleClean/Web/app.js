(function () {
  "use strict";

  const DAYS = ["一", "二", "三", "四", "五", "六", "日"];
  const DAY_NAME = new Map(DAYS.map((day, index) => [day, index]));
  DAY_NAME.set("天", 6);

  const STORAGE_KEY = "yaya-schedule-rewrite-v2";
  const CACHE_KEY = "yaya-schedule-rewrite-cache-v2";
  const OLD_STORAGE_KEY = "yaya-schedule-clean-state-v1";
  const ACCOUNT_USERNAME_KEY = "yaya-schedule-portal-username-v2";
  const GUIDE_ACK_KEY = "yaya-schedule-guide-ack-v2";
  const CURRENT_SCHEMA_VERSION = 3;
  const DEFAULT_TERM_START = "2026-02-23";
  const MAX_WEEK = 28;
  const COLLATOR = new Intl.Collator("zh-Hans-CN");
  const FLOATING_LAYER_BASE = 10000;
  const FLOATING_LAYER_STEP = 10;
  const DAY_ITEMS_CACHE_LIMIT = 28;
  const TIME_PICKER_HOURS = Array.from({ length: 24 }, (_, index) => index);
  const TIME_PICKER_MINUTES = Array.from({ length: 12 }, (_, index) => index * 5);
  const DATE_PICKER_YEAR_RADIUS = 6;
  const DATE_PICKER_MIN_YEAR = 1900;
  const DATE_PICKER_MAX_YEAR = 2077;
  const ACADEMIC_YEAR_MIN = 2000;
  const ACADEMIC_YEAR_MAX = DATE_PICKER_MAX_YEAR - 1;
  const INPUT_UI_PATCH_VERSION = "20260522-template-input-ui-v1";
  const PORTAL_OPEN_COOLDOWN_MS = 1400;
  const SCHEDULE_OVERVIEW_PAGES = ["custom", "recurring-active", "recurring-ended"];
  const SPECIAL_OVERVIEW_PAGES = ["move", "cancel"];

  const PERIOD_TIMES = {
    1: ["08:00", "08:45"],
    2: ["08:55", "09:40"],
    3: ["10:00", "10:45"],
    4: ["10:55", "11:40"],
    5: ["13:30", "14:15"],
    6: ["14:25", "15:10"],
    7: ["15:30", "16:15"],
    8: ["16:25", "17:10"],
    9: ["18:00", "18:45"],
    10: ["18:55", "19:40"],
    11: ["19:50", "20:35"],
    12: ["20:45", "21:30"]
  };

  const REMINDER_OPTIONS = [
    ["10080", "一周前"],
    ["1440", "一天前"],
    ["600", "十小时前"],
    ["180", "三小时前"],
    ["120", "两小时前"],
    ["60", "一小时前"],
    ["30", "半小时前"],
    ["10", "十分钟前"]
  ];
  const DEFAULT_REMINDER_VALUE = "10";
  const TERM_KIND_OPTIONS = [
    ["autumn", "秋季学期"],
    ["spring", "春季学期"],
    ["summer", "夏季学期"]
  ];

  const UI_MODULE_REGISTRY = window.YayaUiModules;
  const UI_MODULES = UI_MODULE_REGISTRY?.MODULES || [
    ["status", "状态"],
    ["ddl", "DDL"],
    ["day", "今日"],
    ["overview", "概览"]
  ];
  const DEFAULT_MODULE_ORDER = UI_MODULE_REGISTRY?.DEFAULT_ORDER || ["status", "ddl", "day", "overview"];
  const DEFAULT_MODULE_VISIBILITY = UI_MODULE_REGISTRY?.DEFAULT_VISIBILITY || Object.fromEntries(UI_MODULES.map(([key]) => [key, true]));
  const TEMPLATE_ACTIONS = UI_MODULE_REGISTRY?.ACTIONS || {};
  const UI_TEMPLATES = UI_MODULE_REGISTRY?.TEMPLATES || {};
  const UI_INPUT_COMPONENTS = UI_MODULE_REGISTRY?.INPUT_COMPONENTS || {};
  const DEFAULT_INPUT_UI = UI_MODULE_REGISTRY?.normalizeInputUi?.("originalGlass") || UI_INPUT_COMPONENTS.originalGlass || {
    label: "原版玻璃输入",
    variant: "originalGlass",
    density: "airy",
    shape: "roundedGlass",
    popup: "glassSheet",
    affordance: "softBadge",
    themeSync: true
  };
  const THEME_BRIDGE = window.YayaThemeModules;

  const THEME_PRESETS = {
    classicCustom: {
      label: "自定义主题基底",
      preset: false,
      accent: "#2563eb",
      warm: "#14b8a6",
      bg: "#edf5ff",
      ink: "#14213d",
      muted: "#64748b",
      panel: "rgba(255,255,255,0.58)",
      card: "rgba(255,255,255,0.7)",
      line: "rgba(37,99,235,0.16)",
      hero: "linear-gradient(135deg, rgba(37,99,235,0.72), rgba(20,184,166,0.58))",
      shadowAlpha: 10,
      glassAlpha: 68,
      blur: 20,
      radius: 20
    },
    coolGlass: {
      label: "冷色透明",
      accent: "#2563eb",
      warm: "#14b8a6",
      bg: "#edf5ff",
      ink: "#14213d",
      muted: "#64748b",
      panel: "rgba(255,255,255,0.58)",
      card: "rgba(255,255,255,0.7)",
      line: "rgba(37,99,235,0.16)",
      hero: "linear-gradient(135deg, rgba(16,185,129,0.76), rgba(37,99,235,0.74) 58%, rgba(124,58,237,0.72))",
      shadowAlpha: 10,
      glassAlpha: 68,
      blur: 20,
      radius: 18
    },
    warmGlass: {
      label: "暖色透明",
      accent: "#ea580c",
      warm: "#db2777",
      bg: "#fff7ed",
      ink: "#2f1b12",
      muted: "#7c6357",
      panel: "rgba(255,255,255,0.74)",
      card: "rgba(255,255,255,0.88)",
      line: "rgba(234,88,12,0.18)",
      hero: "linear-gradient(135deg, rgba(234,88,12,0.88), rgba(219,39,119,0.66))",
      shadowAlpha: 18,
      glassAlpha: 74,
      blur: 18,
      radius: 18
    },
    doodle: {
      label: "卡通涂鸦",
      accent: "#0f766e",
      warm: "#f59e0b",
      bg: "#fbf7ef",
      ink: "#1f2933",
      muted: "#68717a",
      panel: "rgba(255,255,255,0.9)",
      card: "#ffffff",
      line: "rgba(15,118,110,0.2)",
      hero: "linear-gradient(135deg, rgba(15,118,110,0.9), rgba(245,158,11,0.72))",
      shadowAlpha: 14,
      glassAlpha: 90,
      blur: 8,
      radius: 18
    },
    mono: {
      label: "黑白简约",
      accent: "#111827",
      warm: "#6b7280",
      bg: "#f6f6f4",
      ink: "#111827",
      muted: "#6b7280",
      panel: "rgba(255,255,255,0.9)",
      card: "#ffffff",
      line: "rgba(17,24,39,0.14)",
      hero: "linear-gradient(135deg, #111827, #4b5563)",
      shadowAlpha: 12,
      glassAlpha: 90,
      blur: 10,
      radius: 18
    }
  };
  const THEMES = THEME_PRESETS;
  const THEME_CHOICE_ENTRIES = Object.entries(THEMES).filter(([, theme]) => theme.preset !== false);
  const THEME_VAR_FIELDS = [
    ["accent", "主色", "color"],
    ["warm", "辅助色", "color"],
    ["bg", "背景色", "color"],
    ["ink", "正文色", "color"],
    ["muted", "弱文本", "color"],
    ["line", "线条", "text"],
    ["panel", "面板", "text"],
    ["card", "卡片", "text"],
    ["hero", "顶部渐变", "text"],
    ["shadowAlpha", "阴影强度", "range"],
    ["glassAlpha", "玻璃透明", "range"],
    ["blur", "模糊强度", "range"],
    ["radius", "圆角", "range"]
  ];
  const ICON_OPTIONS = [
    { id: "cartoon", label: "卡通版", src: "icons/icon-cartoon.png" },
    { id: "minimal", label: "极简版", src: "icons/icon-minimal.png" },
    { id: "transparent", label: "透明版", src: "icons/icon-transparent.png" }
  ];

  const els = {};
  let state = defaultState();
  let appCache = emptyCache();
  let pendingImport = null;
  let persistTimer = 0;
  let floatingLayer = FLOATING_LAYER_BASE;
  let renderAllFrame = 0;
  let autoLockFrame = 0;
  let modalPhaseTimer = 0;
  let userScrollTimer = 0;
  let scrollStateLastAt = 0;
  let renderBusyTimer = 0;
  let lastCommandAction = "";
  let lastCommandAt = 0;
  let lastPortalOpenAt = 0;
  let overviewPageMotion = null;
  let floatingLayerGuardActive = false;
  let swipeGesture = null;
  let lastSwipeSuppressAt = 0;
  let timePickerInput = null;
  let timePickerHour = 8;
  let timePickerMinute = 0;
  let datePickerInput = null;
  let datePickerYear = Number(todayString().slice(0, 4));
  let datePickerMonth = Number(todayString().slice(5, 7));
  let datePickerDay = Number(todayString().slice(8, 10));
  let optionPickerSource = null;
  let optionPickerBinding = null;
  const pickerInputBindings = {};
  const htmlCache = new WeakMap();
  const dayItemsCache = new Map();
  let nativeReminderSyncTimer = 0;
  let nativeReminderSyncGeneration = 0;
  let lastNativeReminderSignature = "";
  let lastKnownToday = todayString();

  function registerArchitectureRuntime(stage = "runtime") {
    if (!window.YayaLayers?.registerRuntime) return;
    const ui = resolveUiAssembly();
    const noteCount = Object.values(state.notes || {}).reduce((total, list) => total + (Array.isArray(list) ? list.length : 0), 0);
    const courseCount = appCache.courseCount || state.terms.reduce((total, term) => total + (Array.isArray(term.courses) ? term.courses.length : 0), 0);
    window.YayaLayers.registerRuntime("source", {
      stage,
      importers: ["教务", "文件", "备份"],
      sourceName: state.sourceName || "未导入",
      pendingImport: Boolean(pendingImport),
      termDetection: "scored-candidates"
    });
    window.YayaLayers.registerRuntime("domain", {
      terms: state.terms.length,
      activeTermId: activeTerm()?.id || "",
      currentTermId: currentCourseTerm()?.id || "",
      currentWeek: weekForDate(state.focusDate),
      focusDate: state.focusDate,
      courses: courseCount,
      customSchedules: state.customSchedules.length,
      recurringSchedules: state.recurringSchedules.length,
      exams: state.examSchedules.length,
      specialChanges: state.specialChanges.length,
      ddls: state.ddls.length,
      completedDdls: state.completedDdls.length,
      ddlView: state.ddlView === "completed" ? "completed" : "active",
      specialOverviewPage: normalizeSpecialOverviewPage(state.specialOverviewPage),
      notes: noteCount
    });
    window.YayaLayers.registerRuntime("cache", {
      builtAt: appCache.builtAt || 0,
      dayItemsCache: dayItemsCache.size,
      localStorage: STORAGE_KEY,
      nativeReminderPayload: nativeReminderPayload().length,
      serviceWorker: "serviceWorker" in navigator
    });
    window.YayaLayers.registerRuntime("commands", {
      delegated: true,
      actions: Object.keys(TEMPLATE_ACTIONS).length,
      customThemeAction: true,
      reminderPermissionAction: true,
      specialCancelAction: true,
      lastAction: lastCommandAction,
      lastActionAt: lastCommandAt || 0
    });
    window.YayaLayers.registerRuntime("components", {
      order: ui.order,
      visible: Object.entries(ui.visibility || {}).filter(([, visible]) => visible !== false).map(([key]) => key),
      inputUi: ui.inputUi?.variant || ui.interaction?.inputUi?.variant || DEFAULT_INPUT_UI.variant,
      inputUiThemeSync: ui.inputUi?.themeSync !== false,
      autoLockCurrentWeek: true,
      autoLockCurrentTerm: true,
      termImportSelector: true,
      ddlView: state.ddlView === "completed" ? "completed" : "active",
      specialOverviewPage: normalizeSpecialOverviewPage(state.specialOverviewPage),
      rendered: {
        status: Boolean(els.statusBar),
        ddl: Boolean(els.ddlStrip),
        day: Boolean(els.dayPanel),
        overview: Boolean(els.dashboardGrid)
      }
    });
    window.YayaLayers.registerRuntime("interaction", {
      mode: ui.interaction?.mode || "",
      modalLayout: ui.interaction?.modalLayout || "",
      density: ui.interaction?.density || "",
      modal: state.modal || "",
      layerLock: "full-stack",
      formDraftCache: Boolean(state.modalData?.__draftForm),
      ddlView: state.ddlView === "completed" ? "completed" : "active",
      pickerLayer: Boolean(timePickerInput || datePickerInput || optionPickerSource),
      builtInInputUi: true,
      reminderPermissionPanel: true,
      reminderPermissionBridge: Boolean(window.YayaPlatform?.getReminderPermissionStatus),
      inputUi: ui.inputUi?.variant || ui.interaction?.inputUi?.variant || DEFAULT_INPUT_UI.variant,
      inputPopup: ui.inputUi?.popup || ui.interaction?.inputUi?.popup || DEFAULT_INPUT_UI.popup,
      builtInInputPatch: INPUT_UI_PATCH_VERSION,
      optionPickerLayer: Boolean(optionPickerSource),
      portalTermOverlay: true,
      locked: document.body?.classList?.contains("is-interaction-locked") || false
    });
    window.YayaLayers.registerRuntime("theme", {
      theme: normalizeThemeId(state.theme),
      icon: normalizeIconId(state.appIcon),
      glass: true,
      presetChoices: THEME_CHOICE_ENTRIES.length,
      customThemePanel: true,
      customVars: Object.keys(state.themeVars || {}).length
    });
    window.YayaLayers.registerRuntime("template", {
      activeTemplate: ui.id,
      order: ui.order,
      actions: (ui.actions || []).map((item) => item.action),
      inputUi: ui.inputUi?.variant || ui.interaction?.inputUi?.variant || DEFAULT_INPUT_UI.variant,
      inputUiThemeSync: ui.inputUi?.themeSync !== false
    });
    window.YayaLayers.registerRuntime("platform", {
      native: Boolean(window.YayaPlatform?.isNative?.()),
      capabilities: window.YayaPlatform?.capabilities || [],
      portalUiBridge: Boolean(window.YayaPlatform?.configurePortalUi),
      widgetThemeSync: true
    });
    const closure = window.YayaLayers.validateClosure?.();
    const moduleState = window.YayaLayers.validateModules?.();
    window.YayaLayers.registerRuntime("boot", {
      stage,
      ready: stage !== "init-start",
      closureOk: Boolean(closure?.ok || (closure && !closure.runtimeMissing?.length && !closure.missing?.length && !closure.dependencyBreaks?.length && !closure.handoffBreaks?.length && !closure.moduleMissing?.length && !closure.moduleOrderBreaks?.length)),
      moduleLoadOk: Boolean(moduleState?.ok),
      loadedModules: moduleState?.loaded || []
    });
  }

  function defaultState() {
    return {
      version: CURRENT_SCHEMA_VERSION,
      terms: [],
      activeTermId: "",
      termStart: DEFAULT_TERM_START,
      sourceName: "未导入",
      focusDate: todayString(),
      customSchedules: [],
      recurringSchedules: [],
      examSchedules: [],
      specialChanges: [],
      ddls: [],
      completedDdls: [],
      notes: {},
      dateLookupMode: "date",
      ddlView: "active",
      courseOverviewPage: "",
      scheduleOverviewPage: "custom",
      specialOverviewPage: "move",
      uiTemplate: "classicOriginal",
      theme: "coolGlass",
      themeAccent: "",
      themeVars: {},
      appIcon: "cartoon",
      accountUsername: "",
      ddlDoneFilterQuery: "",
      ddlDoneFilterStart: "",
      ddlDoneFilterStartTime: "",
      ddlDoneFilterEnd: "",
      ddlDoneFilterEndTime: "",
      notice: "",
      modal: "",
      modalData: {},
      modalLayer: 0
    };
  }

  function emptyCache() {
    return {
      signature: "",
      builtAt: 0,
      maxWeek: 1,
      courseCount: 0,
      courseByKey: {},
      recurringById: {},
      customById: {},
      courseEventsByDate: {},
      recurringByDate: {},
      customByDate: {},
      examsByDate: {},
      specialByTarget: {},
      ddlByTarget: {},
      activeDdls: [],
      completedDdls: []
    };
  }

  function init() {
    window.YayaInputUiPatchVersion = INPUT_UI_PATCH_VERSION;
    window.YayaLayers?.registerModule?.("app", {
      layer: "boot",
      dependsOn: ["app-layers", "platform-bridge", "ui-modules", "theme-modules"],
      provides: ["runtime", "render", "commands", "cache", "templateApply", "themeApply"],
      handoffTo: ["boot"]
    });
    window.YayaLayers?.registerRuntime?.("boot", { startedAt: new Date().toISOString() });
    bindElements();
    restore();
    rebuildCacheIfNeeded();
    applyTheme();
    attachEvents();
    registerArchitectureRuntime("init-start");
    renderAll();
    maybeShowFirstOpenGuide();
    syncNativeNotifications({ requestPermission: false, force: true, retry: false, reason: "init" });
    updateNativeWidget();
    scheduleNativeImportPull();
    window.addEventListener("yaya-native-import-ready", scheduleNativeImportPull);
    window.addEventListener("yaya-reminder-permission-updated", handleReminderPermissionUpdated);
    window.addEventListener("pagehide", flushPersist);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        refreshDateIfNeeded();
        scheduleNativeImportPull();
        syncNativeNotifications({ requestPermission: false, retry: false, reason: "visible" });
        if (state.modal) renderModal();
      } else {
        flushPersist();
      }
    });
    window.setInterval(refreshDateIfNeeded, 10 * 60 * 1000);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
    registerArchitectureRuntime("init-ready");
  }

  function bindElements() {
    [
      "todayMeta",
      "todayButton",
      "portalButton",
      "settingsButton",
      "statusBar",
      "ddlStrip",
      "dayPanel",
      "courseOverview",
      "scheduleOverview",
      "specialOverview",
      "fileInput",
      "modalRoot"
    ].forEach((id) => {
      els[id] = document.getElementById(id);
    });
    els.appShell = document.querySelector(".app-shell");
    els.topbar = document.querySelector(".topbar");
    els.dashboardGrid = document.querySelector(".dashboard-grid");
    els.templateDock = document.getElementById("templateActionDock");
    if (!els.templateDock && els.appShell && els.topbar) {
      els.templateDock = document.createElement("section");
      els.templateDock.id = "templateActionDock";
      els.templateDock.className = "template-action-dock";
      els.topbar.insertAdjacentElement("afterend", els.templateDock);
    }
  }

  function restore() {
    const stored = readJson(STORAGE_KEY);
    const old = stored ? null : readJson(OLD_STORAGE_KEY);
    const next = stored ? normalizeStoredState(stored) : migrateOldState(old);
    const storedVersion = Number(next.version || 0);
    state = { ...defaultState(), ...next };
    if (storedVersion < CURRENT_SCHEMA_VERSION) {
      if (!next.uiTemplate || state.uiTemplate === "glassFlow") state.uiTemplate = "classicOriginal";
      if (!next.theme || state.theme === "customMono") state.theme = "coolGlass";
      state.version = CURRENT_SCHEMA_VERSION;
    }
    state.accountUsername = localStorage.getItem(ACCOUNT_USERNAME_KEY) || state.accountUsername || "";
    state.uiTemplate = normalizeTemplateId(state.uiTemplate);
    delete state.moduleOrder;
    delete state.moduleVisibility;
    state.theme = normalizeThemeId(state.theme);
    if (state.theme === "classicCustom" && !Object.keys(state.themeVars || {}).length) state.theme = "coolGlass";
    state.themeVars = state.theme === "classicCustom" ? sanitizeThemeVars(state.themeVars) : {};
    state.appIcon = normalizeIconId(state.appIcon);
    state.dateLookupMode = state.dateLookupMode === "week" ? "week" : "date";
    state.ddlView = state.ddlView === "completed" ? "completed" : "active";
    state.scheduleOverviewPage = normalizeScheduleOverviewPage(state.scheduleOverviewPage);
    state.specialOverviewPage = normalizeSpecialOverviewPage(state.specialOverviewPage);
    state.courseOverviewPage = String(state.courseOverviewPage || "");
    state.ddlDoneFilterQuery = normalizeText(state.ddlDoneFilterQuery);
    state.ddlDoneFilterStart = validDateInputValue(state.ddlDoneFilterStart);
    state.ddlDoneFilterStartTime = validTimeInputValue(state.ddlDoneFilterStartTime);
    state.ddlDoneFilterEnd = validDateInputValue(state.ddlDoneFilterEnd);
    state.ddlDoneFilterEndTime = validTimeInputValue(state.ddlDoneFilterEndTime);
    state.terms = state.terms.map(hydrateTerm).filter(Boolean);
    if (!state.activeTermId && state.terms[0]) state.activeTermId = state.terms[0].id;
    const restoredFocusDate = state.focusDate;
    if (!validDate(state.focusDate)) state.focusDate = todayString();
    const currentDateChanged = syncFocusToToday("startup");
    if (currentDateChanged || restoredFocusDate !== state.focusDate) persist({ immediate: true });
    state.courseOverviewPage = normalizeCourseOverviewPage(state.courseOverviewPage);
    window.YayaLayers?.registerRuntime?.("cache", {
      restored: true,
      terms: state.terms.length,
      ddls: state.ddls.length,
      focusDate: state.focusDate,
      startupDateFocus: true
    });
  }

  function normalizeStoredState(raw) {
    if (!raw || typeof raw !== "object") return {};
    const migrated = splitStoredNotesAndSpecials(raw);
    return {
      ...raw,
      terms: Array.isArray(raw.terms) ? raw.terms : [],
      customSchedules: Array.isArray(raw.customSchedules) ? raw.customSchedules.map(normalizeCustomSchedule) : [],
      recurringSchedules: Array.isArray(raw.recurringSchedules) ? raw.recurringSchedules.map(normalizeRecurringSchedule) : [],
      examSchedules: Array.isArray(raw.examSchedules) ? raw.examSchedules.map(normalizeExamSchedule).filter(Boolean) : [],
      specialChanges: migrated.specialChanges,
      ddls: Array.isArray(raw.ddls) ? raw.ddls.map(normalizeDdl).filter(Boolean) : [],
      completedDdls: Array.isArray(raw.completedDdls) ? raw.completedDdls.map(normalizeCompletedDdl).filter(Boolean) : [],
      notes: migrated.notes
    };
  }

  function splitStoredNotesAndSpecials(raw) {
    const notes = normalizeNotes(raw.notes || raw.courseNotes);
    const specialChanges = [];
    const source = Array.isArray(raw.specialChanges) ? raw.specialChanges : [];
    for (const item of source) {
      const action = String(item?.action || "").trim();
      if (action === "note" || action === "remark") {
        const noteKey = noteKeyForTarget(item.targetKey);
        const text = normalizeText(item.note || item.text || item.content || item.remark);
        if (!noteKey || !text) continue;
        if (!notes[noteKey]) notes[noteKey] = [];
        notes[noteKey].push({
          id: String(item.noteId || item.id || newId("note")),
          text,
          createdAt: item.createdAt || item.updatedAt || ""
        });
        continue;
      }
      const normalized = normalizeSpecialChange(item);
      if (normalized) specialChanges.push(normalized);
    }
    return { notes, specialChanges };
  }

  function migrateOldState(old) {
    if (!old || typeof old !== "object") return {};
    const termStart = old.termStart || DEFAULT_TERM_START;
    const terms = Array.isArray(old.terms) && old.terms.length
      ? old.terms
      : Array.isArray(old.rows) && old.rows.length
        ? [buildTermFromRows(old.rows, old.sourceName || "课表", termStart, {
          label: old.termLabel || old.sourceName || "课表",
          startDate: termStart,
          detected: false
        })]
        : [];
    return normalizeStoredState({
      version: CURRENT_SCHEMA_VERSION,
      terms,
      activeTermId: old.activeTermId || "",
      termStart,
      sourceName: old.sourceName || "未导入",
      focusDate: old.focusDate || todayString(),
      customSchedules: old.customSchedules || [],
      recurringSchedules: old.recurringSchedules || [],
      examSchedules: old.examSchedules || [],
      specialChanges: old.specialChanges || [],
      ddls: old.ddls || [],
      completedDdls: old.completedDdls || [],
      notes: old.courseNotes || {},
      uiTemplate: "classicOriginal",
      theme: "coolGlass",
      themeVars: {},
      appIcon: old.appIcon || "cartoon"
    });
  }

  function persist(options = {}) {
    const payload = JSON.stringify(serializableState());
    if (persistTimer) window.clearTimeout(persistTimer);
    if (options.immediate) {
      localStorage.setItem(STORAGE_KEY, payload);
      return;
    }
    persistTimer = window.setTimeout(() => {
      persistTimer = 0;
      localStorage.setItem(STORAGE_KEY, payload);
    }, 120);
  }

  function flushPersist() {
    if (!persistTimer) return;
    window.clearTimeout(persistTimer);
    persistTimer = 0;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializableState()));
  }

  function serializableState() {
    return {
      version: CURRENT_SCHEMA_VERSION,
      terms: state.terms.map((term) => ({
        id: term.id,
        label: term.label,
        kind: term.kind || "",
        termStart: term.termStart,
        sourceName: term.sourceName,
        rows: term.rows || []
      })),
      activeTermId: state.activeTermId,
      termStart: state.termStart,
      sourceName: state.sourceName,
      focusDate: state.focusDate,
      customSchedules: state.customSchedules,
      recurringSchedules: state.recurringSchedules,
      examSchedules: state.examSchedules,
      specialChanges: state.specialChanges,
      ddls: state.ddls,
      completedDdls: state.completedDdls,
      notes: state.notes,
      dateLookupMode: state.dateLookupMode,
      ddlView: state.ddlView,
      courseOverviewPage: state.courseOverviewPage,
      scheduleOverviewPage: state.scheduleOverviewPage,
      specialOverviewPage: state.specialOverviewPage,
      uiTemplate: state.uiTemplate,
      theme: state.theme,
      themeAccent: state.themeAccent,
      themeVars: state.themeVars,
      appIcon: state.appIcon,
      accountUsername: state.accountUsername,
      ddlDoneFilterQuery: state.ddlDoneFilterQuery,
      ddlDoneFilterStart: state.ddlDoneFilterStart,
      ddlDoneFilterStartTime: state.ddlDoneFilterStartTime,
      ddlDoneFilterEnd: state.ddlDoneFilterEnd,
      ddlDoneFilterEndTime: state.ddlDoneFilterEndTime
    };
  }

  function commit(message, options = {}) {
    if (message) state.notice = message;
    if (!options.skipCache) rebuildCache(true);
    persist(options);
    if (!options.skipNative) {
      syncNativeNotifications({ reason: "commit", force: true });
      updateNativeWidget();
    }
    registerArchitectureRuntime("commit");
    scheduleRenderAll({ force: options.forceRender === true || !options.skipCache });
  }

  function dataSignature() {
    return JSON.stringify({
      terms: state.terms.map((term) => [term.id, term.termStart, term.label, term.rows || []]),
      custom: state.customSchedules,
      recurring: state.recurringSchedules,
      exams: state.examSchedules,
      special: state.specialChanges,
      ddls: state.ddls,
      done: state.completedDdls,
      notes: state.notes
    });
  }

  function rebuildCacheIfNeeded() {
    const signature = dataSignature();
    const cached = readJson(CACHE_KEY);
    if (cached && cached.signature === signature) {
      appCache = { ...emptyCache(), ...cached };
      return;
    }
    rebuildCache(true);
  }

  function rebuildCache(save = false) {
    const signature = dataSignature();
    const cache = emptyCache();
    cache.signature = signature;
    cache.builtAt = Date.now();
    dayItemsCache.clear();

    for (const term of state.terms) {
      for (const course of term.courses || []) {
        cache.courseByKey[course.courseKey] = course;
        cache.courseCount += 1;
      }
      for (const event of term.events || []) {
        cache.maxWeek = Math.max(cache.maxWeek, event.week || 1);
        pushDateItem(cache.courseEventsByDate, event.date, event);
      }
    }

    for (const item of state.customSchedules) {
      cache.customById[item.id] = item;
      pushDateItem(cache.customByDate, item.date, customToDisplay(item));
    }

    for (const item of state.recurringSchedules) {
      cache.recurringById[item.id] = item;
      for (const occurrence of expandRecurring(item)) {
        pushDateItem(cache.recurringByDate, occurrence.date, occurrence);
      }
    }

    for (const exam of state.examSchedules) {
      pushDateItem(cache.examsByDate, exam.date, examToDisplay(exam));
    }

    for (const change of state.specialChanges) {
      if (!change.targetKey) continue;
      if (!cache.specialByTarget[change.targetKey]) cache.specialByTarget[change.targetKey] = [];
      cache.specialByTarget[change.targetKey].push(change);
    }

    cache.activeDdls = activeDdlList();
    cache.completedDdls = completedDdlList();
    for (const ddl of [...cache.activeDdls, ...cache.completedDdls]) {
      if (!ddl.targetKey) continue;
      if (!cache.ddlByTarget[ddl.targetKey]) cache.ddlByTarget[ddl.targetKey] = [];
      cache.ddlByTarget[ddl.targetKey].push(ddl);
    }

    appCache = cache;
    window.YayaLayers?.registerRuntime?.("cache", {
      builtAt: cache.builtAt,
      courseCount: cache.courseCount,
      activeDdls: cache.activeDdls.length
    });
    if (save) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      } catch (error) {
        localStorage.removeItem(CACHE_KEY);
      }
    }
  }

  function renderAll() {
    if (renderAllFrame) {
      window.cancelAnimationFrame(renderAllFrame);
      renderAllFrame = 0;
    }
    const ui = applyTemplate();
    const visibility = ui?.visibility || DEFAULT_MODULE_VISIBILITY;
    applyTheme();
    renderTemplateDock();
    if (visibility.status !== false) {
      renderStatus();
    } else {
      clearCachedHtml(els.statusBar);
    }
    if (visibility.ddl !== false) {
      renderDdlStrip();
    } else {
      clearCachedHtml(els.ddlStrip);
    }
    if (visibility.day !== false) {
      renderDayPanel();
    } else {
      clearCachedHtml(els.dayPanel);
    }
    if (visibility.overview !== false) {
      renderOverviews();
    } else {
      clearCachedHtml(els.courseOverview);
      clearCachedHtml(els.scheduleOverview);
      clearCachedHtml(els.specialOverview);
    }
    renderModal();
    registerArchitectureRuntime("render");
    scheduleAutoLockUi();
    document.body.classList.remove("is-rendering");
  }

  function scheduleRenderAll(options = {}) {
    const force = options.force === true || options.forceRender === true;
    if (!force && hasActiveFloatingLayer()) return;
    if (!force && isUserScrollingActive()) {
      window.clearTimeout(userScrollTimer);
      userScrollTimer = window.setTimeout(() => scheduleRenderAll({ force: true }), 180);
      return;
    }
    if (renderAllFrame) window.cancelAnimationFrame(renderAllFrame);
    document.body.classList.add("is-rendering");
    renderAllFrame = window.requestAnimationFrame(() => {
      renderAllFrame = 0;
      renderAll();
    });
  }

  function isUserScrollingActive() {
    return scrollStateLastAt > 0 && Date.now() - scrollStateLastAt < 180;
  }

  function markUserScrolling(event) {
    if (hasActiveFloatingLayer()) return;
    if (state.modal && event.target?.closest?.(".modal-card")) return;
    if (event.target?.closest?.(".picker-backdrop,.picker-card")) return;
    scrollStateLastAt = Date.now();
    document.body.classList.add("is-user-scrolling");
    window.clearTimeout(userScrollTimer);
    userScrollTimer = window.setTimeout(() => {
      document.body.classList.remove("is-user-scrolling");
      scheduleRenderAll({ force: true });
    }, 220);
  }

  function activateRenderBusy(duration = 520) {
    document.body.classList.add("is-render-busy");
    window.clearTimeout(renderBusyTimer);
    renderBusyTimer = window.setTimeout(() => {
      document.body.classList.remove("is-render-busy");
      renderBusyTimer = 0;
    }, duration);
  }

  function scheduleAutoLockUi() {
    if (autoLockFrame) window.cancelAnimationFrame(autoLockFrame);
    autoLockFrame = window.requestAnimationFrame(() => {
      autoLockFrame = 0;
      lockDateLookupToCurrentWeek();
      lockCourseOverviewToCurrentTerm();
    });
  }

  function lockDateLookupToCurrentWeek() {
    document.querySelectorAll(".date-week-rail").forEach((rail) => {
      keepActiveChipVisible(rail, ".date-week-chip.active");
    });
    document.querySelectorAll(".date-day-rail").forEach((rail) => {
      keepActiveChipVisible(rail, ".date-day-chip.active");
    });
    document.querySelectorAll(".recurring-week-rail").forEach((rail) => {
      keepActiveChipVisible(rail, ".recurring-week-chip.active");
    });
  }

  function lockCourseOverviewToCurrentTerm() {
    document.querySelectorAll(".course-term-tab[data-current-term-chip='true']").forEach((chip) => {
      const rail = chip.closest(".modal-page-chips");
      keepActiveChipVisible(rail, ".course-term-tab[data-current-term-chip='true']");
    });
  }

  function keepActiveChipVisible(rail, selector) {
    const chip = rail?.querySelector?.(selector);
    if (!rail || !chip) return;
    const railRect = rail.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    const padding = 10;
    let delta = 0;
    if (chipRect.left < railRect.left + padding) {
      delta = chipRect.left - railRect.left - padding;
    } else if (chipRect.right > railRect.right - padding) {
      delta = chipRect.right - railRect.right + padding;
    }
    if (delta) rail.scrollBy({ left: delta, behavior: "auto" });
  }

  function renderStatus() {
    setText(els.todayMeta, `${dateLabel(todayString())} · 本地缓存 ${appCache.builtAt ? "已就绪" : "未建立"}`);
    const source = state.sourceName || activeTerm()?.label || "未导入";
    const week = weekForDate(state.focusDate);
    const message = state.notice || `${source} · 第 ${week} 周 · ${state.terms.length} 个学期`;
    setCachedHtml(els.statusBar, `
      <span>${escapeHtml(message)}</span>
      <button type="button" data-action="clear-notice" ${state.notice ? "" : "hidden"}>清除</button>
    `, `status:${message}:${state.notice ? 1 : 0}`);
  }

  function renderTemplateDock() {
    if (!els.templateDock) return;
    const ui = resolveUiAssembly();
    const actions = templateDockActions(ui);
    els.templateDock.hidden = ui.id !== "classicOriginal" && actions.length === 0;
    const lookup = ui.id === "classicOriginal" ? renderDateLookupTools() : "";
    setCachedHtml(els.templateDock, `
      <div class="template-action-buttons">
        ${actions.map((item) => `
      <button type="button" data-action="${escapeAttr(item.action)}">${escapeHtml(item.label)}</button>
        `).join("")}
      </div>
      ${lookup}
    `, `dock:${ui.id}:${actions.map((item) => item.action).join(",")}:${ui.id === "classicOriginal" ? `${state.focusDate}:${state.termStart}:${state.dateLookupMode}` : ""}`);
  }

  function templateDockActions(ui) {
    if (ui?.id !== "classicOriginal") return ui?.actions || [];
    const today = TEMPLATE_ACTIONS.today || { label: "今日", action: "jump-today" };
    const settings = TEMPLATE_ACTIONS.settings || { label: "设置", action: "open-settings" };
    return [today, settings];
  }

  function renderDdlStrip() {
    const active = appCache.activeDdls.slice(0, 4);
    const cards = active.length
      ? active.map((ddl) => `
        <button class="ddl-mini" type="button" data-action="open-ddl" data-ddl-id="${escapeAttr(ddl.id)}">
          <strong>${escapeHtml(ddl.topic)}</strong>
          <span>${escapeHtml(formatDdlTime(ddl))}</span>
        </button>
      `).join("")
      : `<button class="ddl-mini empty" type="button" data-action="open-ddl">暂无 DDL</button>`;
    setCachedHtml(els.ddlStrip, `
      <div class="strip-head">
        <strong>最近 DDL</strong>
        <div>
          <button type="button" data-action="new-ddl">新建</button>
          <button type="button" data-action="open-ddl">全部</button>
        </div>
      </div>
      <div class="ddl-mini-row">${cards}</div>
    `, `ddl-strip:${appCache.builtAt}:${active.map((ddl) => ddl.id + ddl.date + ddl.time).join("|")}`);
  }

  function renderDayPanel() {
    const info = dateInfo(state.focusDate);
    const items = dayItems(state.focusDate);
    const nearestDdl = appCache.activeDdls[0];
    const ddlLabel = nearestDdl ? nearestDdl.topic : "暂无DDL";
    const itemCount = items.length;
    const itemHtml = items.length
      ? items.map(renderDayItem).join("")
      : `<div class="empty-state">当日无安排</div>`;
    const lookupHtml = normalizeTemplateId(state.uiTemplate) === "classicOriginal" ? "" : renderDateLookupTools();
    setCachedHtml(els.dayPanel, `
      <div class="date-switcher">
        <button type="button" class="nav-button" data-action="shift-date" data-delta="-1" aria-label="前一天">‹</button>
        <div class="date-center">
          <div class="classic-day-title">
            <strong>鸦鸦日程</strong>
            <span>${escapeHtml(shortDateLabel(state.focusDate))} · ${itemCount}项<br>第 ${weekForDate(state.focusDate)} 周 · 周${escapeHtml(info.day)}</span>
            <button type="button" class="classic-ddl-pill" data-action="open-ddl" ${nearestDdl ? `data-ddl-id="${escapeAttr(nearestDdl.id)}"` : ""}>${escapeHtml(ddlLabel)}</button>
          </div>
          <label class="date-picker">
            <span>${escapeHtml(info.label)} · 周${escapeHtml(info.day)} · 第 ${weekForDate(state.focusDate)} 周</span>
            <input id="focusDateInput" class="date-input" type="text" inputmode="none" readonly data-date-input value="${escapeAttr(state.focusDate)}" aria-label="当前日期" />
          </label>
        </div>
        <button type="button" class="nav-button" data-action="shift-date" data-delta="1" aria-label="后一天">›</button>
      </div>
      <div class="day-list">${itemHtml}</div>
      <div class="day-actions">
        <button type="button" data-action="new-schedule">添加日程</button>
        <button type="button" data-action="new-recurring">添加常驻</button>
        <button type="button" data-action="new-special">特殊变更</button>
      </div>
      ${lookupHtml}
    `, `day:${state.focusDate}:${dayItemsRenderSignature(items)}:${state.notice}:${state.dateLookupMode}`);
  }

  function dayItemsRenderSignature(items) {
    return items.map((item) => [
      item.type,
      item.kind,
      item.detailType,
      item.detailId || item.id || "",
      item.targetKey || "",
      item.title || item.name || "",
      item.timeText || "",
      item.typeLabel || "",
      item.meta || item.place || "",
      item.noteKey ? noteBadge(item.noteKey) : "",
      item.action || "",
      item.sourceDate || "",
      item.date || "",
      item.startTime || "",
      item.endTime || ""
    ].map((value) => String(value).replace(/[|\\]/g, "\\$&")).join("\\")).join("|");
  }

  function renderDayItem(item) {
    const badges = [
      item.typeLabel,
      targetDdlBadge(item.targetKey),
      noteBadge(item.noteKey)
    ].filter(Boolean).map((value) => `<span>${escapeHtml(value)}</span>`).join("");
    return `
      <article class="day-item ${escapeAttr(item.kind || item.type)}" data-action="open-detail" data-detail-type="${escapeAttr(item.detailType || item.type)}" data-detail-id="${escapeAttr(item.detailId || item.id || item.targetKey || "")}">
        <time>${escapeHtml(item.timeText || "全天")}</time>
        <div>
          <div class="badges">${badges}</div>
          <h2>${escapeHtml(item.title || item.name || "未命名")}</h2>
          <p>${escapeHtml(item.meta || item.place || "")}</p>
        </div>
      </article>
    `;
  }

  function renderDateLookupTools() {
    const week = weekForDate(state.focusDate);
    const info = dateInfo(state.focusDate);
    const mode = state.dateLookupMode === "week" ? "week" : "date";
    const lookupTermStart = termStartForDate(state.focusDate);
    const weekChips = Array.from({ length: MAX_WEEK }, (_, index) => {
      const value = index + 1;
      const active = value === week;
      return `
        <button class="date-week-chip ${active ? "active" : ""}" type="button" data-action="set-date-week" data-week="${value}" data-current-week="${active ? "true" : "false"}" aria-pressed="${active ? "true" : "false"}">第${value}周</button>
      `;
    }).join("");
    const dayChips = DAYS.map((day, index) => {
      const value = dateForWeekDay(lookupTermStart, week, index);
      const active = index === info.dayIndex;
      return `
        <button type="button" class="date-day-chip ${active ? "active" : ""}" data-action="set-weekday" data-day-index="${index}" data-current-day="${active ? "true" : "false"}" aria-pressed="${active ? "true" : "false"}">
          周${escapeHtml(day)}<span>${escapeHtml(shortDateLabel(value))}</span>
        </button>
      `;
    }).join("");
    return `
      <section class="date-lookup" aria-label="日期查询">
        <div class="date-lookup-tabs" role="tablist" aria-label="查看日期方式">
          <button class="${mode === "date" ? "active" : ""}" type="button" data-action="set-date-lookup-mode" data-mode="date" role="tab" aria-selected="${mode === "date" ? "true" : "false"}">日期</button>
          <button class="${mode === "week" ? "active" : ""}" type="button" data-action="set-date-lookup-mode" data-mode="week" role="tab" aria-selected="${mode === "week" ? "true" : "false"}">周次</button>
        </div>
        <div class="date-lookup-page ${mode === "date" ? "active" : ""}">
          ${renderDateField("dateLookupDate", "查看日期", state.focusDate, { id: "dateLookupDate", ariaLabel: "日期查询" })}
        </div>
        <div class="date-lookup-page week-date-page ${mode === "week" ? "active" : ""}">
          <div class="date-week-rail" aria-label="选择周次">${weekChips}</div>
          <div class="date-day-rail" aria-label="选择星期">${dayChips}</div>
          <div class="date-lookup-result">第${week}周 · 周${escapeHtml(info.day)} · ${escapeHtml(info.label)}</div>
        </div>
      </section>
    `;
  }

  function shortDateLabel(date) {
    if (!validDate(date)) return "";
    const value = toDate(date);
    return `${value.getMonth() + 1}月${value.getDate()}日`;
  }

  function renderOverviews() {
    setCachedHtml(els.courseOverview, `
      <div class="panel-head">
        <h2>课程概览</h2>
        <button type="button" class="overview-count" data-action="open-courses">${appCache.courseCount}门</button>
      </div>
    `, `course-overview:${appCache.courseCount}`);
    const nonCourseCount = dayItems(state.focusDate).filter((item) => item.type !== "course").length;
    setCachedHtml(els.scheduleOverview, `
      <div class="panel-head">
        <h2>日程概览</h2>
        <div class="overview-actions">
          <button type="button" class="overview-count" data-action="open-schedules">${nonCourseCount}项</button>
          <button type="button" class="overview-add" data-action="new-recurring">新建</button>
        </div>
      </div>
    `, `schedule-overview:${state.customSchedules.length}:${state.recurringSchedules.length}:${state.focusDate}:${nonCourseCount}`);
    const specialCount = state.specialChanges.length;
    setCachedHtml(els.specialOverview, `
      <div class="panel-head special-panel-head">
        <h2>特殊变更</h2>
        <div class="special-overview-actions">
          <button type="button" class="overview-count special-change-count" data-action="open-specials">${specialCount}项</button>
          <button type="button" class="overview-add special-change-button" data-action="open-specials">管理</button>
        </div>
      </div>
    `, `special-overview:${specialCount}`);
  }

  function renderModal() {
    if (!state.modal) {
      window.clearTimeout(modalPhaseTimer);
      els.modalRoot.hidden = true;
      clearCachedHtml(els.modalRoot);
      els.modalRoot.removeAttribute("style");
      delete els.modalRoot.dataset.modalKind;
      delete els.modalRoot.dataset.modalPhase;
      syncInteractionLock();
      return;
    }
    const interaction = templateInteraction();
    const layer = state.modalLayer || nextFloatingLayer();
    const refreshingSameModal = !els.modalRoot.hidden && els.modalRoot.dataset.modalKind === state.modal;
    state.modalLayer = layer;
    els.modalRoot.hidden = false;
    els.modalRoot.dataset.interaction = interaction.mode;
    els.modalRoot.dataset.modalLayout = interaction.modalLayout;
    els.modalRoot.dataset.density = interaction.density;
    els.modalRoot.dataset.modalKind = state.modal;
    els.modalRoot.dataset.modalPhase = refreshingSameModal ? "refresh" : "open";
    els.modalRoot.style.zIndex = String(layer);
    const modalCacheKey = [
      "modal",
      state.modal,
      JSON.stringify(state.modalData || {}),
      appCache.builtAt,
      state.ddlView,
      state.courseOverviewPage,
      state.scheduleOverviewPage,
      state.specialOverviewPage,
      state.ddlDoneFilterQuery,
      state.ddlDoneFilterStart,
      state.ddlDoneFilterStartTime,
      state.ddlDoneFilterEnd,
      state.ddlDoneFilterEndTime,
      state.modal === "courses" ? currentCourseTerm()?.id || "" : "",
      reminderPermissionSignature(),
      normalizeThemeId(state.theme),
      JSON.stringify(state.themeVars || {}),
      normalizeIconId(state.appIcon)
    ].join(":");
    const changed = setCachedHtml(els.modalRoot, `
      <div class="modal-backdrop" data-action="close-modal"></div>
      <article class="modal-card ${escapeAttr(state.modal)}" data-floating-layer="${layer}" data-floating-top="true">
        ${modalContent(state.modal)}
      </article>
    `, modalCacheKey);
    if (overviewPageMotion) overviewPageMotion = null;
    const card = els.modalRoot.querySelector(".modal-card");
    if (card) {
      card.dataset.floatingLayer = String(layer);
      card.dataset.floatingTop = "true";
    }
    if (!refreshingSameModal && changed) {
      window.clearTimeout(modalPhaseTimer);
      modalPhaseTimer = window.setTimeout(() => {
        if (!els.modalRoot.hidden) els.modalRoot.dataset.modalPhase = "stable";
      }, 460);
    }
    syncInteractionLock();
    scheduleAutoLockUi();
  }

  function modalContent(name) {
    if (name === "settings") return renderSettingsModal();
    if (name === "account") return renderAccountModal();
    if (name === "theme") return renderThemeModal();
    if (name === "custom-theme") return renderCustomThemeModal();
    if (name === "icon") return renderIconModal();
    if (name === "guide") return renderGuideModal();
    if (name === "courses") return renderCoursesModal();
    if (name === "schedules") return renderSchedulesModal();
    if (name === "ddl") return renderDdlModal();
    if (name === "ddl-form") return renderDdlForm();
    if (name === "schedule-form") return renderScheduleForm();
    if (name === "recurring-form") return renderRecurringForm();
    if (name === "specials") return renderSpecialsModal();
    if (name === "special-form") return renderSpecialForm();
    if (name === "detail") return renderDetailModal();
    if (name === "note-view") return renderNoteViewModal();
    if (name === "note-form") return renderNoteEditModal();
    if (name === "term-import") return renderTermImportModal();
    return "";
  }

  function modalHead(title, back = "close-modal", actions = "", tabs = "") {
    return `
      <div class="modal-head ${tabs ? "has-modal-tabs" : ""}">
        <div class="modal-head-main">
          <div class="modal-title-row">
            <h2>${escapeHtml(title)}</h2>
            ${actions ? `<div class="modal-head-actions">${actions}</div>` : ""}
          </div>
          <button type="button" class="icon-button" data-action="${escapeAttr(back)}" aria-label="返回">←</button>
        </div>
        ${tabs ? `<div class="modal-page-chips" role="tablist">${tabs}</div>` : ""}
      </div>
    `;
  }

  function renderSettingsModal() {
    return `
      ${modalHead("设置")}
      ${renderReminderPermissionPanel("settings")}
      <div class="setting-grid">
        <button type="button" class="setting-action" data-action="open-account">账户</button>
        <button type="button" class="setting-action" data-action="open-portal">教务导入</button>
        <button type="button" class="setting-action" data-action="choose-file">文件导入</button>
        <button type="button" class="setting-action" data-action="open-theme">主题配色</button>
        <button type="button" class="setting-action" data-action="open-icon">图标</button>
        <button type="button" class="setting-action" data-action="open-guide">提示说明</button>
      </div>
    `;
  }

  function renderAccountModal() {
    return `
      ${modalHead("账户", "open-settings")}
      <form id="accountForm" class="form-stack">
        <label>
          <span>用户</span>
          <input name="username" type="text" autocomplete="username" value="${escapeAttr(state.accountUsername)}" placeholder="校园网账号" />
        </label>
        <label>
          <span>密码</span>
          <input name="password" type="password" autocomplete="current-password" placeholder="校园网密码" />
        </label>
        <p class="form-note">手机 App 内会把账号交给原生层保存，用于门户自动填充；网页预览不会保存密码。</p>
        <button type="submit" class="primary">保存账户</button>
      </form>
    `;
  }

  function renderThemeModal() {
    const activeTheme = normalizeThemeId(state.theme);
    const vars = resolvedThemeVars();
    const customActive = activeTheme === "classicCustom";
    return `
      ${modalHead("主题配色", "open-settings")}
      <div class="theme-panel-stack">
        <form id="themeForm" class="form-stack">
          ${renderThemeStaticPreview(vars, activeTheme)}
          <section class="modal-section">
            <h3>预设主题</h3>
            <div class="choice-grid">
              ${THEME_CHOICE_ENTRIES.map(([id, theme]) => `
                <label class="choice-card theme-choice-card" style="${themeChoiceStyle(id, theme)}">
                  <input type="radio" name="theme" value="${escapeAttr(id)}" ${!customActive && id === activeTheme ? "checked" : ""} />
                  <span></span>
                  <strong>${escapeHtml(theme.label)}</strong>
                </label>
              `).join("")}
            </div>
          </section>
          <p class="form-note">预设主题保存后一次性应用到页面；自定义主题在下方单独进入。</p>
          <button type="submit" class="primary">保存预设主题</button>
        </form>
        <section class="modal-section">
          <h3>自定义主题</h3>
          <button type="button" class="custom-theme-entry ${customActive ? "active" : ""}" data-action="open-custom-theme">
            <span class="custom-theme-entry-swatch" style="--swatch:${escapeAttr(vars.accent)}"></span>
            <strong>自定义主题</strong>
            <small>纯色基底 + 自选强调色</small>
            <b>${customActive ? "正在使用" : "打开"}</b>
          </button>
        </section>
      </div>
    `;
  }

  function renderCustomThemeModal() {
    const draft = customThemeDraftFromState();
    const rgb = hexToRgbObject(draft.accent);
    const vars = customThemeVarsFromDraft(draft);
    return `
      ${modalHead("自定义主题", "open-theme")}
      <form id="customThemeForm" class="form-stack custom-theme-form" data-custom-theme-editor style="--custom-accent:${escapeAttr(draft.accent)}">
        <section class="custom-theme-editor">
          <div class="custom-theme-editor-head">
            <strong>生成自定义主题</strong>
            <span data-custom-theme-base-label>${draft.base === "black" ? "黑色基底" : "白色基底"}</span>
          </div>
          <section class="custom-theme-section">
            <h3>基底</h3>
            <div class="custom-base-row" role="radiogroup" aria-label="主要基底">
              ${renderCustomBaseChoice("white", "白色基底", draft.base)}
              ${renderCustomBaseChoice("black", "黑色基底", draft.base)}
            </div>
          </section>
          <section class="custom-theme-section">
            <h3>RGB 调色盘</h3>
            <div class="custom-rgb-panel">
              ${renderCustomRgbRow("r", "R", "红色", rgb.r, "#ef4444")}
              ${renderCustomRgbRow("g", "G", "绿色", rgb.g, "#22c55e")}
              ${renderCustomRgbRow("b", "B", "蓝色", rgb.b, "#3b82f6")}
              ${renderCustomThemePreview(vars, draft)}
              <label class="custom-color-field custom-hex-field" style="--custom-accent:${escapeAttr(draft.accent)}">
                <span>色号</span>
                <input name="customHex" type="text" value="${escapeAttr(draft.accent.toUpperCase())}" maxlength="7" spellcheck="false" autocomplete="off" data-custom-theme-hex />
              </label>
              <div class="custom-color-field custom-color-swatch-field" aria-label="当前颜色预览">
                <span>预览</span>
                <i data-custom-theme-swatch style="--custom-accent:${escapeAttr(draft.accent)}"></i>
              </div>
            </div>
          </section>
          <section class="custom-theme-section">
            <h3>透明与玻璃</h3>
            <div class="custom-alpha-panel">
              <label class="custom-rgb-row custom-alpha-row">
                <span>α</span>
                <input name="customAlpha" type="range" min="20" max="100" value="${escapeAttr(draft.alpha)}" data-custom-theme-alpha />
                <output data-custom-alpha-output>${escapeHtml(String(draft.alpha))}%</output>
              </label>
              <label class="custom-glass-switch ${draft.glass ? "is-enabled" : ""}">
                <input name="customGlass" type="checkbox" value="1" ${draft.glass ? "checked" : ""} data-custom-theme-glass />
                <span>通透玻璃</span>
                <small>增强模糊、反光和层次</small>
              </label>
            </div>
          </section>
          <div class="custom-color-readout">
            <span>预览颜色</span>
            <strong data-custom-color-readout>${escapeHtml(customThemeReadout(draft))}</strong>
          </div>
        </section>
        <p class="form-note">自定义页只同步编辑器内的色值；保存后才写入本地并应用到页面。</p>
        <button type="submit" class="primary">保存自定义主题</button>
      </form>
    `;
  }

  function renderCustomBaseChoice(id, label, active) {
    return `
      <label class="custom-base-choice ${id === active ? "active" : ""}">
        <input type="radio" name="customBase" value="${escapeAttr(id)}" ${id === active ? "checked" : ""} data-custom-theme-base />
        <span>${escapeHtml(label)}</span>
      </label>
    `;
  }

  function renderCustomRgbRow(key, label, name, value, color) {
    return `
      <label class="custom-rgb-row" style="--channel-color:${escapeAttr(color)}">
        <span>${escapeHtml(label)}</span>
        <input name="customRgb${escapeAttr(label)}" type="range" min="0" max="255" value="${escapeAttr(value)}" data-custom-theme-rgb="${escapeAttr(key)}" aria-label="${escapeAttr(name)}通道" />
        <input class="custom-rgb-number" type="number" min="0" max="255" inputmode="numeric" value="${escapeAttr(value)}" data-custom-theme-rgb-manual="${escapeAttr(key)}" aria-label="输入${escapeAttr(name)}数值" />
      </label>
    `;
  }

  function renderCustomThemePreview(vars, draft) {
    return `
      <section class="ui-static-preview theme-preview custom-theme-static-preview" data-custom-theme-preview style="${themePreviewStyle(vars, "classicCustom")}">
        <div class="theme-preview-card">
          <span></span>
          <strong>${draft.base === "black" ? "黑色基底" : "白色基底"}</strong>
          <small>保存后应用到页面</small>
        </div>
      </section>
    `;
  }

  function currentPlatformKind(status) {
    const platform = String(status?.platform || "").toLowerCase();
    if (platform.includes("ios")) return "ios";
    if (platform.includes("android")) return "android";
    const ua = navigator.userAgent || "";
    if (/Android/i.test(ua)) return "android";
    if (/iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && Number(navigator.maxTouchPoints || 0) > 1) || window.YayaNative?.__iosBridgeReady) return "ios";
    return window.YayaPlatform?.isNative?.() ? "native" : "web";
  }

  function iconModalNote() {
    const platform = currentPlatformKind();
    if (platform === "android") return "图标独立于模板和主题；在 Android App 内保存后会切换桌面图标。";
    if (platform === "ios") return "图标独立于模板和主题；在 iOS App 内保存后会切换应用图标。";
    if (platform === "native") return "图标独立于模板和主题；在 App 内保存后会切换应用图标。";
    return "图标独立于模板和主题；预览中会保存选择，真机内会切换应用图标。";
  }
  function renderIconModal() {
    const active = normalizeIconId(state.appIcon);
    return `
      ${modalHead("图标", "open-settings")}
      <form id="iconForm" class="form-stack">
        <div class="icon-choice-grid">
          ${ICON_OPTIONS.map((icon) => `
            <label class="icon-choice-card">
              <input type="radio" name="appIcon" value="${escapeAttr(icon.id)}" ${icon.id === active ? "checked" : ""} />
              <img src="${escapeAttr(icon.src)}" alt="" />
              <strong>${escapeHtml(icon.label)}</strong>
            </label>
          `).join("")}
        </div>
        <p class="form-note">${escapeHtml(iconModalNote())}</p>
        <button type="submit" class="primary">保存图标</button>
      </form>
    `;
  }

  function renderThemeStaticPreview(vars, themeId = state.theme) {
    return `
      <section class="ui-static-preview theme-preview" style="${themePreviewStyle(vars, themeId)}">
        <div class="theme-preview-card">
          <span></span>
          <strong>静态预览</strong>
          <small>保存后应用到页面</small>
        </div>
      </section>
    `;
  }

  function themeChoiceStyle(id, vars) {
    const tokens = themePreviewTokens(vars, id);
    return [
      ["--swatch", tokens.bar],
      ["--swatch-shadow", tokens.accent],
      ["--choice-bg", tokens.panel],
      ["--choice-border", tokens.border]
    ].map(([key, value]) => `${key}:${escapeAttr(value)};`).join("");
  }

  function themePreviewStyle(vars, themeId = state.theme) {
    const tokens = themePreviewTokens(vars, themeId);
    return Object.entries(tokens)
      .map(([key, value]) => `--preview-${key}:${escapeAttr(value)};`)
      .join("");
  }

  function applyThemePreviewStyle(preview, vars, themeId = state.theme) {
    const tokens = themePreviewTokens(vars, themeId);
    Object.entries(tokens).forEach(([key, value]) => preview.style.setProperty(`--preview-${key}`, value));
  }

  function themePreviewTokens(vars = {}, themeId = state.theme) {
    const resolved = THEME_BRIDGE?.resolve?.(themeId, vars) || {};
    const accent = resolved["--tpl-brand"] || vars.accent || THEME_PRESETS.coolGlass.accent;
    const warm = vars.warm || resolved["--tpl-brand-deep"] || THEME_PRESETS.coolGlass.warm;
    return {
      accent,
      warm,
      bg: resolved["--tpl-bg"] || vars.bg || THEME_PRESETS.coolGlass.bg,
      panel: resolved["--tpl-surface"] || vars.panel || THEME_PRESETS.coolGlass.panel,
      card: resolved["--tpl-card"] || vars.card || vars.panel || THEME_PRESETS.coolGlass.card,
      ink: resolved["--tpl-ink"] || vars.ink || THEME_PRESETS.coolGlass.ink,
      muted: resolved["--tpl-muted"] || vars.muted || THEME_PRESETS.coolGlass.muted,
      bar: resolved["--tpl-primary-action"] || `linear-gradient(135deg, ${accent}, ${warm})`,
      border: resolved["--tpl-border"] || vars.line || THEME_PRESETS.coolGlass.line,
      shadow: resolved["--tpl-shadow"] || `0 18px 36px rgba(${hexToRgbList(accent) || "37, 99, 235"}, 0.12)`,
      radius: `${clamp(Number(vars.radius || THEME_PRESETS.coolGlass.radius), 10, 30)}px`
    };
  }

  function renderThemeVarField(key, label, type, value) {
    if (type === "range") {
      const max = key === "blur" ? 30 : key === "radius" ? 30 : 100;
      return `
        <label>
          <span>${escapeHtml(label)}</span>
          <input name="themeVar:${escapeAttr(key)}" type="range" min="0" max="${max}" value="${escapeAttr(value)}" />
        </label>
      `;
    }
    return `
      <label>
        <span>${escapeHtml(label)}</span>
        <input name="themeVar:${escapeAttr(key)}" type="${type}" value="${escapeAttr(value)}" />
      </label>
    `;
  }

  function customThemeDraftFromState() {
    const vars = resolvedThemeVars();
    return {
      base: customThemeBaseFromVars(vars),
      accent: normalizeColor(vars.accent, THEME_PRESETS.classicCustom.accent),
      alpha: clamp(Number(vars.glassAlpha), 20, 100),
      glass: Number(vars.blur) >= 16 || Number(vars.glassAlpha) < 86
    };
  }

  function customThemeBaseFromVars(vars) {
    const ink = String(vars.ink || "").toLowerCase();
    const bg = String(vars.bg || "").toLowerCase();
    if (ink === "#f8fafc" || ink === "#ffffff" || bg === "#0b1020" || bg === "#0d1117") return "black";
    return "white";
  }

  function customThemeDraftFromEditor(editor) {
    const form = editor?.matches?.("form") ? editor : editor?.closest?.("form");
    const data = form ? new FormData(form) : new FormData();
    const rgb = {
      r: clampColorChannel(data.get("customRgbR")),
      g: clampColorChannel(data.get("customRgbG")),
      b: clampColorChannel(data.get("customRgbB"))
    };
    const hexAccent = normalizeColor(data.get("customHex"), "");
    const colorAccent = normalizeColor(data.get("customColor"), "");
    return {
      base: data.get("customBase") === "black" ? "black" : "white",
      accent: hexAccent || colorAccent || rgbToHex(rgb),
      alpha: clamp(Number(data.get("customAlpha")), 20, 100),
      glass: data.get("customGlass") === "1"
    };
  }

  function customThemeVarsFromDraft(draft) {
    const base = draft?.base === "black" ? "black" : "white";
    const accent = normalizeColor(draft?.accent, THEME_PRESETS.classicCustom.accent);
    const alpha = clamp(Number(draft?.alpha), 20, 100);
    const glass = Boolean(draft?.glass);
    const panelAlpha = base === "black"
      ? (0.28 + alpha / 220).toFixed(2)
      : (0.34 + alpha / 190).toFixed(2);
    const cardAlpha = base === "black"
      ? (0.22 + alpha / 260).toFixed(2)
      : (0.38 + alpha / 210).toFixed(2);
    const accentAlpha = glass ? 0.72 : 0.88;
    return {
      accent,
      warm: base === "black" ? "#e5e7eb" : "#111827",
      bg: base === "black" ? "#0d1117" : "#f8fafc",
      ink: base === "black" ? "#f8fafc" : "#111827",
      muted: base === "black" ? "#cbd5e1" : "#64748b",
      panel: base === "black" ? `rgba(15,23,42,${panelAlpha})` : `rgba(255,255,255,${panelAlpha})`,
      card: base === "black" ? `rgba(15,23,42,${cardAlpha})` : `rgba(255,255,255,${cardAlpha})`,
      line: base === "black" ? "rgba(255,255,255,0.16)" : "rgba(15,23,42,0.12)",
      hero: base === "black"
        ? `linear-gradient(135deg, ${hexToRgba(accent, accentAlpha)}, rgba(15,23,42,0.72))`
        : `linear-gradient(135deg, ${hexToRgba(accent, accentAlpha)}, rgba(255,255,255,0.54))`,
      shadowAlpha: glass ? 18 : 10,
      glassAlpha: alpha,
      blur: glass ? 22 : 8,
      radius: 20
    };
  }

  function syncCustomThemeEditorInput(source, editor) {
    if (!source || !editor) return;
    const channel = source.dataset.customThemeRgb || source.dataset.customThemeRgbManual;
    if (channel) {
      const value = clampColorChannel(source.value);
      source.value = value;
      editor.querySelectorAll(`[data-custom-theme-rgb="${channel}"], [data-custom-theme-rgb-manual="${channel}"]`).forEach((node) => {
        if (node !== source) node.value = value;
      });
      syncCustomThemeAccentFields(editor, rgbToHex(currentRgbFromEditor(editor)), source);
    } else if (source.matches("[data-custom-theme-hex]")) {
      const accent = normalizeColor(source.value, "");
      if (accent) syncCustomThemeAccentFields(editor, accent, source);
    } else if (source.matches("[data-custom-theme-color]")) {
      syncCustomThemeAccentFields(editor, normalizeColor(source.value, THEME_PRESETS.classicCustom.accent), source);
    }

    if (source.matches("[data-custom-theme-alpha]")) {
      const alpha = clamp(Number(source.value), 20, 100);
      source.value = alpha;
      editor.querySelector("[data-custom-alpha-output]")?.replaceChildren(document.createTextNode(`${alpha}%`));
    }

    syncCustomThemeBaseState(editor);
    syncCustomThemeGlassState(editor);
    updateCustomThemeEditorPreview(editor);
  }

  function syncCustomThemeAccentFields(editor, accent, source) {
    const safeAccent = normalizeColor(accent, THEME_PRESETS.classicCustom.accent);
    const rgb = hexToRgbObject(safeAccent);
    editor.style.setProperty("--custom-accent", safeAccent);
    editor.querySelectorAll("[data-custom-theme-hex]").forEach((node) => {
      if (node !== source) node.value = safeAccent.toUpperCase();
    });
    editor.querySelectorAll("[data-custom-theme-color]").forEach((node) => {
      if (node !== source) node.value = safeAccent;
    });
    editor.querySelectorAll("[data-custom-theme-swatch]").forEach((node) => {
      node.style.setProperty("--custom-accent", safeAccent);
    });
    ["r", "g", "b"].forEach((key) => {
      editor.querySelectorAll(`[data-custom-theme-rgb="${key}"], [data-custom-theme-rgb-manual="${key}"]`).forEach((node) => {
        if (node !== source) node.value = rgb[key];
      });
    });
    editor.querySelectorAll(".custom-hex-field").forEach((node) => {
      node.style.setProperty("--custom-accent", safeAccent);
    });
  }

  function syncCustomThemeBaseState(editor) {
    const draft = customThemeDraftFromEditor(editor);
    editor.querySelector("[data-custom-theme-base-label]")?.replaceChildren(document.createTextNode(draft.base === "black" ? "黑色基底" : "白色基底"));
    editor.querySelectorAll(".custom-base-choice").forEach((node) => {
      const input = node.querySelector("input");
      node.classList.toggle("active", input?.checked);
    });
  }

  function syncCustomThemeGlassState(editor) {
    editor.querySelectorAll(".custom-glass-switch").forEach((node) => {
      const input = node.querySelector("input");
      node.classList.toggle("is-enabled", Boolean(input?.checked));
    });
  }

  function updateCustomThemeEditorPreview(editor) {
    const draft = customThemeDraftFromEditor(editor);
    const vars = customThemeVarsFromDraft(draft);
    const preview = editor.querySelector("[data-custom-theme-preview]");
    if (preview) {
      applyThemePreviewStyle(preview, vars, "classicCustom");
      preview.querySelector(".theme-preview-card strong")?.replaceChildren(document.createTextNode(draft.base === "black" ? "黑色基底" : "白色基底"));
    }
    editor.querySelector("[data-custom-color-readout]")?.replaceChildren(document.createTextNode(customThemeReadout(draft)));
  }

  function currentRgbFromEditor(editor) {
    return {
      r: clampColorChannel(editor.querySelector('[data-custom-theme-rgb="r"]')?.value),
      g: clampColorChannel(editor.querySelector('[data-custom-theme-rgb="g"]')?.value),
      b: clampColorChannel(editor.querySelector('[data-custom-theme-rgb="b"]')?.value)
    };
  }

  function customThemeReadout(draft) {
    const rgb = hexToRgbObject(draft.accent);
    return `${draft.accent.toUpperCase()} · RGB(${rgb.r}, ${rgb.g}, ${rgb.b}) · ${draft.alpha}%${draft.glass ? " · 玻璃感" : ""}`;
  }

  function hexToRgbObject(value) {
    const accent = normalizeColor(value, THEME_PRESETS.classicCustom.accent).slice(1);
    return {
      r: parseInt(accent.slice(0, 2), 16),
      g: parseInt(accent.slice(2, 4), 16),
      b: parseInt(accent.slice(4, 6), 16)
    };
  }

  function rgbToHex(rgb) {
    return `#${["r", "g", "b"].map((key) => clampColorChannel(rgb?.[key]).toString(16).padStart(2, "0")).join("")}`;
  }

  function clampColorChannel(value) {
    return Math.round(clamp(Number(value), 0, 255));
  }

  function hexToRgba(value, alpha) {
    const rgb = hexToRgbObject(value);
    return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
  }

  function renderGuideModal() {
    const firstOpen = state.modalData?.firstOpen === true;
    return `
      ${modalHead(firstOpen ? "提示" : "提示说明", firstOpen ? "close-modal" : "open-settings")}
      <div class="guide-list">
        <p>首次使用前请先确认基础提示；之后可以在设置中查看提示。</p>
        <p>首页读取本地缓存，只在保存、导入、切换日期时局部更新。</p>
        <p>教务导入需要进入信息门户的网页端。打开门户后，依次进入“办事大厅 - 教学管理 - 教务管理系统”。</p>
        <p>课表导入请在“网上选课 - 我的课表”界面先检索对应学期课表，再使用视窗内的“导入课表”；考试页使用“导入考试”。</p>
        <p>课表采集后，请在确认学期窗中用内置日期控件和学期控件手动选择开学日期、学年和学期。</p>
        <p>确认学期窗使用独立控件，不嵌入教务网页。确认后点“返回鸦鸦”写入本地课表库；同一学期会更新课表，不覆盖手动日程、DDL 和备注。</p>
        <p>DDL 是独立任务；日程可以勾选“同步到 DDL”，完成 DDL 不会删除原日程。</p>
        <p>特殊变更只处理移动和取消。备注说明请从日程详情里的普通备注入口管理。</p>
        <p>主题编辑先保存再应用。保存新主题后请等待几秒，让本地缓存和页面渲染完成；列表和日期面板会优先读取本地缓存，减少实时渲染造成的卡顿。</p>
        <button type="button" class="primary" data-action="ack-guide">我知道了</button>
      </div>
    `;
  }

  function maybeShowFirstOpenGuide() {
    if (localStorage.getItem(GUIDE_ACK_KEY) === "1") return;
    window.setTimeout(() => {
      if (!state.modal && localStorage.getItem(GUIDE_ACK_KEY) !== "1") {
        openModal("guide", { firstOpen: true });
      }
    }, 80);
  }

  function modalFormDraft(formId) {
    const draft = state.modalData?.__draft;
    return state.modalData?.__draftForm === formId && draft && typeof draft === "object" ? draft : {};
  }

  function hasDraftValue(draft, name) {
    return Object.prototype.hasOwnProperty.call(draft || {}, name);
  }

  function draftField(draft, name, fallback = "") {
    if (!hasDraftValue(draft, name)) return fallback;
    const value = draft[name];
    return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
  }

  function draftValues(draft, name, fallback = []) {
    if (!hasDraftValue(draft, name)) return fallback;
    const value = draft[name];
    if (Array.isArray(value)) return value.map(String);
    return value ? [String(value)] : [];
  }

  function draftChecked(draft, name, fallback = false) {
    if (!hasDraftValue(draft, name)) return fallback;
    return draftValues(draft, name).some((value) => ["1", "true", "on", "checked"].includes(value));
  }

  function captureModalFormDraft(target) {
    const form = target?.closest?.(".modal-card form");
    if (!form || !state.modal) return;
    const formData = new FormData(form);
    const grouped = new Map();
    Array.from(form.elements || []).forEach((control) => {
      if (!control.name || control.disabled) return;
      if (!grouped.has(control.name)) grouped.set(control.name, []);
      grouped.get(control.name).push(control);
    });
    const draft = {};
    grouped.forEach((controls, name) => {
      const values = formData.getAll(name).map((value) => String(value));
      const multi = controls.length > 1 || controls.some((control) => control.type === "checkbox" || control.type === "radio");
      draft[name] = multi ? values : values[0] || "";
    });
    state.modalData = {
      ...(state.modalData || {}),
      __draftForm: form.id,
      __draft: draft
    };
  }

  function clearModalFormDraft() {
    if (!state.modalData?.__draftForm) return;
    const { __draftForm, __draft, ...rest } = state.modalData;
    state.modalData = rest;
  }

  function normalizeCourseOverviewPage(page) {
    const ids = new Set(state.terms.map((term) => term.id));
    if (ids.has(page)) return page;
    return currentCourseOverviewPage();
  }

  function currentCourseOverviewPage() {
    return currentCourseTerm()?.id || state.terms[0]?.id || "";
  }

  function activeCourseOverviewPage() {
    const page = normalizeCourseOverviewPage(state.courseOverviewPage);
    if (state.courseOverviewPage !== page) state.courseOverviewPage = page;
    return page;
  }

  function normalizeScheduleOverviewPage(page) {
    return SCHEDULE_OVERVIEW_PAGES.includes(page) ? page : "custom";
  }

  function activeScheduleOverviewPage() {
    const page = normalizeScheduleOverviewPage(state.scheduleOverviewPage);
    if (state.scheduleOverviewPage !== page) state.scheduleOverviewPage = page;
    return page;
  }

  function normalizeSpecialOverviewPage(page) {
    return SPECIAL_OVERVIEW_PAGES.includes(page) ? page : "move";
  }

  function activeSpecialOverviewPage() {
    const page = normalizeSpecialOverviewPage(state.specialOverviewPage);
    if (state.specialOverviewPage !== page) state.specialOverviewPage = page;
    return page;
  }

  function setOverviewPageMotion(kind, fromPage, toPage, order) {
    if (!toPage || fromPage === toPage) {
      overviewPageMotion = null;
      return;
    }
    const fromIndex = order.indexOf(fromPage);
    const toIndex = order.indexOf(toPage);
    overviewPageMotion = {
      kind,
      page: toPage,
      direction: fromIndex >= 0 && toIndex >= 0 && toIndex < fromIndex ? "back" : "forward"
    };
  }

  function modalPageMotionAttr(kind, page) {
    if (overviewPageMotion?.kind !== kind || overviewPageMotion.page !== page) return "";
    return ` data-page-motion="${escapeAttr(overviewPageMotion.direction)}"`;
  }

  function splitCourseTermLabel(label) {
    const text = normalizeText(label || "课表");
    const fullYear = text.match(/^(.*?20\d{2}\s*[-—–~至/]\s*20\d{2}\s*学年)\s*(.*)$/);
    if (fullYear) {
      return {
        year: normalizeText(fullYear[1]) || text,
        term: normalizeText(fullYear[2])
      };
    }
    const compactYear = text.match(/^(20\d{2}\s*[-—–~至/]\s*20\d{2})\s*(.*)$/);
    if (compactYear) {
      return {
        year: `${compactYear[1].replace(/[—–~至/]/, "-")}学年`,
        term: normalizeText(compactYear[2])
      };
    }
    return { year: text, term: "" };
  }

  function renderCourseTermLabel(label, className = "course-term-label") {
    const text = label || "课表";
    const parts = splitCourseTermLabel(text);
    const termLine = parts.term ? `<i>${escapeHtml(parts.term)}</i>` : "";
    return `<span class="${className}" title="${escapeAttr(text)}"><b>${escapeHtml(parts.year)}</b>${termLine}</span>`;
  }

  function renderCourseOverviewTabs(terms, activeId, currentTermId) {
    return terms.map((term) => {
      const groups = groupCoursesByName(term);
      const active = term.id === activeId;
      const isCurrent = term.id === currentTermId;
      const label = term.label || "课表";
      return `
        <button type="button" class="modal-page-chip course-term-tab ${active ? "active" : ""}" data-action="set-course-overview-page" data-term-id="${escapeAttr(term.id)}" role="tab" aria-selected="${active ? "true" : "false"}" aria-label="${escapeAttr(label)}，${groups.length}门课程" title="${escapeAttr(label)}" ${isCurrent ? `data-current-term-chip="true"` : ""}>
          <strong>${renderCourseTermLabel(label)}</strong>
          <span>${groups.length}门</span>
          ${isCurrent ? `<small>当前</small>` : ""}
        </button>
      `;
    }).join("");
  }

  function renderScheduleOverviewTabs(activePage, recurringGroups) {
    const pages = [
      ["custom", "单次", state.customSchedules.length],
      ["recurring-active", "进行中", recurringGroups.active.length],
      ["recurring-ended", "已结束", recurringGroups.ended.length]
    ];
    return pages.map(([id, label, count]) => {
      const active = id === activePage;
      return `
        <button type="button" class="modal-page-chip schedule-status-tab ${active ? "active" : ""}" data-action="set-schedule-overview-page" data-page="${escapeAttr(id)}" role="tab" aria-selected="${active ? "true" : "false"}">
          <strong>${escapeHtml(label)}</strong>
          <span>${count}项</span>
        </button>
      `;
    }).join("");
  }

  function renderSpecialOverviewTabs(activePage, moves, cancels) {
    const pages = [
      ["move", "移动", moves.length],
      ["cancel", "取消", cancels.length]
    ];
    return pages.map(([id, label, count]) => {
      const active = id === activePage;
      return `
        <button type="button" class="modal-page-chip special-status-tab ${active ? "active" : ""}" data-action="set-special-overview-page" data-page="${escapeAttr(id)}" role="tab" aria-selected="${active ? "true" : "false"}">
          <strong>${escapeHtml(label)}</strong>
          <span>${count}项</span>
        </button>
      `;
    }).join("");
  }

  function renderCoursesModal() {
    const terms = state.terms;
    const currentTermId = currentCourseTerm()?.id || "";
    const activeTermId = activeCourseOverviewPage();
    const activeTerm = terms.find((term) => term.id === activeTermId);
    const tabs = renderCourseOverviewTabs(terms, activeTermId, currentTermId);
    if (!activeTerm) return `${modalHead("课程概览")}<div class="empty-state">还没有导入课表</div>`;
    const groups = groupCoursesByName(activeTerm);
    const isCurrent = activeTerm.id === currentTermId;
    const body = `
      <div class="modal-page-stage course-overview-page"${modalPageMotionAttr("courses", activeTermId)}>
        <section class="modal-section course-term-section ${isCurrent ? "is-current" : ""}" data-course-term-id="${escapeAttr(activeTerm.id)}" ${isCurrent ? `data-current-term="true"` : ""}>
          <div class="course-term-head">
            <h3 title="${escapeAttr(activeTerm.label || "课表")}">${renderCourseTermLabel(activeTerm.label || "课表", "course-term-title-label")}</h3>
            ${isCurrent ? `<span class="course-term-current">当前学期</span>` : ""}
          </div>
          <div class="course-grid">
            ${groups.length ? groups.map((group) => `
              <button type="button" class="course-card" data-action="open-detail" data-detail-type="course" data-detail-id="${escapeAttr(group.primary.courseKey)}">
                <strong>${escapeHtml(group.name)}</strong>
                <span>${escapeHtml(group.teacher || "教师未填")} · ${group.courses.length} 条排课</span>
                <small>${group.lines.map(escapeHtml).join("<br />")}</small>
              </button>
            `).join("") : `<div class="empty-state">当前学期暂无课程</div>`}
          </div>
        </section>
      </div>
    `;
    return `${modalHead("课程概览", "close-modal", "", tabs)}${body}`;
  }

  function renderSchedulesModal() {
    const recurringGroups = groupedRecurringSchedules();
    const activePage = activeScheduleOverviewPage();
    const custom = state.customSchedules.map((item) => `
      ${renderSwipeShell("schedule", item.id, `
      <article class="list-card schedule-card">
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.date)} · ${escapeHtml(timeRange(item))} · ${escapeHtml(item.place || "地点未填")}</span>
        </div>
      </article>
      `, `
        <button type="button" data-action="edit-schedule" data-id="${escapeAttr(item.id)}">修改</button>
        <button type="button" data-action="delete-schedule" data-id="${escapeAttr(item.id)}">删除</button>
      `)}
    `).join("");
    const recurring = (items) => items.map((item) => `
      ${renderSwipeShell("recurring", item.id, `
      <article class="list-card recurring-card">
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <span>周${escapeHtml(DAYS[item.dayIndex] || "")} · ${escapeHtml(timeRange(item))} · ${escapeHtml(formatWeeks(item.weeks))}</span>
          <small>${isRecurringEnded(item) ? "已结束" : "进行中"}</small>
        </div>
      </article>
      `, `
        <button type="button" data-action="edit-recurring" data-id="${escapeAttr(item.id)}">修改</button>
        <button type="button" data-action="delete-recurring" data-id="${escapeAttr(item.id)}">删除</button>
      `)}
    `).join("");
    const headActions = `
      <button type="button" class="modal-head-action" data-action="new-schedule">单次日程</button>
      <button type="button" class="modal-head-action" data-action="new-recurring">常驻日程</button>
    `;
    const tabs = renderScheduleOverviewTabs(activePage, recurringGroups);
    const sections = {
      custom: `<section class="modal-section"><h3>单次日程</h3>${custom || `<div class="empty-state">暂无单次日程</div>`}</section>`,
      "recurring-active": `<section class="modal-section"><h3>常驻日程 · 进行中</h3>${recurring(recurringGroups.active) || `<div class="empty-state">暂无进行中的常驻日程</div>`}</section>`,
      "recurring-ended": `<section class="modal-section"><h3>常驻日程 · 已结束</h3>${recurring(recurringGroups.ended) || `<div class="empty-state">暂无已结束常驻日程</div>`}</section>`
    };
    return `
      ${modalHead("日程概览", "close-modal", headActions, tabs)}
      <div class="modal-page-stage schedule-overview-page"${modalPageMotionAttr("schedules", activePage)}>
        ${sections[activePage] || sections.custom}
      </div>
    `;
  }

  function renderSpecialsModal() {
    const moves = state.specialChanges.filter((item) => item.action === "move");
    const cancels = state.specialChanges.filter((item) => item.action === "cancel");
    const activePage = activeSpecialOverviewPage();
    const renderList = (items) => items.map((item) => `
      ${renderSwipeShell("special", item.id, `
      <article class="list-card special-card">
        <div>
          <strong>${escapeHtml(targetTitle(item.targetKey) || "特殊变更")}</strong>
          <span>${escapeHtml(item.action === "cancel" ? "取消" : "移动")} · ${escapeHtml(item.sourceDate)}${item.action === "move" ? ` → ${escapeHtml(item.date)}` : ""}</span>
          ${item.note ? `<small>${escapeHtml(item.note)}</small>` : ""}
        </div>
      </article>
      `, `
        <button type="button" data-action="edit-special" data-id="${escapeAttr(item.id)}">修改</button>
        <button type="button" data-action="cancel-special" data-id="${escapeAttr(item.id)}">取消变更</button>
      `)}
    `).join("");
    const headActions = `<button type="button" class="modal-head-action" data-action="new-special">新建变更</button>`;
    const tabs = renderSpecialOverviewTabs(activePage, moves, cancels);
    const sections = {
      move: `<section class="modal-section"><h3>移动/调课</h3>${renderList(moves) || `<div class="empty-state">暂无移动变更</div>`}</section>`,
      cancel: `<section class="modal-section"><h3>取消/停课</h3>${renderList(cancels) || `<div class="empty-state">暂无取消变更</div>`}</section>`
    };
    return `
      ${modalHead("特殊变更", "close-modal", headActions, tabs)}
      <div class="modal-page-stage special-overview-page"${modalPageMotionAttr("specials", activePage)}>
        ${sections[activePage] || sections.move}
      </div>
    `;
  }

  function renderDdlModal() {
    const ddlView = state.ddlView === "completed" ? "completed" : "active";
    const isCompletedView = ddlView === "completed";
    const activeDdls = appCache.activeDdls;
    const completedAll = appCache.completedDdls;
    const doneList = filteredCompletedDdls();
    const listItems = isCompletedView ? doneList : activeDdls;
    const list = listItems.map((ddl) => renderDdlCard(ddl, isCompletedView)).join("");
    const emptyText = isCompletedView ? "当前检索条件下暂无已完成 DDL" : "暂无 DDL";
    const headActions = isCompletedView ? "" : `<button type="button" class="modal-head-action" data-action="new-ddl">新建 DDL</button>`;
    return `
      ${modalHead("DDL", "close-modal", headActions)}
      <section class="ddl-page modal-section" data-ddl-view="${escapeAttr(ddlView)}">
        <div class="ddl-view-tabs" role="tablist" aria-label="DDL分类">
          <button class="ddl-view-tab ${!isCompletedView ? "active" : ""}" type="button" data-action="set-ddl-view" data-view="active" role="tab" aria-selected="${!isCompletedView ? "true" : "false"}">
            进行中 <span>${activeDdls.length}</span>
          </button>
          <button class="ddl-view-tab ${isCompletedView ? "active" : ""}" type="button" data-action="set-ddl-view" data-view="completed" role="tab" aria-selected="${isCompletedView ? "true" : "false"}">
            已完成 <span>${completedAll.length}</span>
          </button>
        </div>
        ${isCompletedView ? renderCompletedDdlFilter(completedAll.length, doneList.length) : ""}
        <div class="ddl-page-list">
          ${list || `<div class="empty-state">${emptyText}</div>`}
        </div>
      </section>
    `;
  }

  function renderCompletedDdlFilter(total, visible) {
    const filters = ddlDoneFilters();
    const filtered = hasCompletedDdlFilters(filters);
    return `
      <section class="ddl-completed-filter" aria-label="已完成 DDL 项目内容与时间范围检索">
        <div class="ddl-completed-filter-head">
          <strong>项目内容 + 时间范围</strong>
          <span>${visible}/${total}项</span>
        </div>
        <div class="ddl-completed-filter-row">
          ${renderTextField("ddlDoneQuery", "项目内容", filters.query, { id: "ddlDoneQuery", type: "search", placeholder: "标题、内容、关联对象", ariaLabel: "已完成 DDL 项目内容模糊检索" })}
          ${renderDateField("ddlDoneStart", "开始日期", filters.startDate, { id: "ddlDoneStart", optional: true, ariaLabel: "已完成 DDL 开始日期" })}
          ${renderTimeField("ddlDoneStartTime", "开始时间", filters.startTime, { id: "ddlDoneStartTime", optional: true, fallback: "00:00", ariaLabel: "已完成 DDL 开始时间" })}
          ${renderDateField("ddlDoneEnd", "结束日期", filters.endDate, { id: "ddlDoneEnd", optional: true, ariaLabel: "已完成 DDL 结束日期" })}
          ${renderTimeField("ddlDoneEndTime", "结束时间", filters.endTime, { id: "ddlDoneEndTime", optional: true, fallback: "23:59", ariaLabel: "已完成 DDL 结束时间" })}
          <button class="ddl-filter-clear" type="button" data-action="clear-ddl-filter" ${filtered ? "" : "disabled"}>清除</button>
        </div>
      </section>
    `;
  }

  function renderDdlCard(ddl, completed) {
    const actions = completed ? `
      <button type="button" data-action="delete-completed-ddl" data-id="${escapeAttr(ddl.id)}">删除</button>
    ` : `
      <button type="button" data-action="complete-ddl" data-id="${escapeAttr(ddl.id)}">完成</button>
      ${ddl.sourceType === "schedule" ? "" : `<button type="button" data-action="edit-ddl" data-id="${escapeAttr(ddl.id)}">修改</button>`}
      <button type="button" data-action="delete-ddl" data-id="${escapeAttr(ddl.id)}">${ddl.sourceType === "schedule" ? "取消同步" : "删除"}</button>
    `;
    const card = `
      <article class="list-card ddl-card">
        <div>
          <strong>${escapeHtml(ddl.topic)}</strong>
          <span>${escapeHtml(formatDdlTime(ddl))} · ${escapeHtml(completed ? "已完成" : "进行中")}</span>
          ${completed && ddl.completedAt ? `<small>完成：${escapeHtml(formatCompletedDdlTime(ddl.completedAt))}</small>` : ""}
          ${ddl.sourceType === "schedule" ? `<small>日程同步</small>` : ""}
          ${!completed ? `<small>${ddl.sourceType === "schedule" ? "日程提醒" : "通知"}：${escapeHtml(reminderSummary(ddl))}</small>` : ""}
          ${ddl.content ? `<small>${escapeHtml(ddl.content)}</small>` : ""}
        </div>
      </article>
    `;
    if (completed) {
      return `
        <div class="ddl-card-shell completed">
          ${card}
          <button class="ddl-completed-delete" type="button" data-action="delete-completed-ddl" data-id="${escapeAttr(ddl.id)}">删除</button>
        </div>
      `;
    }
    return renderSwipeShell("ddl", ddl.id, card, actions);
  }

  function renderDdlForm() {
    const editing = state.modalData.id ? state.ddls.find((item) => item.id === state.modalData.id) : null;
    const draft = modalFormDraft("ddlForm");
    const base = editing || {
      date: state.focusDate,
      time: "23:59",
      topic: "",
      content: "",
      targetKey: "",
      reminders: []
    };
    const data = {
      ...base,
      date: draftField(draft, "date", base.date),
      time: draftField(draft, "time", base.time || "23:59"),
      topic: draftField(draft, "topic", base.topic || ""),
      content: draftField(draft, "content", base.content || ""),
      targetKey: draftField(draft, "targetKey", base.targetKey || ""),
      reminders: draftValues(draft, "reminders", base.reminders || []),
      reminderEnabled: draftChecked(draft, "reminderEnabled", Boolean(base.reminders?.length))
    };
    return `
      ${modalHead(editing ? "修改 DDL" : "新建 DDL", "open-ddl")}
      <form id="ddlForm" class="form-stack">
        <div class="form-grid">
          ${renderDateField("date", "日期", data.date)}
          ${renderTimeField("time", "时间", data.time || "23:59", { fallback: "23:59" })}
        </div>
        <label><span>关联对象</span>${targetSelect("targetKey", data.targetKey || "")}</label>
        <label><span>主题</span><input name="topic" type="text" value="${escapeAttr(data.topic || "")}" maxlength="40" required /></label>
        <label><span>内容</span><textarea name="content" maxlength="500">${escapeHtml(data.content || "")}</textarea></label>
        ${reminderFields(data.reminders, false, { enabled: data.reminderEnabled })}
        <button type="submit" class="primary">保存</button>
      </form>
    `;
  }

  function renderScheduleForm() {
    const editing = state.modalData.id ? state.customSchedules.find((item) => item.id === state.modalData.id) : null;
    const draft = modalFormDraft("scheduleForm");
    const base = editing || {
      date: state.focusDate,
      startTime: "08:00",
      endTime: "09:40",
      title: "",
      place: "",
      reminders: [],
      syncToDdl: false
    };
    const data = {
      ...base,
      date: draftField(draft, "date", base.date),
      startTime: draftField(draft, "startTime", base.startTime || "08:00"),
      endTime: draftField(draft, "endTime", base.endTime || "09:40"),
      title: draftField(draft, "title", base.title || ""),
      place: draftField(draft, "place", base.place || ""),
      reminders: draftValues(draft, "reminders", base.reminders || []),
      syncToDdl: draftChecked(draft, "syncToDdl", Boolean(base.syncToDdl)),
      reminderEnabled: draftChecked(draft, "reminderEnabled", Boolean(base.reminders?.length))
    };
    return `
      ${modalHead(editing ? "修改日程" : "添加日程", "open-schedules")}
      <form id="scheduleForm" class="form-stack">
        ${renderDateField("date", "日期", data.date)}
        <div class="form-grid">
          ${renderTimeField("startTime", "开始", data.startTime)}
          ${renderTimeField("endTime", "结束", data.endTime, { fallback: "09:40" })}
        </div>
        <label><span>内容</span><input name="title" type="text" value="${escapeAttr(data.title)}" maxlength="40" required /></label>
        <label><span>地点</span><input name="place" type="text" value="${escapeAttr(data.place || "")}" maxlength="60" /></label>
        ${reminderFields(data.reminders, data.syncToDdl, { showSync: true, enabled: data.reminderEnabled })}
        <button type="submit" class="primary">保存</button>
      </form>
    `;
  }

  function renderRecurringForm() {
    const editing = state.modalData.id ? state.recurringSchedules.find((item) => item.id === state.modalData.id) : null;
    const info = dateInfo(state.focusDate);
    const draft = modalFormDraft("recurringForm");
    const base = editing || {
      title: "",
      place: "",
      dayIndex: info.dayIndex,
      startTime: "08:00",
      endTime: "09:40",
      weeks: [weekForDate(state.focusDate)],
      startDate: state.focusDate,
      endDate: "",
      termStart: state.termStart
    };
    const baseTermStart = base.termStart || state.termStart || DEFAULT_TERM_START;
    const data = {
      ...base,
      title: draftField(draft, "title", base.title || ""),
      place: draftField(draft, "place", base.place || ""),
      dayIndex: Number(draftField(draft, "dayIndex", String(base.dayIndex))),
      weeks: parseWeeks(draftField(draft, "weeks", formatWeeks(base.weeks || []))),
      startTime: draftField(draft, "startTime", base.startTime || "08:00"),
      endTime: draftField(draft, "endTime", base.endTime || "09:40"),
      startDate: draftField(draft, "startDate", base.startDate || ""),
      endDate: draftField(draft, "endDate", base.endDate || ""),
      termStart: draftField(draft, "termStart", baseTermStart)
    };
    const linkedRange = recurringDateRangeFromWeeks(data.weeks, data.dayIndex, data.termStart);
    if (!data.startDate && linkedRange.startDate) data.startDate = linkedRange.startDate;
    if (!data.endDate && linkedRange.endDate) data.endDate = linkedRange.endDate;
    return `
      ${modalHead(editing ? "修改常驻日程" : "添加常驻日程", "open-schedules")}
      <form id="recurringForm" class="form-stack">
        <input type="hidden" name="termStart" value="${escapeAttr(data.termStart || state.termStart || DEFAULT_TERM_START)}" />
        <label><span>内容</span><input name="title" type="text" value="${escapeAttr(data.title)}" maxlength="40" required /></label>
        <label><span>地点</span><input name="place" type="text" value="${escapeAttr(data.place || "")}" maxlength="60" /></label>
        <div class="form-grid">
          <label><span>星期</span>${daySelect(data.dayIndex)}</label>
          ${renderRecurringWeekPicker(data.weeks)}
        </div>
        <div class="form-grid">
          ${renderTimeField("startTime", "开始", data.startTime)}
          ${renderTimeField("endTime", "结束", data.endTime, { fallback: "09:40" })}
        </div>
        <div class="form-grid">
          ${renderDateField("startDate", "开始日期", data.startDate || "", { optional: true })}
          ${renderDateField("endDate", "结束日期", data.endDate || "", { optional: true })}
        </div>
        <button type="submit" class="primary">保存</button>
      </form>
    `;
  }

  function renderRecurringWeekPicker(weeks = []) {
    const selected = new Set(weeks.map(Number));
    const value = formatWeeks(weeks);
    const inputUi = templateInputUi();
    return `
      <section class="recurring-week-field" ${inputUiAttrs("week", inputUi)} data-recurring-week-picker data-last-weeks="${escapeAttr(value)}">
        <span>周次</span>
        <div class="recurring-week-control">
          <input class="recurring-week-input" name="weeks" type="text" value="${escapeAttr(value)}" placeholder="1-16 或 1,3,5" autocomplete="off" inputmode="text" required data-recurring-weeks-input data-input-component="${escapeAttr(inputUi.variant)}" />
          <strong data-recurring-week-summary>${escapeHtml(value ? `第 ${value} 周` : "请选择周次")}</strong>
        </div>
        <div class="recurring-week-rail" aria-label="选择常驻日程周次">
          ${Array.from({ length: MAX_WEEK }, (_, index) => {
            const week = index + 1;
            return `<button type="button" class="recurring-week-chip ${selected.has(week) ? "active" : ""}" data-action="toggle-recurring-week" data-week="${week}" aria-pressed="${selected.has(week) ? "true" : "false"}">第${week}周</button>`;
          }).join("")}
        </div>
      </section>
    `;
  }

  function renderSpecialForm() {
    const editing = state.modalData.id ? state.specialChanges.find((item) => item.id === state.modalData.id) : null;
    const draft = modalFormDraft("specialForm");
    const base = editing || {
      targetKey: defaultSpecialTargetKey(),
      action: "move",
      sourceDate: state.focusDate,
      date: state.focusDate,
      startTime: "08:00",
      endTime: "09:40",
      place: "",
      note: ""
    };
    const data = {
      ...base,
      targetKey: draftField(draft, "targetKey", base.targetKey || ""),
      action: draftField(draft, "action", base.action || "move"),
      sourceDate: draftField(draft, "sourceDate", base.sourceDate || state.focusDate),
      date: draftField(draft, "date", base.date || state.focusDate),
      startTime: draftField(draft, "startTime", base.startTime || "08:00"),
      endTime: draftField(draft, "endTime", base.endTime || "09:40"),
      place: draftField(draft, "place", base.place || ""),
      note: draftField(draft, "note", base.note || "")
    };
    return `
      ${modalHead(editing ? "修改特殊变更" : "特殊变更")}
      <form id="specialForm" class="form-stack">
        <label><span>对象</span>${targetSelect("targetKey", data.targetKey, true)}</label>
        <label><span>类型</span>${internalOptionSelect("action", data.action, [{ label: "变更类型", options: [["move", "调课/改时间"], ["cancel", "停课/取消"]] }], { title: "选择变更类型", required: true })}</label>
        <div class="form-grid">
          ${renderDateField("sourceDate", "原日期", data.sourceDate || state.focusDate)}
          ${renderDateField("date", "显示日期", data.date || state.focusDate)}
        </div>
        <div class="form-grid">
          ${renderTimeField("startTime", "开始", data.startTime || "08:00", { required: false })}
          ${renderTimeField("endTime", "结束", data.endTime || "09:40", { fallback: "09:40", required: false })}
        </div>
        <label><span>地点</span><input name="place" type="text" value="${escapeAttr(data.place || "")}" maxlength="60" /></label>
        <label><span>变更说明</span><textarea name="note" maxlength="300" placeholder="这里记录调课或取消原因；普通备注请从详情入口添加。">${escapeHtml(data.note || "")}</textarea></label>
        <button type="submit" class="primary">保存</button>
      </form>
    `;
  }

  function renderDetailModal() {
    const detail = detailContext();
    if (!detail) return `${modalHead("详情")}<div class="empty-state">没有找到这条内容</div>`;
    const notes = state.notes[detail.noteKey] || [];
    return `
      ${modalHead("详情")}
      <section class="detail-block">
        <h3>${escapeHtml(detail.title)}</h3>
        <p>${escapeHtml(detail.meta.join(" · "))}</p>
      </section>
      <form id="noteForm" class="note-form">
        <input type="hidden" name="noteKey" value="${escapeAttr(detail.noteKey)}" />
        <textarea name="note" maxlength="500" placeholder="写一条备注"></textarea>
        <button type="submit">保存备注</button>
      </form>
      <div class="note-list">
        ${notes.length ? notes.map((note) => `
          ${renderSwipeShell("note", note.id, `
          <article class="note-card">
            <p>${escapeHtml(note.text)}</p>
          </article>
          `, `
            <button type="button" data-action="edit-note" data-note-key="${escapeAttr(detail.noteKey)}" data-id="${escapeAttr(note.id)}" data-return-type="${escapeAttr(state.modalData.type || "")}" data-return-id="${escapeAttr(state.modalData.id || "")}">修改</button>
            <button type="button" data-action="delete-note" data-note-key="${escapeAttr(detail.noteKey)}" data-id="${escapeAttr(note.id)}">删除</button>
          `)}
        `).join("") : `<div class="empty-state">暂无备注</div>`}
      </div>
    `;
  }

  function renderNoteViewModal() {
    const note = noteFromModal();
    const backAction = noteReturnAction();
    if (!note) return `${modalHead("备注", backAction)}<div class="empty-state">没有找到这条备注</div>`;
    return `
      ${modalHead("备注", backAction)}
      <article class="note-card note-view-card">
        <p>${escapeHtml(note.text)}</p>
        <small>${escapeHtml(note.createdAt ? note.createdAt.slice(0, 16).replace("T", " ") : "")}</small>
      </article>
      <div class="inline-actions">
        <button type="button" data-action="edit-note" data-note-key="${escapeAttr(state.modalData.noteKey)}" data-id="${escapeAttr(state.modalData.id)}" data-return-type="${escapeAttr(state.modalData.returnType || "")}" data-return-id="${escapeAttr(state.modalData.returnId || "")}">修改</button>
      </div>
    `;
  }

  function renderNoteEditModal() {
    const note = noteFromModal();
    const backAction = noteReturnAction();
    if (!note) return `${modalHead("修改备注", backAction)}<div class="empty-state">没有找到这条备注</div>`;
    return `
      ${modalHead("修改备注", backAction)}
      <form id="noteEditForm" class="note-form">
        <input type="hidden" name="noteKey" value="${escapeAttr(state.modalData.noteKey)}" />
        <input type="hidden" name="id" value="${escapeAttr(state.modalData.id)}" />
        <textarea name="note" maxlength="500">${escapeHtml(note.text)}</textarea>
        <button type="submit" class="primary">保存备注</button>
      </form>
    `;
  }

  function noteFromModal() {
    const data = state.modalData || {};
    const notes = state.notes[data.noteKey] || [];
    return notes.find((note) => note.id === data.id) || null;
  }

  function noteReturnAction() {
    return noteReturnData().type ? "return-note-detail" : "close-modal";
  }

  function noteReturnData() {
    const data = state.modalData || {};
    if (data.returnType) return { type: data.returnType, id: data.returnId || "" };
    return detailDataFromNoteKey(data.noteKey);
  }

  function detailDataFromNoteKey(noteKey) {
    const key = String(noteKey || "");
    if (key.startsWith("course:")) return { type: "course", id: key.slice(7) };
    if (key.startsWith("recurring:")) return { type: "recurring", id: key.slice(10) };
    if (key.startsWith("custom:")) return { type: "custom", id: key.slice(7) };
    if (key.startsWith("exam:")) return { type: "exam", id: key.slice(5) };
    if (key.startsWith("special:")) return { type: "special", id: key.slice(8) };
    return {};
  }

  function returnToNoteOwner() {
    const detail = noteReturnData();
    if (detail.type) {
      openModal("detail", detail);
      return;
    }
    closeModal();
  }

  function renderTermImportModal() {
    const rows = pendingImport?.rows || [];
    const stored = state.terms.length
      ? state.terms.map((term) => `${term.label || "课表"} ${term.termStart}`).slice(0, 3).join(" / ")
      : "";
    const startValue = state.termStart || DEFAULT_TERM_START;
    const termSelection = termSelectionFromDate(startValue);
    return `
      ${modalHead("确认学期")}
      <form id="termImportForm" class="form-stack term-import-panel">
        <section class="term-auto-card is-fallback">
          <div>
            <span>手动选择</span>
            <strong>开学日期与学期</strong>
          </div>
          <small>请按当前课表页面对应的实际学期手动选择，导入过程只使用你的手动选择。</small>
        </section>
        <section class="term-start-field term-internal-date-field">
          <span>开学日期</span>
          ${internalDateSelect("termStart", startValue, { title: "选择开学日期", required: true })}
        </section>
        ${renderTermSelectFields(termSelection)}
        <p class="form-note term-import-note">
          将导入 ${rows.length} 门课程。相同学期会更新课表，不覆盖手动日程、DDL 和备注。
          ${stored ? `<br>已存：${escapeHtml(stored)}` : ""}
        </p>
        <div class="prompt-actions term-import-actions">
          <button type="button" class="prompt-cancel" data-action="close-modal">取消导入</button>
          <button type="submit" class="prompt-confirm primary">确认导入</button>
        </div>
      </form>
    `;
  }

  function renderTermSelectFields(selection = {}) {
    const yearValue = normalizeAcademicYearValue(selection.yearValue);
    const kind = normalizeTermKind(selection.kind) || "autumn";
    const label = buildTermLabelFromSelection(yearValue, kind);
    return `
      <fieldset class="term-select-field" data-term-select>
        <legend>学期</legend>
        <output class="term-select-preview" data-term-selection-preview>${escapeHtml(label)}</output>
        <div class="term-select-grid">
          <label>
            <span>学年</span>
            ${internalOptionSelect("termYear", yearValue, [{ label: "学年", options: academicYearOptions() }], { title: "选择学年", required: true })}
          </label>
          <label>
            <span>学期</span>
            ${internalOptionSelect("termKind", kind, [{ label: "学期", options: TERM_KIND_OPTIONS.map(([value, label]) => [value, label.replace("季学期", "")]) }], { title: "选择学期", required: true })}
          </label>
        </div>
      </fieldset>
    `;
  }

  function academicYearOptions() {
    return Array.from({ length: ACADEMIC_YEAR_MAX - ACADEMIC_YEAR_MIN + 1 }, (_, index) => {
      const firstYear = ACADEMIC_YEAR_MIN + index;
      return [`${firstYear}-${firstYear + 1}`, `${firstYear}-${firstYear + 1}学年`];
    });
  }

  function normalizeAcademicYearValue(value) {
    const text = normalizeText(value);
    const match = text.match(/(20\d{2})\s*[-—–~至]\s*(20\d{2})/);
    if (match) {
      const firstYear = clamp(Number(match[1]), ACADEMIC_YEAR_MIN, ACADEMIC_YEAR_MAX);
      return `${firstYear}-${firstYear + 1}`;
    }
    const fallback = termSelectionFromDate(state.termStart || DEFAULT_TERM_START).yearValue;
    return fallback || `${clamp(new Date().getFullYear(), ACADEMIC_YEAR_MIN, ACADEMIC_YEAR_MAX)}-${clamp(new Date().getFullYear(), ACADEMIC_YEAR_MIN, ACADEMIC_YEAR_MAX) + 1}`;
  }

  function normalizeTermKind(value) {
    const text = normalizeText(value);
    if (["autumn", "spring", "summer"].includes(text)) return text;
    return importedTermKind(text);
  }

  function termKindLabel(kind) {
    return TERM_KIND_OPTIONS.find(([value]) => value === kind)?.[1] || "秋季学期";
  }

  function termSelectionFromDate(dateString) {
    const date = toDate(dateString || DEFAULT_TERM_START);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const kind = month >= 8 ? "autumn" : month >= 6 ? "summer" : "spring";
    const firstYear = clamp(kind === "autumn" ? year : year - 1, ACADEMIC_YEAR_MIN, ACADEMIC_YEAR_MAX);
    return { yearValue: `${firstYear}-${firstYear + 1}`, kind };
  }

  function buildTermLabelFromSelection(yearValue, kindValue) {
    const year = normalizeAcademicYearValue(yearValue);
    const kind = normalizeTermKind(kindValue) || "autumn";
    return `${year}学年${termKindLabel(kind)}`;
  }

  function normalizeInputUiComponent(value) {
    if (UI_MODULE_REGISTRY?.normalizeInputUi) return UI_MODULE_REGISTRY.normalizeInputUi(value?.variant || value);
    const key = String(value?.variant || value || DEFAULT_INPUT_UI.variant || "originalGlass");
    const preset = UI_INPUT_COMPONENTS[key] || DEFAULT_INPUT_UI;
    return {
      ...DEFAULT_INPUT_UI,
      ...preset,
      variant: preset.variant || key,
      themeSync: preset.themeSync !== false
    };
  }

  function templateInputUi(templateId = state.uiTemplate) {
    const id = normalizeTemplateId(templateId);
    const template = UI_TEMPLATES[id] || {};
    return normalizeInputUiComponent(template.inputUi || template.interaction?.inputUi || DEFAULT_INPUT_UI.variant);
  }

  function inputUiAttrs(kind, inputUi = templateInputUi()) {
    const ui = normalizeInputUiComponent(inputUi);
    return [
      `data-input-ui="${escapeAttr(ui.variant || "originalGlass")}"`,
      `data-input-kind="${escapeAttr(kind || "field")}"`,
      `data-input-density="${escapeAttr(ui.density || "airy")}"`,
      `data-input-shape="${escapeAttr(ui.shape || "roundedGlass")}"`,
      `data-input-popup="${escapeAttr(ui.popup || "glassSheet")}"`,
      `data-input-affordance="${escapeAttr(ui.affordance || "softBadge")}"`,
      `data-theme-sync="${ui.themeSync === false ? "false" : "true"}"`
    ].join(" ");
  }

  function renderTimeField(name, label, value, options = {}) {
    const required = options.required === false || options.optional ? "" : " required";
    const disabled = options.disabled ? " disabled" : "";
    const id = options.id ? ` id="${escapeAttr(options.id)}"` : "";
    const ariaLabel = options.ariaLabel ? ` aria-label="${escapeAttr(options.ariaLabel)}"` : "";
    const optional = options.optional ? ` data-time-optional="true"` : "";
    const fallback = options.fallback || (name === "endTime" ? "09:40" : "08:00");
    const fallbackAttr = ` data-time-fallback="${escapeAttr(fallback)}"`;
    const normalized = options.optional ? validTimeInputValue(value) : normalizeTime(value || fallback);
    const inputUi = templateInputUi();
    return `
      <label class="time-field" data-input-template="${escapeAttr(inputUi.variant)}">
        <span>${escapeHtml(label)}</span>
        <div class="picker-input-shell" ${inputUiAttrs("time", inputUi)}>
          <input class="time-input" name="${escapeAttr(name)}"${id} type="text" inputmode="none" readonly data-time-input data-input-component="${escapeAttr(inputUi.variant)}" value="${escapeAttr(normalized)}"${required}${disabled}${ariaLabel}${optional}${fallbackAttr} />
        </div>
      </label>
    `;
  }

  function renderTextField(name, label, value, options = {}) {
    const type = options.type || "text";
    const id = options.id ? ` id="${escapeAttr(options.id)}"` : "";
    const ariaLabel = options.ariaLabel ? ` aria-label="${escapeAttr(options.ariaLabel)}"` : "";
    const placeholder = options.placeholder ? ` placeholder="${escapeAttr(options.placeholder)}"` : "";
    const disabled = options.disabled ? " disabled" : "";
    const required = options.required ? " required" : "";
    const inputUi = templateInputUi();
    return `
      <label class="text-field" data-input-template="${escapeAttr(inputUi.variant)}">
        <span>${escapeHtml(label)}</span>
        <div class="picker-input-shell text-input-shell" ${inputUiAttrs(type, inputUi)}>
          <input class="text-input" name="${escapeAttr(name)}"${id} type="${escapeAttr(type)}" data-input-component="${escapeAttr(inputUi.variant)}" value="${escapeAttr(value || "")}"${placeholder}${required}${disabled}${ariaLabel} />
        </div>
      </label>
    `;
  }

  function renderDateField(name, label, value, options = {}) {
    const required = options.required === false || options.optional ? "" : " required";
    const disabled = options.disabled ? " disabled" : "";
    const id = options.id ? ` id="${escapeAttr(options.id)}"` : "";
    const ariaLabel = options.ariaLabel ? ` aria-label="${escapeAttr(options.ariaLabel)}"` : "";
    const min = options.min ? ` data-date-min="${escapeAttr(options.min)}"` : "";
    const max = options.max ? ` data-date-max="${escapeAttr(options.max)}"` : "";
    const optional = options.optional ? ` data-date-optional="true"` : "";
    const normalized = validDate(value) ? value : options.optional ? "" : todayString();
    const inputUi = templateInputUi();
    const extraClass = options.className ? ` ${escapeAttr(options.className)}` : "";
    return `
      <label class="date-field${extraClass}" data-input-template="${escapeAttr(inputUi.variant)}">
        <span>${escapeHtml(label)}</span>
        <div class="picker-input-shell" ${inputUiAttrs("date", inputUi)}>
          <input class="date-input" name="${escapeAttr(name)}"${id} type="text" inputmode="none" readonly data-date-input data-input-component="${escapeAttr(inputUi.variant)}" value="${escapeAttr(normalized)}"${required}${disabled}${ariaLabel}${min}${max}${optional} />
        </div>
      </label>
    `;
  }

  function reminderPermissionStatus() {
    const native = Boolean(window.YayaPlatform?.isNative?.());
    const fallback = {
      native,
      notifications: native ? "unknown" : "preview",
      exactAlarms: native ? "unknown" : "preview",
      backgroundRun: native ? "unknown" : "preview",
      scheduledCount: 0,
      canNotify: false,
      canExact: false,
      canBackground: false,
      needsAction: native
    };
    try {
      const raw = window.YayaPlatform?.getReminderPermissionStatus?.();
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === "object") return { ...fallback, ...parsed };
    } catch (error) {}
    return fallback;
  }

  function reminderPermissionSignature() {
    const status = reminderPermissionStatus();
    return [
      status.native ? "native" : "web",
      status.notifications || "",
      status.exactAlarms || "",
      status.backgroundRun || "",
      status.canNotify === false ? "notify-off" : "notify-on",
      status.canExact === false ? "exact-off" : "exact-on",
      status.canBackground === false ? "background-off" : "background-on",
      Number(status.scheduledCount || 0),
      nativeReminderPayload().length
    ].join("|");
  }

  function reminderPermissionLabels(status = reminderPermissionStatus()) {
    if (!status.native) {
      return {
        state: "preview",
        title: "网页预览",
        detail: "手机 App 内可请求系统通知权限",
        action: "检查权限"
      };
    }
    const notifyReady = status.canNotify !== false && ["granted", "ready", "authorized", "provisional", "ephemeral"].includes(status.notifications);
    const exactReady = status.canExact !== false && ["granted", "ready", "ios", "not-required", "notRequired"].includes(status.exactAlarms);
    const backgroundReady = status.canBackground !== false && ["granted", "ready", "ios", "ios-managed", "not-required", "notRequired"].includes(status.backgroundRun);
    const soundReady = status.canSound !== false && !["blocked", "disabled"].includes(status.sound);
    if (notifyReady && exactReady && backgroundReady && soundReady) {
      return {
        state: "ready",
        title: "提醒权限已开启",
        detail: `已挂载 ${Number(status.scheduledCount || 0)} 个系统提醒`,
        action: "重新检查"
      };
    }
    if (!notifyReady) {
      return {
        state: "needs-action",
        title: "需要开启通知",
        detail: "允许鸦鸦日程发送 DDL 与日程提醒",
        action: "开启权限"
      };
    }
    if (!exactReady) {
      return {
        state: "needs-action",
        title: "需要允许准时提醒",
        detail: "允许系统在息屏和省电状态下准时触发提醒",
        action: "开启权限"
      };
    }
    if (!backgroundReady) {
      const platform = currentPlatformKind(status);
      return {
        state: "needs-action",
        title: platform === "ios" ? "需要检查系统提醒" : "需要允许后台运行",
        detail: platform === "ios" ? "iOS 会由系统管理后台触发，确认通知权限可用即可" : "允许鸦鸦日程在息屏和电池优化状态下保留提醒",
        action: platform === "ios" ? "检查权限" : "开启后台"
      };
    }
    if (!soundReady) {
      return {
        state: "needs-action",
        title: "需要开启通知声音",
        detail: "系统通知声音关闭时，提醒会静默显示",
        action: "打开设置"
      };
    }
    return {
      state: "needs-action",
      title: "需要允许准时提醒",
      detail: "系统未允许准时提醒时，通知可能延迟",
      action: "开启权限"
    };
  }

  function renderReminderPermissionPanel(kind = "inline", options = {}) {
    const status = reminderPermissionStatus();
    const labels = reminderPermissionLabels(status);
    const localCount = nativeReminderPayload().filter((item) => normalizeReminderValues(item.reminders).length).length;
    const hidden = options.hidden ? " hidden" : "";
    return `
      <div class="reminder-permission reminder-permission-${escapeAttr(kind)} is-${escapeAttr(labels.state)}" data-reminder-permission${hidden}>
        <div class="reminder-permission-copy">
          <strong>${escapeHtml(labels.title)}</strong>
          <span>${escapeHtml(labels.detail)}${localCount ? ` · 本地 ${localCount} 项` : ""}</span>
        </div>
        <button type="button" data-action="request-reminder-permission">${escapeHtml(labels.action)}</button>
      </div>
    `;
  }

  function reminderFields(selected = [], syncToDdl = false, options = {}) {
    const selectedSet = new Set(normalizeReminderValues(selected));
    const enabled = options.enabled === true || selectedSet.size > 0;
    const kind = options.showSync ? "schedule" : "ddl";
    const syncLine = options.showSync ? `
        <label class="check-line reminder-sync-switch schedule-ddl-sync-switch ${enabled && syncToDdl ? "is-enabled" : ""}" ${enabled ? "" : "hidden"}>
          <input type="checkbox" name="syncToDdl" value="1" ${enabled && syncToDdl ? "checked" : ""} ${enabled ? "" : "disabled"} />
          <span>同步到 DDL 显示</span>
        </label>
    ` : "";
    return `
      <fieldset class="reminder-field reminder-control ${kind}-reminder-control ${enabled ? "is-enabled" : ""}" data-reminder-control data-reminder-kind="${escapeAttr(kind)}">
        <div class="reminder-head ${kind}-reminder-head">
          <span class="reminder-title ${kind}-reminder-title">提醒</span>
          <label class="reminder-switch ${kind}-reminder-switch">
            <input type="checkbox" name="reminderEnabled" value="1" ${enabled ? "checked" : ""} />
            <span>${enabled ? "已开启" : "开启"}</span>
          </label>
        </div>
        ${syncLine}
        ${renderReminderPermissionPanel(kind, { hidden: !enabled })}
        <div class="chip-grid reminder-options ${kind}-reminder-options" ${enabled ? "" : "hidden"}>
          ${REMINDER_OPTIONS.map(([value, label]) => `
            <label class="chip reminder-chip ${kind}-reminder-chip ${selectedSet.has(value) ? "active" : ""}">
              <input type="checkbox" name="reminders" value="${escapeAttr(value)}" ${selectedSet.has(value) ? "checked" : ""} ${enabled ? "" : "disabled"} />
              <span>${escapeHtml(label)}</span>
            </label>
          `).join("")}
        </div>
      </fieldset>
    `;
  }

  function syncReminderControl(control) {
    const enabledInput = control.querySelector('input[name="reminderEnabled"]');
    const enabled = Boolean(enabledInput?.checked);
    const enabledLabel = control.querySelector(".reminder-switch span");
    const options = control.querySelector(".reminder-options");
    const syncSwitch = control.querySelector(".reminder-sync-switch");
    const syncInput = syncSwitch?.querySelector('input[name="syncToDdl"]');
    const permission = control.querySelector("[data-reminder-permission]");
    control.classList.toggle("is-enabled", enabled);
    if (enabledLabel) enabledLabel.textContent = enabled ? "已开启" : "开启";
    if (options) options.hidden = !enabled;
    if (permission) permission.hidden = !enabled;
    const reminderInputs = Array.from(control.querySelectorAll('input[name="reminders"]'));
    if (enabled && !reminderInputs.some((input) => input.checked)) {
      const fallback = reminderInputs.find((input) => input.value === DEFAULT_REMINDER_VALUE) || reminderInputs[reminderInputs.length - 1];
      if (fallback) fallback.checked = true;
    }
    reminderInputs.forEach((input) => {
      input.disabled = !enabled;
      if (!enabled) input.checked = false;
      input.closest(".reminder-chip")?.classList.toggle("active", enabled && input.checked);
    });
    if (syncSwitch) {
      syncSwitch.hidden = !enabled;
      syncSwitch.classList.toggle("is-enabled", enabled && Boolean(syncInput?.checked));
    }
    if (syncInput) {
      syncInput.disabled = !enabled;
      if (!enabled) syncInput.checked = false;
    }
  }

  function targetSelect(name, selected, requireTarget = false) {
    const courseOptions = Object.values(appCache.courseByKey).map((course) => [targetKeyForCourse(course.courseKey), course.name]);
    const recurringOptions = state.recurringSchedules.map((item) => [targetKeyForRecurring(item.id), item.title]);
    const customOptions = state.customSchedules.map((item) => [targetKeyForCustom(item.id), item.title]);
    const groups = [
      !requireTarget ? { label: "", options: [["", "独立项目"]] } : null,
      courseOptions.length ? { label: "课程", options: courseOptions } : null,
      recurringOptions.length ? { label: "常驻日程", options: recurringOptions } : null,
      !requireTarget && customOptions.length ? { label: "单次日程", options: customOptions } : null
    ].filter(Boolean);
    return internalOptionSelect(name, selected, groups, {
      title: requireTarget ? "选择对象" : "选择关联对象",
      placeholder: requireTarget ? "请选择对象" : "独立项目",
      required: requireTarget
    });
  }

  function internalOptionSelect(name, selected, groups = [], options = {}) {
    const flat = flattenInternalOptions(groups);
    const fallback = options.required ? flat[0]?.value || "" : "";
    const value = flat.some((item) => item.value === String(selected || "")) ? String(selected || "") : fallback;
    const label = flat.find((item) => item.value === value)?.label || options.placeholder || "请选择";
    const inputUi = templateInputUi();
    return `
      <span class="internal-select" ${inputUiAttrs("option", inputUi)} data-internal-select data-picker-title="${escapeAttr(options.title || "选择选项")}" data-placeholder="${escapeAttr(options.placeholder || "请选择")}">
        <input type="hidden" name="${escapeAttr(name)}" value="${escapeAttr(value)}" data-internal-select-value data-input-component="${escapeAttr(inputUi.variant)}" ${options.required ? "data-internal-required=\"true\"" : ""} />
        <button type="button" class="internal-select-button" data-internal-select-open data-input-ui-button aria-haspopup="dialog">
          <span data-internal-select-label>${escapeHtml(label)}</span>
          <b aria-hidden="true">›</b>
        </button>
        <span class="internal-select-source" hidden>
          ${flat.map((item) => `
            <button type="button" data-option-value="${escapeAttr(item.value)}" data-option-label="${escapeAttr(item.label)}" data-option-group="${escapeAttr(item.group)}">${escapeHtml(item.label)}</button>
          `).join("")}
        </span>
      </span>
    `;
  }

  function internalDateSelect(name, value, options = {}) {
    const normalized = validDate(value) ? value : options.optional ? "" : todayString();
    const inputUi = templateInputUi();
    const required = options.required === false || options.optional ? "" : " data-internal-required=\"true\"";
    const min = options.min ? ` data-date-min="${escapeAttr(options.min)}"` : "";
    const max = options.max ? ` data-date-max="${escapeAttr(options.max)}"` : "";
    const optional = options.optional ? ` data-date-optional="true"` : "";
    const ariaLabel = options.title || options.ariaLabel || "选择日期";
    return `
      <span class="internal-date" ${inputUiAttrs("date", inputUi)} data-internal-date data-picker-title="${escapeAttr(ariaLabel)}" data-placeholder="${escapeAttr(options.placeholder || "请选择日期")}">
        <input class="date-input internal-date-input" name="${escapeAttr(name)}" type="text" inputmode="none" tabindex="-1" readonly data-date-input data-input-component="${escapeAttr(inputUi.variant)}" value="${escapeAttr(normalized)}"${required}${min}${max}${optional} aria-label="${escapeAttr(ariaLabel)}" />
        <button type="button" class="internal-date-button" data-internal-date-open data-input-ui-button aria-haspopup="dialog" aria-label="${escapeAttr(`${ariaLabel}：${internalDateDisplay(normalized, options.placeholder || "请选择日期")}`)}">
          <span data-internal-date-label>${escapeHtml(internalDateDisplay(normalized, options.placeholder || "请选择日期"))}</span>
          <b aria-hidden="true">日</b>
        </button>
      </span>
    `;
  }

  function internalDateDisplay(value, placeholder = "请选择日期") {
    return validDate(value) ? pickerDateLabel(value) : placeholder;
  }

  function syncInternalDateLabel(input) {
    const wrapper = input?.closest?.("[data-internal-date]");
    if (!wrapper) return;
    const label = wrapper.querySelector("[data-internal-date-label]");
    if (label) label.textContent = internalDateDisplay(input.value, wrapper.dataset.placeholder || "请选择日期");
  }

  function flattenInternalOptions(groups = []) {
    return groups.flatMap((group) => {
      const groupLabel = String(group?.label || "");
      return (group?.options || []).map(([value, label]) => ({
        value: String(value ?? ""),
        label: String(label ?? value ?? ""),
        group: groupLabel
      }));
    });
  }

  function daySelect(selected) {
    return internalOptionSelect("dayIndex", String(Number(selected)), [
      { label: "星期", options: DAYS.map((day, index) => [String(index), `周${day}`]) }
    ], { title: "选择星期", required: true });
  }

  function groupCoursesByName(term) {
    const groups = new Map();
    for (const course of term.courses || []) {
      const key = `${course.name}|${course.teacher || ""}`;
      if (!groups.has(key)) {
        groups.set(key, {
          name: course.name,
          teacher: course.teacher || "",
          primary: course,
          courses: [],
          lines: []
        });
      }
      const group = groups.get(key);
      group.courses.push(course);
      if (course.scheduleText && !group.lines.includes(course.scheduleText)) group.lines.push(course.scheduleText);
    }
    return [...groups.values()].sort((a, b) => COLLATOR.compare(a.name, b.name));
  }

  function attachEvents() {
    document.addEventListener("click", handleClick);
    document.addEventListener("submit", handleSubmit);
    document.addEventListener("input", handleInput);
    document.addEventListener("change", handleChange);
    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("pointerdown", guardFloatingLayerEvent, true);
    document.addEventListener("wheel", guardFloatingLayerEvent, { passive: false, capture: true });
    document.addEventListener("touchmove", guardFloatingLayerEvent, { passive: false, capture: true });
    document.addEventListener("scroll", guardFloatingLayerEvent, true);
    document.addEventListener("selectstart", preventForegroundTextSelection, true);
    document.addEventListener("contextmenu", preventForegroundTextSelection, true);
    document.addEventListener("dragstart", preventForegroundTextSelection, true);
    document.addEventListener("selectionchange", clearForegroundTextSelection);
    document.addEventListener("pointerdown", handleFloatingPointerDown, true);
    document.addEventListener("pointerdown", handleSwipePointerDown, true);
    document.addEventListener("pointermove", handleSwipePointerMove, true);
    document.addEventListener("pointerup", finishSwipe, true);
    document.addEventListener("pointercancel", finishSwipe, true);
    document.addEventListener("scroll", markUserScrolling, { passive: true, capture: true });
    document.addEventListener("touchmove", markUserScrolling, { passive: true, capture: true });
    els.fileInput.addEventListener("change", () => {
      const file = els.fileInput.files && els.fileInput.files[0];
      if (file) handleFile(file);
      els.fileInput.value = "";
    });
    els.todayButton?.addEventListener("click", goToday);
    els.portalButton?.addEventListener("click", openAcademicPortal);
    els.settingsButton?.addEventListener("click", () => openModal("settings"));
  }

  function isEditableTextTarget(target) {
    if (!target) return false;
    const element = target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
    return Boolean(element?.closest?.("input,textarea,[contenteditable='true'],[contenteditable='plaintext-only']"));
  }

  function preventForegroundTextSelection(event) {
    if (isEditableTextTarget(event.target)) return;
    if (event.cancelable) event.preventDefault();
  }

  function clearForegroundTextSelection() {
    const selection = window.getSelection?.();
    if (!selection || selection.isCollapsed) return;
    if (isEditableTextTarget(selection.anchorNode) || isEditableTextTarget(selection.focusNode) || isEditableTextTarget(document.activeElement)) return;
    selection.removeAllRanges();
  }

  function goToday() {
    syncFocusToToday("manual");
    persist();
    scheduleRenderAll({ force: true });
  }

  function handleClick(event) {
    const optionButton = event.target.closest?.("[data-internal-select-open]");
    if (optionButton) {
      event.preventDefault();
      openOptionPicker(optionButton);
      return;
    }
    const pickerInput = pickerInputFromClick(event);
    if (pickerInput) {
      event.preventDefault();
      if (pickerInput.matches("[data-time-input]")) openTimePicker(pickerInput);
      if (pickerInput.matches("[data-date-input]")) openDatePicker(pickerInput);
      return;
    }
    const target = event.target.closest("[data-action]");
    if (!target) {
      if (!event.target.closest?.(".swipe-shell")) closeSwipeShells();
      return;
    }
    if (lastSwipeSuppressAt && Date.now() - lastSwipeSuppressAt < 180) {
      event.preventDefault();
      return;
    }
    if (!target.closest(".swipe-shell")) closeSwipeShells();
    const action = target.dataset.action;
    lastCommandAction = action;
    lastCommandAt = Date.now();
    window.YayaLayers?.registerRuntime?.("commands", {
      delegated: true,
      lastAction: action,
      lastActionAt: lastCommandAt
    });
    if (action === "close-modal") closeModal();
    if (action === "ack-guide") {
      const firstOpenGuide = state.modal === "guide" && state.modalData?.firstOpen === true;
      localStorage.setItem(GUIDE_ACK_KEY, "1");
      if (firstOpenGuide) closeModal();
      else openModal("settings");
    }
    if (action === "jump-today") goToday();
    if (action === "open-settings") openModal("settings");
    if (action === "open-account") openModal("account");
    if (action === "open-theme") openModal("theme");
    if (action === "open-custom-theme") openModal("custom-theme");
    if (action === "open-icon") openModal("icon");
    if (action === "open-guide") openModal("guide");
    if (action === "open-portal") openAcademicPortal(event);
    if (action === "request-reminder-permission") requestReminderPermission();
    if (action === "choose-file") els.fileInput.click();
    if (action === "clear-notice") {
      state.notice = "";
      persist();
      renderAll();
    }
    if (action === "shift-date") {
      syncFocusDate(addDays(state.focusDate, Number(target.dataset.delta || 0)));
      persist();
      scheduleRenderAll({ force: true });
    }
    if (action === "set-weekday") {
      const week = weekForDate(state.focusDate);
      syncFocusDate(dateForWeekDay(termStartForDate(state.focusDate), week, Number(target.dataset.dayIndex)));
      persist();
      scheduleRenderAll({ force: true });
    }
    if (action === "set-date-week") {
      const week = clamp(Number(target.dataset.week), 1, MAX_WEEK);
      const dayIndex = dateInfo(state.focusDate).dayIndex;
      syncFocusDate(dateForWeekDay(termStartForDate(state.focusDate), week, dayIndex));
      persist();
      scheduleRenderAll({ force: true });
    }
    if (action === "set-date-lookup-mode") {
      state.dateLookupMode = target.dataset.mode === "week" ? "week" : "date";
      persist();
      scheduleRenderAll({ force: true });
    }
    if (action === "toggle-recurring-week") {
      toggleRecurringWeek(target);
      return;
    }
    if (action === "open-courses") {
      const currentPage = currentCourseOverviewPage();
      if (state.courseOverviewPage !== currentPage) {
        state.courseOverviewPage = currentPage;
        persist({ immediate: true });
      }
      openModal("courses");
    }
    if (action === "set-course-overview-page") {
      const nextPage = normalizeCourseOverviewPage(target.dataset.termId || "");
      setOverviewPageMotion("courses", state.courseOverviewPage, nextPage, state.terms.map((term) => term.id));
      state.courseOverviewPage = nextPage;
      persist();
      renderModal();
    }
    if (action === "open-schedules") {
      state.scheduleOverviewPage = normalizeScheduleOverviewPage(state.scheduleOverviewPage);
      openModal("schedules");
    }
    if (action === "set-schedule-overview-page") {
      const nextPage = normalizeScheduleOverviewPage(target.dataset.page || "");
      setOverviewPageMotion("schedules", state.scheduleOverviewPage, nextPage, SCHEDULE_OVERVIEW_PAGES);
      state.scheduleOverviewPage = nextPage;
      persist();
      closeSwipeShells();
      renderModal();
    }
    if (action === "open-ddl") {
      if (target.dataset.ddlId) state.ddlView = "active";
      openModal("ddl", { id: target.dataset.ddlId || "" });
    }
    if (action === "set-ddl-view") {
      state.ddlView = target.dataset.view === "completed" ? "completed" : "active";
      persist();
      closeSwipeShells();
      renderModal();
    }
    if (action === "new-ddl") {
      state.ddlView = "active";
      openModal("ddl-form");
    }
    if (action === "edit-ddl") openModal("ddl-form", { id: target.dataset.id });
    if (action === "complete-ddl") completeDdl(target.dataset.id);
    if (action === "delete-ddl") deleteDdl(target.dataset.id);
    if (action === "delete-completed-ddl") deleteCompletedDdl(target.dataset.id);
    if (action === "clear-ddl-filter") {
      state.ddlDoneFilterQuery = "";
      state.ddlDoneFilterStart = "";
      state.ddlDoneFilterStartTime = "";
      state.ddlDoneFilterEnd = "";
      state.ddlDoneFilterEndTime = "";
      state.ddlView = "completed";
      persist();
      renderModal();
    }
    if (action === "new-schedule") openModal("schedule-form");
    if (action === "edit-schedule") openModal("schedule-form", { id: target.dataset.id });
    if (action === "delete-schedule") deleteSchedule(target.dataset.id);
    if (action === "new-recurring") openModal("recurring-form");
    if (action === "edit-recurring") openModal("recurring-form", { id: target.dataset.id });
    if (action === "delete-recurring") deleteRecurring(target.dataset.id);
    if (action === "open-specials") {
      state.specialOverviewPage = normalizeSpecialOverviewPage(state.specialOverviewPage);
      openModal("specials");
    }
    if (action === "set-special-overview-page") {
      const nextPage = normalizeSpecialOverviewPage(target.dataset.page || "");
      setOverviewPageMotion("specials", state.specialOverviewPage, nextPage, SPECIAL_OVERVIEW_PAGES);
      state.specialOverviewPage = nextPage;
      persist();
      closeSwipeShells();
      renderModal();
    }
    if (action === "new-special") openModal("special-form");
    if (action === "edit-special") openModal("special-form", { id: target.dataset.id });
    if (action === "cancel-special" || action === "delete-special") cancelSpecialChange(target.dataset.id);
    if (action === "open-detail") {
      openModal("detail", {
        type: target.dataset.detailType || "",
        id: target.dataset.detailId || ""
      });
    }
    if (action === "delete-note") deleteNote(target.dataset.noteKey, target.dataset.id);
    if (action === "view-note") openModal("note-view", { noteKey: target.dataset.noteKey, id: target.dataset.id, returnType: target.dataset.returnType || "", returnId: target.dataset.returnId || "" });
    if (action === "edit-note") openModal("note-form", { noteKey: target.dataset.noteKey, id: target.dataset.id, returnType: target.dataset.returnType || "", returnId: target.dataset.returnId || "" });
    if (action === "return-note-detail") returnToNoteOwner();
  }

  function pickerInputFromClick(event) {
    const dateButton = event.target.closest?.("[data-internal-date-open]");
    if (dateButton) return dateButton.closest("[data-internal-date]")?.querySelector("[data-date-input]") || null;
    const direct = event.target.closest?.("[data-time-input],[data-date-input]");
    if (direct) return direct;
    const shell = event.target.closest?.(".picker-input-shell,.time-field,.date-field,.date-picker,.internal-date");
    return shell?.querySelector?.("[data-time-input],[data-date-input]") || null;
  }

  function handleInput(event) {
    captureModalFormDraft(event.target);
    if (event.target.closest?.("#recurringForm") && event.target.name === "weeks") {
      syncRecurringWeekLink(event.target, "weeks");
    }
    const editor = event.target.closest?.("[data-custom-theme-editor]");
    if (editor) syncCustomThemeEditorInput(event.target, editor);
  }

  function handleChange(event) {
    captureModalFormDraft(event.target);
    const editor = event.target.closest?.("[data-custom-theme-editor]");
    if (editor) syncCustomThemeEditorInput(event.target, editor);
    const reminderControl = event.target.closest?.("[data-reminder-control]");
    if (reminderControl) {
      syncReminderControl(reminderControl);
      const asksNotification = (event.target.name === "reminderEnabled" && event.target.checked)
        || (event.target.name === "reminders" && event.target.checked);
      if (asksNotification) requestReminderPermission({ interactive: false, silent: true });
    }
    if (event.target.closest?.("#termImportForm") && (event.target.name === "termYear" || event.target.name === "termKind")) {
      syncTermStartFromSelection(event.target.closest("#termImportForm"));
    }
    if (event.target.closest?.("#recurringForm") && ["weeks", "dayIndex", "startDate", "endDate"].includes(event.target.name)) {
      syncRecurringWeekLink(event.target, event.target.name);
    }
    if (event.target.matches?.("[data-date-input]")) {
      syncInternalDateLabel(event.target);
    }
    if (event.target.id === "focusDateInput") {
      syncFocusDate(validDate(event.target.value) ? event.target.value : todayString());
      persist();
      scheduleRenderAll({ force: true });
    }
    if (event.target.id === "dateLookupDate") {
      syncFocusDate(validDate(event.target.value) ? event.target.value : state.focusDate);
      persist();
      scheduleRenderAll({ force: true });
    }
    if (event.target.id === "dateLookupWeek") {
      const week = clamp(Number(event.target.value), 1, MAX_WEEK);
      const dayIndex = dateInfo(state.focusDate).dayIndex;
      syncFocusDate(dateForWeekDay(state.termStart || DEFAULT_TERM_START, week, dayIndex));
      persist();
      scheduleRenderAll({ force: true });
    }
    if (event.target.id === "ddlDoneStart") {
      state.ddlDoneFilterStart = validDate(event.target.value) ? event.target.value : "";
      state.ddlView = "completed";
      persist();
      renderModal();
    }
    if (event.target.id === "ddlDoneStartTime") {
      state.ddlDoneFilterStartTime = validTimeInputValue(event.target.value);
      state.ddlView = "completed";
      persist();
      renderModal();
    }
    if (event.target.id === "ddlDoneEnd") {
      state.ddlDoneFilterEnd = validDate(event.target.value) ? event.target.value : "";
      state.ddlView = "completed";
      persist();
      renderModal();
    }
    if (event.target.id === "ddlDoneEndTime") {
      state.ddlDoneFilterEndTime = validTimeInputValue(event.target.value);
      state.ddlView = "completed";
      persist();
      renderModal();
    }
    if (event.target.id === "ddlDoneQuery") {
      state.ddlDoneFilterQuery = normalizeText(event.target.value);
      state.ddlView = "completed";
      persist();
      renderModal();
    }
  }

  function syncTermStartFromSelection(form) {
    const yearValue = normalizeAcademicYearValue(form?.elements?.termYear?.value);
    const kind = normalizeTermKind(form?.elements?.termKind?.value) || "autumn";
    const firstYear = Number(yearValue.slice(0, 4));
    const start = suggestedTermStart(firstYear, firstYear + 1, kind);
    const preview = form?.querySelector?.("[data-term-selection-preview]");
    if (preview) preview.textContent = buildTermLabelFromSelection(yearValue, kind);
    const input = form?.elements?.termStart;
    if (!input || !validDate(start)) return;
    input.value = start;
    input.setAttribute("value", start);
    syncInternalDateLabel(input);
  }

  function toggleRecurringWeek(button) {
    const form = button?.closest?.("#recurringForm");
    const input = form?.elements?.weeks;
    if (!form || !input) return;
    const oldWeeks = recurringWeeksFromForm(form);
    const week = clamp(Number(button.dataset.week), 1, MAX_WEEK);
    const selected = new Set(oldWeeks);
    if (selected.has(week)) selected.delete(week);
    else selected.add(week);
    setRecurringWeeksValue(form, [...selected].sort((a, b) => a - b));
    syncRecurringFromWeeks(form, oldWeeks);
    captureModalFormDraft(input);
  }

  function syncRecurringWeekLink(target, source) {
    const form = target?.closest?.("#recurringForm");
    if (!form) return;
    if (source === "startDate" || source === "endDate") {
      syncRecurringFromDates(form, source);
    } else {
      const oldWeeks = parseWeeks(form.querySelector("[data-recurring-week-picker]")?.dataset.lastWeeks || "");
      syncRecurringFromWeeks(form, oldWeeks, { forceDates: source === "dayIndex" });
    }
    captureModalFormDraft(target);
  }

  function syncRecurringFromWeeks(form, oldWeeks = [], options = {}) {
    const weeks = recurringWeeksFromForm(form);
    setRecurringWeeksValue(form, weeks);
    const bounds = recurringWeekBounds(weeks);
    if (!bounds) {
      setRecurringDateValue(form.elements.startDate, "");
      setRecurringDateValue(form.elements.endDate, "");
      return;
    }
    const oldBounds = recurringWeekBounds(oldWeeks);
    const boundaryChanged = options.forceDates
      || !oldBounds
      || oldBounds.start !== bounds.start
      || oldBounds.end !== bounds.end;
    if (!boundaryChanged) return;
    const dayIndex = clamp(Number(form.elements.dayIndex?.value), 0, 6);
    const range = recurringDateRangeFromWeeks(weeks, dayIndex, recurringFormTermStart(form));
    setRecurringDateValue(form.elements.startDate, range.startDate);
    setRecurringDateValue(form.elements.endDate, range.endDate);
  }

  function syncRecurringFromDates(form, source) {
    const startInput = form.elements.startDate;
    const endInput = form.elements.endDate;
    const startDate = validDate(startInput?.value) ? startInput.value : "";
    const endDate = validDate(endInput?.value) ? endInput.value : "";
    const referenceDate = startDate || endDate;
    if (!referenceDate) return;
    const termStart = termStartForDate(referenceDate);
    setRecurringTermStart(form, termStart);
    if (source === "startDate" || (!startDate && source === "endDate")) {
      setRecurringDayValue(form, dateInfo(referenceDate).dayIndex);
    }
    const startWeek = recurringWeekForDate(startDate || endDate, termStart);
    const endWeek = recurringWeekForDate(endDate || startDate, termStart);
    const first = Math.min(startWeek, endWeek);
    const last = Math.max(startWeek, endWeek);
    const weeks = Array.from({ length: last - first + 1 }, (_, index) => first + index);
    setRecurringWeeksValue(form, weeks);
    const dayIndex = clamp(Number(form.elements.dayIndex?.value), 0, 6);
    const range = recurringDateRangeFromWeeks(weeks, dayIndex, termStart);
    setRecurringDateValue(startInput, range.startDate);
    setRecurringDateValue(endInput, range.endDate);
  }

  function recurringWeeksFromForm(form) {
    return parseWeeks(form?.elements?.weeks?.value || "");
  }

  function recurringWeekBounds(weeks = []) {
    const sorted = [...new Set(weeks.map(Number).filter((week) => week > 0 && week <= MAX_WEEK))].sort((a, b) => a - b);
    if (!sorted.length) return null;
    return { start: sorted[0], end: sorted[sorted.length - 1] };
  }

  function recurringDateRangeFromWeeks(weeks = [], dayIndex = 0, termStart = state.termStart || DEFAULT_TERM_START) {
    const bounds = recurringWeekBounds(weeks);
    if (!bounds) return { startDate: "", endDate: "" };
    const safeDay = clamp(Number(dayIndex), 0, 6);
    const safeTermStart = validDate(termStart) ? termStart : state.termStart || DEFAULT_TERM_START;
    return {
      startDate: dateForWeekDay(safeTermStart, bounds.start, safeDay),
      endDate: dateForWeekDay(safeTermStart, bounds.end, safeDay)
    };
  }

  function recurringWeekForDate(date, termStart = state.termStart || DEFAULT_TERM_START) {
    if (!validDate(date)) return 1;
    const safeTermStart = validDate(termStart) ? termStart : state.termStart || DEFAULT_TERM_START;
    const diff = Math.floor((toDate(date) - toDate(safeTermStart)) / 86400000);
    return clamp(Math.floor(diff / 7) + 1, 1, MAX_WEEK);
  }

  function recurringFormTermStart(form) {
    const value = form?.elements?.termStart?.value;
    return validDate(value) ? value : state.termStart || DEFAULT_TERM_START;
  }

  function setRecurringTermStart(form, value) {
    const input = form?.elements?.termStart;
    if (!input || !validDate(value)) return;
    input.value = value;
    input.setAttribute("value", value);
  }

  function setRecurringWeeksValue(form, weeks = []) {
    const input = form?.elements?.weeks;
    if (!input) return;
    const normalized = [...new Set(weeks.map(Number).filter((week) => week > 0 && week <= MAX_WEEK))].sort((a, b) => a - b);
    const value = formatWeeks(normalized);
    input.value = value;
    input.setAttribute("value", value);
    const picker = form.querySelector("[data-recurring-week-picker]");
    if (picker) picker.dataset.lastWeeks = value;
    form.querySelector("[data-recurring-week-summary]")?.replaceChildren(document.createTextNode(value ? `第 ${value} 周` : "请选择周次"));
    const selected = new Set(normalized);
    form.querySelectorAll("[data-week]").forEach((chip) => {
      const active = selected.has(Number(chip.dataset.week));
      chip.classList.toggle("active", active);
      chip.setAttribute("aria-pressed", active ? "true" : "false");
    });
    keepActiveChipVisible(form.querySelector(".recurring-week-rail"), ".recurring-week-chip.active");
  }

  function setRecurringDateValue(input, value) {
    if (!input) return;
    const normalized = validDate(value) ? value : "";
    input.value = normalized;
    input.setAttribute("value", normalized);
    syncInternalDateLabel(input);
  }

  function setRecurringDayValue(form, value) {
    const input = form?.elements?.dayIndex;
    const next = String(clamp(Number(value), 0, 6));
    if (!input) return;
    input.value = next;
    input.setAttribute("value", next);
    const select = input.closest("[data-internal-select]");
    const label = select?.querySelector("[data-internal-select-label]");
    const option = Array.from(select?.querySelectorAll("[data-option-value]") || []).find((node) => node.dataset.optionValue === next);
    label?.replaceChildren(document.createTextNode(option?.dataset.optionLabel || `周${DAYS[Number(next)]}`));
    select?.classList.toggle("has-value", true);
  }

  function handleKeydown(event) {
    if (event.key !== "Escape") return;
    if (timePickerInput) {
      hideTimePicker();
      return;
    }
    if (datePickerInput) {
      hideDatePicker();
      return;
    }
    if (optionPickerSource) {
      hideOptionPicker();
      return;
    }
    if (state.modal) closeModal();
  }

  function handleFloatingPointerDown(event) {
    if (activePickerPanel()) return;
    const card = event.target.closest?.(".modal-card");
    if (!card || !state.modal) return;
    if (!isEventInTopFloatingLayer(event)) return;
    const layer = nextFloatingLayer();
    state.modalLayer = layer;
    card.dataset.floatingLayer = String(layer);
    card.dataset.floatingTop = "true";
    els.modalRoot.style.zIndex = String(layer);
  }

  function handleSwipePointerDown(event) {
    const shell = event.target.closest?.(".swipe-shell");
    if (!shell) {
      closeSwipeShells();
      return;
    }
    swipeGesture = {
      shell,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    };
    shell.querySelector(".swipe-content")?.classList.add("is-touching");
  }

  function handleSwipePointerMove(event) {
    if (!swipeGesture || event.pointerId !== swipeGesture.pointerId) return;
    const dx = event.clientX - swipeGesture.startX;
    const dy = event.clientY - swipeGesture.startY;
    const horizontal = Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy) * 1.25;
    if (!horizontal) return;
    swipeGesture.moved = true;
    if (dx < -28) {
      closeSwipeShells(swipeGesture.shell);
      swipeGesture.shell.classList.add("is-open");
    }
    if (dx > 24) swipeGesture.shell.classList.remove("is-open");
    event.preventDefault();
  }

  function finishSwipe(event) {
    if (!swipeGesture || event.pointerId !== swipeGesture.pointerId) return;
    swipeGesture.shell.querySelector(".swipe-content")?.classList.remove("is-touching");
    if (swipeGesture.moved) lastSwipeSuppressAt = Date.now();
    swipeGesture = null;
  }

  function closeSwipeShells(except) {
    document.querySelectorAll(".swipe-shell.is-open").forEach((shell) => {
      if (shell !== except) shell.classList.remove("is-open");
    });
  }

  function formatPickerTime(hour = timePickerHour, minute = timePickerMinute) {
    return `${pad(clamp(Number(hour), 0, 23))}:${pad(clamp(Number(minute), 0, 59))}`;
  }

  function ensureTimePickerPanel() {
    if (!els.timePickerPanel) {
      const panel = document.createElement("section");
      panel.id = "timePickerPanel";
      panel.className = "picker-backdrop";
      panel.hidden = true;
      panel.setAttribute("aria-hidden", "true");
      panel.innerHTML = `
        <div class="picker-card time-picker-card" role="dialog" aria-modal="true" aria-labelledby="timePickerTitle">
          <div class="modal-head picker-head">
            <h2 id="timePickerTitle">选择时间</h2>
            <button type="button" data-picker-close="time">返回</button>
          </div>
          <div class="time-picker-display">
            <span>当前</span>
            <strong id="timePickerValue">08:00</strong>
          </div>
          <div class="time-picker-grid" aria-label="时间选择">
            <div class="time-picker-column">
              <span>时</span>
              <div id="timePickerHourList" class="time-picker-list"></div>
            </div>
            <div class="time-picker-column">
              <span>分</span>
              <div id="timePickerMinuteList" class="time-picker-list"></div>
            </div>
          </div>
          <div class="picker-actions">
            <button type="button" data-picker-close="time">取消</button>
            <button type="button" class="primary" data-picker-confirm="time">确认</button>
          </div>
        </div>
      `;
      document.body.appendChild(panel);
      els.timePickerPanel = panel;
      els.timePickerTitle = panel.querySelector("#timePickerTitle");
      els.timePickerValue = panel.querySelector("#timePickerValue");
      els.timePickerHourList = panel.querySelector("#timePickerHourList");
      els.timePickerMinuteList = panel.querySelector("#timePickerMinuteList");
      panel.addEventListener("click", handleTimePickerClick);
    }
    return els.timePickerPanel;
  }

  function openTimePicker(input) {
    if (!input || input.disabled) return;
    ensureTimePickerPanel();
    hideDatePicker();
    timePickerInput = input;
    markPickerInput("time", input);
    const fallback = input.dataset.timeFallback || (input.name === "endTime" ? "09:40" : "08:00");
    const value = normalizeTime(input.value || fallback);
    const [hour, minute] = value.split(":").map(Number);
    timePickerHour = clamp(hour, 0, 23);
    const nearestMinute = Math.round(clamp(minute, 0, 59) / 5) * 5;
    timePickerMinute = clamp(nearestMinute === 60 ? 55 : nearestMinute, 0, 55);
    if (els.timePickerTitle) els.timePickerTitle.textContent = input.closest("label")?.querySelector("span")?.textContent || "选择时间";
    renderTimePicker({ scrollActive: true });
    showPickerLayer(els.timePickerPanel);
  }

  function renderTimePicker(options = {}) {
    ensureTimePickerPanel();
    setCachedHtml(els.timePickerHourList, TIME_PICKER_HOURS.map((hour) => `
      <button type="button" data-time-hour="${hour}">${pad(hour)}</button>
    `).join(""), "time-hours");
    setCachedHtml(els.timePickerMinuteList, TIME_PICKER_MINUTES.map((minute) => `
      <button type="button" data-time-minute="${minute}">${pad(minute)}</button>
    `).join(""), "time-minutes");
    updateTimePickerSelection(options);
  }

  function updateTimePickerSelection(options = {}) {
    setText(els.timePickerValue, formatPickerTime());
    setPickerListActive(els.timePickerHourList, "data-time-hour", timePickerHour);
    setPickerListActive(els.timePickerMinuteList, "data-time-minute", timePickerMinute);
    if (options.scrollActive) scrollPickerActiveOptions("time");
  }

  function handleTimePickerClick(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.target === els.timePickerPanel || event.target.closest("[data-picker-close='time']")) {
      hideTimePicker();
      return;
    }
    const hourButton = event.target.closest("[data-time-hour]");
    if (hourButton) {
      timePickerHour = Number(hourButton.dataset.timeHour);
      updateTimePickerSelection();
      return;
    }
    const minuteButton = event.target.closest("[data-time-minute]");
    if (minuteButton) {
      timePickerMinute = Number(minuteButton.dataset.timeMinute);
      updateTimePickerSelection();
      return;
    }
    if (event.target.closest("[data-picker-confirm='time']")) commitTimePicker();
  }

  function commitTimePicker() {
    commitPickerInput("time", timePickerInput, formatPickerTime());
    hideTimePicker();
  }

  function hideTimePicker() {
    if (!els.timePickerPanel) return;
    clearPickerInputMark("time", timePickerInput);
    timePickerInput = null;
    hidePickerLayer(els.timePickerPanel);
  }

  function ensureDatePickerPanel() {
    if (!els.datePickerPanel) {
      const panel = document.createElement("section");
      panel.id = "datePickerPanel";
      panel.className = "picker-backdrop";
      panel.hidden = true;
      panel.setAttribute("aria-hidden", "true");
      panel.innerHTML = `
        <div class="picker-card date-picker-card original-date-picker-card" role="dialog" aria-modal="true" aria-labelledby="datePickerTitle">
          <div class="card-head picker-head">
            <h2 id="datePickerTitle">选择日期</h2>
            <button class="return-button" type="button" data-picker-close="date" aria-label="返回">←</button>
          </div>
          <div class="date-picker-display">
            <span>当前</span>
            <strong id="datePickerValue">${escapeHtml(pickerDateLabel(todayString()))}</strong>
          </div>
          <div class="date-picker-grid" aria-label="日期选择">
            <div class="date-picker-column">
              <span>年</span>
              <div id="datePickerYearList" class="date-picker-list"></div>
            </div>
            <div class="date-picker-column">
              <span>月</span>
              <div id="datePickerMonthList" class="date-picker-list"></div>
            </div>
            <div class="date-picker-column">
              <span>日</span>
              <div id="datePickerDayList" class="date-picker-list"></div>
            </div>
          </div>
          <div class="picker-actions prompt-actions date-picker-actions">
            <button type="button" class="prompt-cancel" data-picker-close="date">取消</button>
            <button type="button" class="prompt-cancel date-picker-clear" data-picker-clear="date" hidden>清空</button>
            <button type="button" class="prompt-confirm primary" data-picker-confirm="date">确认</button>
          </div>
        </div>
      `;
      document.body.appendChild(panel);
      els.datePickerPanel = panel;
      els.datePickerTitle = panel.querySelector("#datePickerTitle");
      els.datePickerValue = panel.querySelector("#datePickerValue");
      els.datePickerYearList = panel.querySelector("#datePickerYearList");
      els.datePickerMonthList = panel.querySelector("#datePickerMonthList");
      els.datePickerDayList = panel.querySelector("#datePickerDayList");
      els.datePickerClearButton = panel.querySelector("[data-picker-clear='date']");
      panel.addEventListener("click", handleDatePickerClick);
    }
    return els.datePickerPanel;
  }

  function openDatePicker(input) {
    if (!input || input.disabled) return;
    ensureDatePickerPanel();
    hideTimePicker();
    datePickerInput = input;
    markPickerInput("date", input);
    setDatePickerFromDate(validDateInputValue(input.value) || datePickerBound(input, "dateMin") || state.focusDate || todayString());
    if (els.datePickerTitle) els.datePickerTitle.textContent = input.closest("label")?.querySelector("span")?.textContent || input.getAttribute("aria-label") || "选择日期";
    renderDatePicker({ scrollActive: true });
    showPickerLayer(els.datePickerPanel);
  }

  function renderDatePicker(options = {}) {
    ensureDatePickerPanel();
    setDatePickerParts(datePickerYear, datePickerMonth, datePickerDay);
    const years = datePickerYears();
    setCachedHtml(els.datePickerYearList, years.map((year) => `
      <button type="button" data-date-year="${year}">${year}</button>
    `).join(""), `date-years:${years[0]}:${years[years.length - 1]}:${datePickerBound(datePickerInput, "dateMin")}:${datePickerBound(datePickerInput, "dateMax")}`);
    setCachedHtml(els.datePickerMonthList, Array.from({ length: 12 }, (_, index) => index + 1).map((month) => `
      <button type="button" data-date-month="${month}">${pad(month)}</button>
    `).join(""), "date-months");
    setCachedHtml(els.datePickerDayList, Array.from({ length: daysInMonth(datePickerYear, datePickerMonth) }, (_, index) => index + 1).map((day) => `
      <button type="button" data-date-day="${day}">${pad(day)}</button>
    `).join(""), `date-days:${datePickerYear}:${datePickerMonth}:${daysInMonth(datePickerYear, datePickerMonth)}`);
    updateDatePickerSelection(options);
  }

  function updateDatePickerSelection(options = {}) {
    const value = formatPickerDate();
    setText(els.datePickerValue, pickerDateLabel(value));
    if (els.datePickerClearButton) els.datePickerClearButton.hidden = datePickerInput?.dataset?.dateOptional !== "true";
    setPickerListActive(els.datePickerYearList, "data-date-year", datePickerYear);
    setPickerListActive(els.datePickerMonthList, "data-date-month", datePickerMonth);
    setPickerListActive(els.datePickerDayList, "data-date-day", datePickerDay);
    if (options.scrollActive) scrollPickerActiveOptions("date");
  }

  function handleDatePickerClick(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.target === els.datePickerPanel || event.target.closest("[data-picker-close='date']")) {
      hideDatePicker();
      return;
    }
    const yearButton = event.target.closest("[data-date-year]");
    if (yearButton) {
      setDatePickerParts(Number(yearButton.dataset.dateYear), datePickerMonth, datePickerDay);
      renderDatePicker();
      return;
    }
    const monthButton = event.target.closest("[data-date-month]");
    if (monthButton) {
      setDatePickerParts(datePickerYear, Number(monthButton.dataset.dateMonth), datePickerDay);
      renderDatePicker();
      return;
    }
    const dayButton = event.target.closest("[data-date-day]");
    if (dayButton) {
      setDatePickerParts(datePickerYear, datePickerMonth, Number(dayButton.dataset.dateDay));
      updateDatePickerSelection();
      return;
    }
    if (event.target.closest("[data-picker-clear='date']")) clearDatePicker();
    if (event.target.closest("[data-picker-confirm='date']")) commitDatePicker();
  }

  function commitDatePicker() {
    commitPickerInput("date", datePickerInput, formatPickerDate());
    hideDatePicker();
  }

  function clearDatePicker() {
    const input = currentPickerInput("date", datePickerInput);
    if (input?.dataset?.dateOptional === "true") commitPickerInput("date", input, "");
    hideDatePicker();
  }

  function hideDatePicker() {
    if (!els.datePickerPanel) return;
    clearPickerInputMark("date", datePickerInput);
    datePickerInput = null;
    hidePickerLayer(els.datePickerPanel);
  }

  function markPickerInput(kind, input) {
    if (!kind || !input) return;
    document.querySelectorAll(`[data-picker-active="${kind}"]`).forEach((node) => {
      delete node.dataset.pickerActive;
    });
    const selector = kind === "date" ? "[data-date-input]" : "[data-time-input]";
    const scope = els.modalRoot?.contains(input) ? els.modalRoot : document;
    const peers = Array.from(scope.querySelectorAll(selector));
    pickerInputBindings[kind] = {
      selector,
      modal: state.modal || "",
      id: input.id || "",
      name: input.name || "",
      index: peers.indexOf(input)
    };
    input.dataset.pickerActive = kind;
  }

  function currentPickerInput(kind, input) {
    if (input?.isConnected) return input;
    const marked = document.querySelector(`[data-picker-active="${kind}"]`);
    if (marked) return marked;
    const binding = pickerInputBindings[kind];
    if (!binding) return null;
    const scope = binding.modal && els.modalRoot?.dataset?.modalKind === binding.modal ? els.modalRoot : document;
    const candidates = Array.from(scope.querySelectorAll(binding.selector));
    if (binding.id) {
      const byId = candidates.find((node) => node.id === binding.id);
      if (byId) return byId;
    }
    if (binding.name) {
      const byName = candidates.find((node) => node.name === binding.name);
      if (byName) return byName;
    }
    return candidates[binding.index] || candidates[0] || null;
  }

  function commitPickerInput(kind, input, value) {
    const target = currentPickerInput(kind, input);
    if (!target || target.disabled) return false;
    target.value = value;
    target.setAttribute("value", value);
    if (kind === "date") syncInternalDateLabel(target);
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function clearPickerInputMark(kind, input) {
    const activeInput = currentPickerInput(kind, input);
    if (activeInput) delete activeInput.dataset.pickerActive;
    delete pickerInputBindings[kind];
  }

  function ensureOptionPickerPanel() {
    if (!els.optionPickerPanel) {
      const panel = document.createElement("section");
      panel.id = "optionPickerPanel";
      panel.className = "picker-backdrop option-picker-backdrop";
      panel.hidden = true;
      panel.setAttribute("aria-hidden", "true");
      panel.innerHTML = `
        <div class="picker-card option-picker-card" role="dialog" aria-modal="true" aria-labelledby="optionPickerTitle">
          <div class="modal-head picker-head">
            <h2 id="optionPickerTitle">选择选项</h2>
            <button type="button" data-picker-close="option">返回</button>
          </div>
          <div class="option-picker-display">
            <span>当前</span>
            <strong id="optionPickerValue">请选择</strong>
          </div>
          <div id="optionPickerList" class="option-picker-list"></div>
        </div>
      `;
      document.body.appendChild(panel);
      els.optionPickerPanel = panel;
      els.optionPickerTitle = panel.querySelector("#optionPickerTitle");
      els.optionPickerValue = panel.querySelector("#optionPickerValue");
      els.optionPickerList = panel.querySelector("#optionPickerList");
      panel.addEventListener("click", handleOptionPickerClick);
    }
    return els.optionPickerPanel;
  }

  function openOptionPicker(button) {
    const source = button?.closest?.("[data-internal-select]");
    if (!source) return;
    ensureOptionPickerPanel();
    hideTimePicker();
    hideDatePicker();
    optionPickerSource = source;
    markOptionPickerSource(source);
    if (els.optionPickerTitle) els.optionPickerTitle.textContent = source.dataset.pickerTitle || "选择选项";
    renderOptionPicker({ scrollActive: true });
    showPickerLayer(els.optionPickerPanel);
  }

  function renderOptionPicker(options = {}) {
    ensureOptionPickerPanel();
    const sourceOptions = internalSelectOptions(optionPickerSource);
    const selected = optionPickerSource?.querySelector("[data-internal-select-value]")?.value || "";
    const selectedLabel = sourceOptions.find((item) => item.value === selected)?.label || optionPickerSource?.dataset.placeholder || "请选择";
    setText(els.optionPickerValue, selectedLabel);
    let lastGroup = "";
    const html = sourceOptions.length ? sourceOptions.map((item) => {
      const group = item.group || "";
      const head = group && group !== lastGroup ? `<p class="option-picker-group">${escapeHtml(group)}</p>` : "";
      lastGroup = group || lastGroup;
      return `
        ${head}
        <button type="button" class="${item.value === selected ? "active" : ""}" data-option-picker-value="${escapeAttr(item.value)}">
          <strong>${escapeHtml(item.label)}</strong>
        </button>
      `;
    }).join("") : `<div class="empty-state">暂无可选项</div>`;
    setCachedHtml(els.optionPickerList, html, `option-picker:${sourceOptions.map((item) => `${item.group}:${item.value}:${item.label}`).join("|")}:${selected}`);
    if (options.scrollActive) scrollPickerActiveOptions("option");
  }

  function internalSelectOptions(source) {
    return Array.from(source?.querySelectorAll?.("[data-option-value]") || []).map((node) => ({
      value: node.dataset.optionValue || "",
      label: node.dataset.optionLabel || node.textContent.trim(),
      group: node.dataset.optionGroup || ""
    }));
  }

  function handleOptionPickerClick(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.target === els.optionPickerPanel || event.target.closest("[data-picker-close='option']")) {
      hideOptionPicker();
      return;
    }
    const button = event.target.closest("[data-option-picker-value]");
    if (button) setInternalSelectValue(button.dataset.optionPickerValue || "");
  }

  function setInternalSelectValue(value) {
    const source = currentOptionPickerSource();
    if (!source) return;
    const input = source.querySelector("[data-internal-select-value]");
    const labelNode = source.querySelector("[data-internal-select-label]");
    const option = internalSelectOptions(source).find((item) => item.value === value);
    if (!input || !option) return;
    input.value = option.value;
    input.setAttribute("value", option.value);
    labelNode?.replaceChildren(document.createTextNode(option.label));
    source.classList.toggle("has-value", Boolean(option.value));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    hideOptionPicker();
  }

  function hideOptionPicker() {
    if (!els.optionPickerPanel) return;
    clearOptionPickerSource();
    optionPickerSource = null;
    hidePickerLayer(els.optionPickerPanel);
  }

  function markOptionPickerSource(source) {
    document.querySelectorAll("[data-picker-active='option']").forEach((node) => {
      delete node.dataset.pickerActive;
    });
    const scope = els.modalRoot?.contains(source) ? els.modalRoot : document;
    const peers = Array.from(scope.querySelectorAll("[data-internal-select]"));
    const input = source.querySelector("[data-internal-select-value]");
    optionPickerBinding = {
      modal: state.modal || "",
      name: input?.name || "",
      index: peers.indexOf(source)
    };
    source.dataset.pickerActive = "option";
  }

  function currentOptionPickerSource() {
    if (optionPickerSource?.isConnected) return optionPickerSource;
    const marked = document.querySelector("[data-picker-active='option']");
    if (marked) return marked;
    const scope = optionPickerBinding?.modal && els.modalRoot?.dataset?.modalKind === optionPickerBinding.modal ? els.modalRoot : document;
    const candidates = Array.from(scope.querySelectorAll("[data-internal-select]"));
    if (optionPickerBinding?.name) {
      const byName = candidates.find((node) => node.querySelector("[data-internal-select-value]")?.name === optionPickerBinding.name);
      if (byName) return byName;
    }
    return candidates[optionPickerBinding?.index] || candidates[0] || null;
  }

  function clearOptionPickerSource() {
    const source = currentOptionPickerSource();
    if (source) delete source.dataset.pickerActive;
    optionPickerBinding = null;
  }

  function showPickerLayer(panel) {
    if (!panel) return;
    panel.hidden = false;
    panel.setAttribute("aria-hidden", "false");
    panel.style.zIndex = String(nextFloatingLayer());
    document.body.classList.add("has-picker-layer");
    syncInteractionLock();
    window.YayaLayers?.registerRuntime?.("interaction", { pickerLayer: true });
  }

  function hidePickerLayer(panel) {
    if (!panel) return;
    panel.hidden = true;
    panel.setAttribute("aria-hidden", "true");
    if (!timePickerInput && !datePickerInput && !optionPickerSource) document.body.classList.remove("has-picker-layer");
    syncInteractionLock();
  }

  function syncInteractionLock() {
    const pickerPanel = activePickerPanel();
    const pickerLocked = Boolean(pickerPanel);
    const locked = Boolean(state.modal || pickerLocked);
    if (locked) {
      window.clearTimeout(userScrollTimer);
      scrollStateLastAt = 0;
      document.body.classList.remove("is-user-scrolling");
    }
    document.body.classList.toggle("is-interaction-locked", locked);
    document.body.classList.toggle("has-floating-card", locked);
    document.body.classList.toggle("has-picker-layer", pickerLocked);
    document.body.dataset.floatingDepth = String((state.modal ? 1 : 0) + (pickerLocked ? 1 : 0));
    window.YayaLayers?.registerRuntime?.("interaction", {
      locked,
      pickerLayer: pickerLocked,
      optionPickerLayer: Boolean(optionPickerSource),
      layerLock: "full-stack",
      floatingDepth: Number(document.body.dataset.floatingDepth || 0),
      layerGuardActive: floatingLayerGuardActive,
      formDraftCache: Boolean(state.modalData?.__draftForm),
      builtInInputUi: true,
      builtInInputPatch: INPUT_UI_PATCH_VERSION,
      modal: state.modal || ""
    });
  }

  function activePickerPanel() {
    if (optionPickerSource && els.optionPickerPanel && !els.optionPickerPanel.hidden) return els.optionPickerPanel;
    if (datePickerInput && els.datePickerPanel && !els.datePickerPanel.hidden) return els.datePickerPanel;
    if (timePickerInput && els.timePickerPanel && !els.timePickerPanel.hidden) return els.timePickerPanel;
    return null;
  }

  function hasActiveFloatingLayer() {
    return Boolean(state.modal || activePickerPanel());
  }

  function isEventInTopFloatingLayer(event) {
    const target = event.target;
    const pickerPanel = activePickerPanel();
    if (pickerPanel) return pickerPanel.contains(target);
    if (state.modal && !els.modalRoot.hidden) return els.modalRoot.contains(target);
    return true;
  }

  function guardFloatingLayerEvent(event) {
    if (!hasActiveFloatingLayer() || isEventInTopFloatingLayer(event)) return;
    floatingLayerGuardActive = true;
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    window.clearTimeout(userScrollTimer);
    document.body.classList.remove("is-user-scrolling", "is-rendering");
    scrollStateLastAt = 0;
    window.setTimeout(() => {
      floatingLayerGuardActive = false;
    }, 0);
  }

  function setPickerListActive(list, attribute, value) {
    if (!list) return;
    const next = String(value);
    list.querySelectorAll(`button[${attribute}]`).forEach((button) => {
      button.classList.toggle("active", button.getAttribute(attribute) === next);
    });
  }

  function scrollPickerActiveOptions(type) {
    window.requestAnimationFrame(() => {
      if (type === "time") {
        els.timePickerHourList?.querySelector(".active")?.scrollIntoView({ block: "center" });
        els.timePickerMinuteList?.querySelector(".active")?.scrollIntoView({ block: "center" });
        return;
      }
      if (type === "option") {
        els.optionPickerList?.querySelector(".active")?.scrollIntoView({ block: "center" });
        return;
      }
      els.datePickerYearList?.querySelector(".active")?.scrollIntoView({ block: "center" });
      els.datePickerMonthList?.querySelector(".active")?.scrollIntoView({ block: "center" });
      els.datePickerDayList?.querySelector(".active")?.scrollIntoView({ block: "center" });
    });
  }

  function handleSubmit(event) {
    const form = event.target;
    if (!form.id) return;
    event.preventDefault();
    if (form.id === "accountForm") saveAccount(form);
    if (form.id === "themeForm") saveTheme(form);
    if (form.id === "customThemeForm") saveCustomTheme(form);
    if (form.id === "iconForm") saveIcon(form);
    if (form.id === "ddlForm") saveDdl(form);
    if (form.id === "scheduleForm") saveSchedule(form);
    if (form.id === "recurringForm") saveRecurring(form);
    if (form.id === "specialForm") saveSpecial(form);
    if (form.id === "noteForm") saveNote(form);
    if (form.id === "noteEditForm") saveEditedNote(form);
    if (form.id === "termImportForm") confirmTermImport(form);
  }

  function openModal(name, data = {}) {
    state.modal = name;
    state.modalData = data;
    state.modalLayer = nextFloatingLayer();
    renderModal();
  }

  function closeModal() {
    state.modal = "";
    state.modalData = {};
    state.modalLayer = 0;
    renderModal();
  }

  function saveAccount(form) {
    const data = new FormData(form);
    const username = normalizeText(data.get("username"));
    const password = String(data.get("password") || "");
    state.accountUsername = username;
    localStorage.setItem(ACCOUNT_USERNAME_KEY, username);
    const saved = window.YayaPlatform?.savePortalAccount(username, password) || false;
    commit(saved ? "账户已保存，门户导入会自动填充" : "已保存账号名；当前环境不支持保存密码");
    openModal("settings");
  }

  function saveTheme(form) {
    activateRenderBusy(420);
    const data = new FormData(form);
    const selectedTheme = data.get("theme");
    if (!selectedTheme) {
      commit("自定义主题保持不变", { immediate: true, skipCache: true, skipNative: true });
      openModal("settings");
      return;
    }
    state.theme = normalizeThemeId(selectedTheme);
    state.themeAccent = "";
    state.themeVars = {};
    commit("预设主题已保存并应用", { immediate: true, skipCache: true, skipNative: true });
    openModal("settings");
  }

  function saveCustomTheme(form) {
    activateRenderBusy(420);
    const draft = customThemeDraftFromEditor(form);
    state.theme = "classicCustom";
    state.themeAccent = "";
    state.themeVars = sanitizeThemeVars(customThemeVarsFromDraft(draft));
    commit("自定义主题已保存并应用", { immediate: true, skipCache: true, skipNative: true });
    openModal("theme");
  }

  function saveIcon(form) {
    const data = new FormData(form);
    state.appIcon = normalizeIconId(data.get("appIcon"));
    window.YayaPlatform?.setLauncherIcon(state.appIcon);
    commit("图标设置已保存", { immediate: true, skipCache: true, skipNative: true });
    openModal("settings");
  }

  function saveDdl(form) {
    const data = new FormData(form);
    const editing = state.modalData.id ? state.ddls.find((item) => item.id === state.modalData.id) : null;
    const targetKey = String(data.get("targetKey") || "");
    const target = targetTitle(targetKey);
    const ddl = normalizeDdl({
      id: editing?.id || newId("ddl"),
      date: data.get("date"),
      time: data.get("time"),
      topic: normalizeText(data.get("topic")) || target || "DDL",
      content: normalizeText(data.get("content")),
      targetKey,
      reminders: reminderValuesFromForm(data)
    });
    if (!ddl) return;
    if (editing) {
      state.ddls = state.ddls.map((item) => item.id === editing.id ? ddl : item);
    } else {
      state.ddls.push(ddl);
    }
    clearModalFormDraft();
    commit("DDL 已保存");
    openModal("ddl");
  }

  function saveSchedule(form) {
    const data = new FormData(form);
    const editing = state.modalData.id ? state.customSchedules.find((item) => item.id === state.modalData.id) : null;
    const schedule = normalizeCustomSchedule({
      id: editing?.id || newId("sch"),
      date: data.get("date"),
      startTime: data.get("startTime"),
      endTime: data.get("endTime"),
      title: normalizeText(data.get("title")),
      place: normalizeText(data.get("place")),
      reminders: reminderValuesFromForm(data),
      syncToDdl: data.get("syncToDdl") === "1"
    });
    if (!schedule.title) return;
    if (editing) {
      state.customSchedules = state.customSchedules.map((item) => item.id === editing.id ? schedule : item);
    } else {
      state.customSchedules.push(schedule);
    }
    syncFocusDate(schedule.date);
    clearModalFormDraft();
    commit("日程已保存");
    openModal("schedules");
  }

  function saveRecurring(form) {
    const data = new FormData(form);
    const editing = state.modalData.id ? state.recurringSchedules.find((item) => item.id === state.modalData.id) : null;
    const item = normalizeRecurringSchedule({
      id: editing?.id || newId("rec"),
      title: normalizeText(data.get("title")),
      place: normalizeText(data.get("place")),
      dayIndex: Number(data.get("dayIndex")),
      weeks: parseWeeks(data.get("weeks")),
      startTime: data.get("startTime"),
      endTime: data.get("endTime"),
      startDate: data.get("startDate"),
      endDate: data.get("endDate"),
      termStart: validDate(data.get("termStart")) ? data.get("termStart") : state.termStart || DEFAULT_TERM_START
    });
    if (!item.title || !item.weeks.length) return;
    if (editing) {
      state.recurringSchedules = state.recurringSchedules.map((schedule) => schedule.id === editing.id ? item : schedule);
    } else {
      state.recurringSchedules.push(item);
    }
    clearModalFormDraft();
    commit("常驻日程已保存");
    openModal("schedules");
  }

  function saveSpecial(form) {
    const data = new FormData(form);
    const editing = state.modalData.id ? state.specialChanges.find((item) => item.id === state.modalData.id) : null;
    const item = normalizeSpecialChange({
      id: editing?.id || newId("sp"),
      targetKey: data.get("targetKey"),
      action: data.get("action"),
      sourceDate: data.get("sourceDate"),
      date: data.get("date"),
      startTime: data.get("startTime"),
      endTime: data.get("endTime"),
      place: normalizeText(data.get("place")),
      note: normalizeText(data.get("note"))
    });
    if (!item) return;
    if (editing) {
      state.specialChanges = state.specialChanges.map((change) => change.id === editing.id ? item : change);
    } else {
      state.specialChanges.push(item);
    }
    clearModalFormDraft();
    commit("特殊变更已保存");
    closeModal();
  }

  function saveNote(form) {
    const data = new FormData(form);
    const noteKey = String(data.get("noteKey") || "");
    const text = normalizeText(data.get("note"));
    if (!noteKey || !text) return;
    if (!state.notes[noteKey]) state.notes[noteKey] = [];
    state.notes[noteKey].push({ id: newId("note"), text, createdAt: new Date().toISOString() });
    clearModalFormDraft();
    commit("备注已保存");
    openModal("detail", state.modalData);
  }

  function saveEditedNote(form) {
    const data = new FormData(form);
    const noteKey = String(data.get("noteKey") || "");
    const id = String(data.get("id") || "");
    const text = normalizeText(data.get("note"));
    const detail = noteReturnData();
    if (!noteKey || !id || !state.notes[noteKey]) return;
    if (!text) {
      state.notes[noteKey] = state.notes[noteKey].filter((note) => note.id !== id);
      if (!state.notes[noteKey].length) delete state.notes[noteKey];
      commit("备注已删除");
      if (detail.type) openModal("detail", detail);
      return;
    }
    state.notes[noteKey] = state.notes[noteKey].map((note) => (
      note.id === id ? { ...note, text, updatedAt: new Date().toISOString() } : note
    ));
    clearModalFormDraft();
    commit("备注已更新");
    if (detail.type) openModal("detail", detail);
    else closeModal();
  }

  function deleteNote(noteKey, id) {
    const detail = state.modal === "detail" && state.modalData?.type
      ? { type: state.modalData.type, id: state.modalData.id || "" }
      : detailDataFromNoteKey(noteKey);
    if (!state.notes[noteKey]) return;
    state.notes[noteKey] = state.notes[noteKey].filter((note) => note.id !== id);
    if (!state.notes[noteKey].length) delete state.notes[noteKey];
    commit("备注已删除");
    if (detail.type) openModal("detail", detail);
    else renderModal();
  }

  function completeDdl(id) {
    const ddl = appCache.activeDdls.find((item) => item.id === id);
    if (!ddl) return;
    state.completedDdls = [
      ...state.completedDdls.filter((item) => item.id !== id),
      normalizeCompletedDdl({ ...ddl, completedAt: new Date().toISOString() })
    ].filter(Boolean);
    commit("DDL 已完成");
    openModal("ddl");
  }

  function deleteDdl(id) {
    const ddl = appCache.activeDdls.find((item) => item.id === id);
    if (ddl?.sourceType === "schedule") {
      state.customSchedules = state.customSchedules.map((item) => item.id === ddl.sourceId ? { ...item, syncToDdl: false } : item);
    } else {
      state.ddls = state.ddls.filter((item) => item.id !== id);
    }
    state.completedDdls = state.completedDdls.filter((item) => item.id !== id);
    commit("DDL 已删除");
    openModal("ddl");
  }

  function deleteCompletedDdl(id) {
    state.completedDdls = state.completedDdls.filter((item) => item.id !== id);
    state.ddlView = "completed";
    commit("完成记录已删除");
    openModal("ddl");
  }

  function deleteSchedule(id) {
    state.customSchedules = state.customSchedules.filter((item) => item.id !== id);
    state.completedDdls = state.completedDdls.filter((item) => item.sourceId !== id && item.id !== targetKeyForCustom(id));
    delete state.notes[noteKeyForCustom(id)];
    commit("日程已删除");
    openModal("schedules");
  }

  function deleteRecurring(id) {
    state.recurringSchedules = state.recurringSchedules.filter((item) => item.id !== id);
    state.ddls = state.ddls.filter((item) => item.targetKey !== targetKeyForRecurring(id));
    delete state.notes[noteKeyForRecurring(id)];
    commit("常驻日程已删除");
    openModal("schedules");
  }

  function cancelSpecialChange(id) {
    const removed = state.specialChanges.find((item) => item.id === id);
    if (!removed) return;
    state.specialChanges = state.specialChanges.filter((item) => item.id !== id);
    commit("已取消这条特殊变更，原日程会恢复显示");
    openModal("specials");
  }

  function openAcademicPortal(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const now = Date.now();
    if (now - lastPortalOpenAt < PORTAL_OPEN_COOLDOWN_MS) return;
    lastPortalOpenAt = now;
    syncPortalImportUiBridge();
    closeModal();
    if (window.YayaPlatform?.openAcademicPortal()) {
      state.notice = "已打开教务门户，登录后使用页面按钮导入课表或考试";
      renderStatus();
      window.YayaLayers?.registerRuntime?.("portal", {
        openedAt: lastPortalOpenAt,
        cooldown: PORTAL_OPEN_COOLDOWN_MS,
        source: event?.type || "direct"
      });
      return;
    }
    state.notice = "当前是网页预览环境，无法自动抓取门户；请在手机 App 内使用教务导入，或先用文件导入";
    renderStatus();
  }

  function pullNativeImport() {
    const raw = window.YayaPlatform?.takeImportedPage();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const imports = Array.isArray(parsed) ? parsed : [parsed];
      imports.filter(Boolean).forEach((payload) => applyAcademicImport(payload));
    } catch (error) {
      state.notice = "教务导入失败";
      renderAll();
    }
  }

  function scheduleNativeImportPull() {
    pullNativeImport();
    window.setTimeout(pullNativeImport, 180);
    window.setTimeout(pullNativeImport, 640);
  }

  function applyAcademicImport(payload) {
    activateRenderBusy(820);
    const html = payload.html || "";
    const text = payload.text || "";
    const importKind = normalizeAcademicImportKind(payload.kind);
    if (importKind === "exam") {
      const exams = parseExamSchedulesFromHtml(html, text);
      if (!exams.length) {
        state.notice = "未识别到考试安排，请打开考试安排页面后再导入";
        renderAll();
        return;
      }
      state.examSchedules = exams;
      commit(`已导入考试安排：${exams.length} 项`);
      return;
    }
    let rows = parseHtmlSchedule(html);
    if (!rows.length) rows = parseDelimitedSchedule(text);
    if (!rows.length) {
      state.notice = "未识别到课程，请确认已打开“我的课表”并检索完成";
      renderAll();
      return;
    }
    const sourceName = payload.title || "教务系统同步";
    if (payload.confirmedTerm) {
      const payloadLabel = normalizeText(payload.termLabel);
      const placeholderLabel = payloadLabel === "新课表" || payloadLabel === "未识别学期";
      const label = payloadLabel && !placeholderLabel ? payloadLabel : sourceName || "课表";
      const labelInfo = parseImportedTermText(label);
      const termStart = validDate(payload.termStart)
        ? String(payload.termStart)
        : (labelInfo?.startDate || state.termStart || DEFAULT_TERM_START);
      const confirmedInfo = labelInfo || emptyTermInfo();
      commitImportedTerm(rows, sourceName, { ...confirmedInfo, label, startDate: termStart, termStart, detected: false });
      return;
    }
    pendingImport = {
      rows,
      sourceName,
      rawText: `${payload.title || ""}\n${text}\n${html}`
    };
    openModal("term-import");
  }

  function normalizeAcademicImportKind(value) {
    const kind = String(value || "").toLowerCase();
    if (kind === "exam" || kind === "exams") return "exam";
    return "course";
  }

  async function handleFile(file) {
    try {
      activateRenderBusy(820);
      const text = decodeFile(await file.arrayBuffer());
      const rows = /<table\b/i.test(text) ? parseHtmlSchedule(text) : parseDelimitedSchedule(text);
      if (!rows.length) throw new Error("未识别到课程");
      pendingImport = {
        rows,
        sourceName: file.name,
        rawText: text
      };
      openModal("term-import");
    } catch (error) {
      state.notice = "文件导入失败：当前支持网页型 .xls、HTML、CSV 或 TXT";
      renderAll();
    }
  }

  function confirmTermImport(form) {
    if (!pendingImport) return;
    activateRenderBusy(900);
    const data = new FormData(form);
    const termStart = validDate(data.get("termStart")) ? String(data.get("termStart")) : DEFAULT_TERM_START;
    const label = buildTermLabelFromSelection(data.get("termYear"), data.get("termKind"));
    const labelInfo = parseImportedTermText(label);
    const meta = { ...(labelInfo || emptyTermInfo()), label, startDate: termStart, termStart, detected: false };
    commitImportedTerm(pendingImport.rows, pendingImport.sourceName, meta);
    pendingImport = null;
    closeModal();
  }

  function commitImportedTerm(rows, sourceName, meta) {
    const termStart = validDate(meta?.termStart || meta?.startDate) ? String(meta.termStart || meta.startDate) : DEFAULT_TERM_START;
    const term = buildTermFromRows(rows, sourceName, termStart, meta || {});
    state.terms = [...state.terms.filter((item) => item.id !== term.id), term].sort((a, b) => a.termStart.localeCompare(b.termStart));
    state.activeTermId = term.id;
    state.termStart = term.termStart;
    state.sourceName = sourceName;
    syncActiveTerm();
    commit(`课表已导入：${term.courses.length} 门课程`, { immediate: true });
  }

  function decodeFile(buffer) {
    const bytes = new Uint8Array(buffer);
    if (bytes[0] === 0xd0 && bytes[1] === 0xcf) throw new Error("binary-xls");
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) throw new Error("xlsx");
    const labels = bytes[0] === 0xff && bytes[1] === 0xfe
      ? ["utf-16le", "gb18030", "gbk", "utf-8"]
      : ["gb18030", "gbk", "utf-8", "utf-16le"];
    let best = "";
    let score = -Infinity;
    for (const label of labels) {
      try {
        const text = new TextDecoder(label).decode(buffer);
        const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
        const bad = (text.match(/\ufffd/g) || []).length;
        const current = chinese * 2 - bad * 12;
        if (current > score) {
          score = current;
          best = text;
        }
      } catch (error) {}
    }
    return best;
  }

  function parseHtmlSchedule(text) {
    if (!text) return [];
    const doc = new DOMParser().parseFromString(text, "text/html");
    const rows = [];
    for (const table of doc.querySelectorAll("table")) {
      const tableRows = [...table.querySelectorAll("tr")]
        .map((tr) => [...tr.querySelectorAll("th,td")].map((cell) => normalizeText(cell.textContent)))
        .filter((row) => row.some(Boolean));
      rows.push(...parseListScheduleTable(tableRows));
      rows.push(...parseMatrixScheduleTable(tableRows));
    }
    return dedupeRows(rows);
  }

  function parseListScheduleTable(tableRows) {
    const rows = [];
    const headerIndex = tableRows.findIndex((row) => /课程|科目/.test(row.join(" ")) && /时间|地点|上课/.test(row.join(" ")));
    if (headerIndex < 0) return rows;
    const headers = tableRows[headerIndex];
    const index = detectCourseColumns(headers);
    for (const cells of tableRows.slice(headerIndex + 1)) {
      const item = {
        name: cells[index.name] || "",
        teacher: cells[index.teacher] || "",
        credit: cells[index.credit] || "",
        scheduleText: courseScheduleTextFromCells(cells, headers, index)
      };
      if (item.name && hasCourseSchedule(item.scheduleText)) rows.push(item);
    }
    return rows;
  }

  function parseMatrixScheduleTable(tableRows) {
    const rows = [];
    const headerIndex = tableRows.findIndex((row) => row.map(dayNameFromHeader).filter(Boolean).length >= 2);
    if (headerIndex < 0) return rows;
    const headers = tableRows[headerIndex];
    const days = headers.map(dayNameFromHeader);
    for (const cells of tableRows.slice(headerIndex + 1)) {
      const period = periodRangeFromText(cells.slice(0, 3).join(" ")) || periodRangeFromText(cells.join(" "));
      if (!period) continue;
      for (let index = 0; index < cells.length; index += 1) {
        const day = days[index];
        if (!day) continue;
        const raw = normalizeText(cells[index]);
        if (!raw || /^(无|空|--|-|—)$/.test(raw) || raw === day) continue;
        for (const block of splitCourseCell(raw)) {
          const item = matrixCourseRowFromCell(block, day, period);
          if (item) rows.push(item);
        }
      }
    }
    return rows;
  }

  function dayNameFromHeader(value) {
    const text = normalizeText(value);
    const match = text.match(/周?([一二三四五六日天])/);
    return match ? (match[1] === "天" ? "日" : match[1]) : "";
  }

  function periodRangeFromText(value) {
    const text = normalizeText(value);
    let match = text.match(/(?:第)?\s*(\d{1,2})\s*[~～—–－至到-]\s*(\d{1,2})\s*(?:节|小节|课时)?/);
    if (match) return { start: match[1], end: match[2] };
    match = text.match(/(?:第)?\s*(\d{1,2})\s*(?:节|小节|课时)/);
    if (match) return { start: match[1], end: match[1] };
    return null;
  }

  function splitCourseCell(value) {
    return String(value || "")
      .split(/\s*(?:-{3,}|={3,}|_{3,}|；|;)\s*/g)
      .map(normalizeText)
      .filter(Boolean);
  }

  function matrixCourseRowFromCell(value, day, period) {
    const text = normalizeText(value);
    if (!text || /^(无|空|--|-|—)$/.test(text)) return null;
    const weeks = weeksTextFromCell(text) || "1-16";
    const teacher = teacherFromCell(text);
    const place = placeFromCell(text);
    const name = courseNameFromCell(text);
    if (!name || /^(教师|老师|地点|教室|周次|节次|时间)$/.test(name)) return null;
    const periodText = period.start === period.end ? period.start : `${period.start}-${period.end}`;
    const scheduleText = normalizeImportedScheduleText(`${weeks}周 周${day} [${periodText}] ${place}`);
    if (!hasCourseSchedule(scheduleText)) return null;
    return { name, teacher, credit: "", scheduleText };
  }

  function weeksTextFromCell(value) {
    const text = normalizeText(value);
    const match = text.match(/(?:第)?\s*([0-9,，\s单双]+(?:\s*[~～—–－至到-]\s*[0-9,，\s单双]+)?(?:\s*[,，]\s*[0-9,，\s单双]+)*)\s*周/);
    if (!match) return "";
    return normalizeText(match[1]).replace(/[~～—–－至到]/g, "-").replace(/，/g, ",");
  }

  function teacherFromCell(value) {
    const text = normalizeText(value);
    const match = text.match(/(?:教师|老师|任课教师)[:：]?\s*([^\s,，;；]+)/);
    return match ? match[1] : "";
  }

  function placeFromCell(value) {
    const text = normalizeText(value);
    const labelled = text.match(/(?:地点|教室|上课地点|校区)[:：]?\s*([^,，;；]+)/);
    if (labelled) return normalizeText(labelled[1]);
    const room = text.match(/([\u4e00-\u9fffA-Za-z]*\d{2,}[A-Za-z0-9-]*|[\u4e00-\u9fffA-Za-z]+(?:楼|馆|教室|校区)[^,，;；\s]*)/);
    return room ? normalizeText(room[1]) : "";
  }

  function courseNameFromCell(value) {
    let text = normalizeText(value)
      .replace(/(?:第)?\s*[0-9,，\s单双]+(?:\s*[~～—–－至到-]\s*[0-9,，\s单双]+)?\s*周/g, " ")
      .replace(/周[一二三四五六日天]/g, " ")
      .replace(/(?:第)?\s*\d{1,2}\s*[~～—–－至到-]\s*\d{1,2}\s*(?:节|小节|课时)?/g, " ")
      .replace(/(?:第)?\s*\d{1,2}\s*(?:节|小节|课时)/g, " ")
      .replace(/(?:教师|老师|任课教师|地点|教室|上课地点|校区)[:：]?\s*[^,，;；]+/g, " ");
    text = normalizeText(text).split(/[,，;；]/)[0];
    return text.slice(0, 80);
  }

  function parseDelimitedSchedule(text) {
    const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    const delimiter = lines[0].includes("\t") ? "\t" : ",";
    const headers = lines[0].split(delimiter).map(normalizeText);
    const index = detectCourseColumns(headers);
    const rows = lines.slice(1).map((line) => {
      const cells = line.split(delimiter).map(normalizeText);
      return {
        name: cells[index.name] || "",
        teacher: cells[index.teacher] || "",
        credit: cells[index.credit] || "",
        scheduleText: courseScheduleTextFromCells(cells, headers, index)
      };
    }).filter((row) => row.name && hasCourseSchedule(row.scheduleText));
    return dedupeRows(rows);
  }

  function detectCourseColumns(headers) {
    const find = (words, fallback) => {
      const index = headers.findIndex((header) => words.some((word) => header.includes(word)));
      return index >= 0 ? index : fallback;
    };
    return {
      name: find(["课程名称", "课程名", "课程", "科目"], 0),
      teacher: find(["任课教师", "教师"], 4),
      credit: find(["学分"], 2),
      schedule: find(["上课时间", "时间、地点", "时间地点", "地点", "上课"], 5)
    };
  }

  function dedupeRows(rows) {
    const seen = new Set();
    return rows.filter((row) => {
      const key = [row.name, row.teacher, row.credit, row.scheduleText].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function courseScheduleTextFromCells(cells, headers = [], index = {}) {
    const direct = normalizeImportedScheduleText(cells[index.schedule] || "");
    if (hasCourseSchedule(direct)) return direct;
    const find = (words) => headers.findIndex((header) => words.some((word) => header.includes(word)));
    const week = cells[find(["周次", "周数", "起止周", "上课周"])] || "";
    const day = cells[find(["星期", "周几", "上课星期"])] || "";
    const period = cells[find(["节次", "节数", "上课节"])] || "";
    const place = cells[find(["地点", "教室", "校区"])] || "";
    const weekText = week && /周/.test(week) ? week : week ? `${week}周` : "";
    const assembled = normalizeImportedScheduleText([weekText, day, period, place].filter(Boolean).join(" "));
    if (hasCourseSchedule(assembled)) return assembled;
    return normalizeImportedScheduleText(cells.join(" "));
  }

  function normalizeImportedScheduleText(value) {
    return normalizeText(value)
      .replace(/星期/g, "周")
      .replace(/第\s*([0-9,\-，\s单双]+)\s*周/g, "$1周")
      .replace(/第\s*(\d{1,2})\s*[~～—–－至到-]\s*(\d{1,2})\s*节/g, "[$1-$2]")
      .replace(/(\d{1,2})\s*[~～—–－至到-]\s*(\d{1,2})\s*节/g, "[$1-$2]")
      .replace(/第\s*(\d{1,2})\s*节/g, "[$1]")
      .replace(/(\d{1,2})\s*节/g, "[$1]");
  }

  function hasCourseSchedule(value) {
    const text = normalizeImportedScheduleText(value);
    return /[0-9,\-，\s单双]+周\s*(?:周)?[一二三四五六日天]\s*\[\d{1,2}(?:-\d{1,2})?\]/.test(text)
      || /周[一二三四五六日天]\s*\[\d{1,2}(?:-\d{1,2})?\].{0,50}[0-9,\-，\s单双]+周/.test(text);
  }

  function buildTermFromRows(rows, sourceName, termStart, termInfo = {}) {
    const id = termInfo.id || termIdFromInfo(termInfo, termStart);
    const label = termInfo.label || sourceName || `开学 ${termStart}`;
    const courses = rows.map((row, index) => {
      const parsed = parseCourseName(row.name);
      const rawCourseKey = `${parsed.code || index}:${parsed.name}`;
      return {
        id: `${id}-c${index}`,
        termId: id,
        termStart,
        termLabel: label,
        code: parsed.code,
        name: parsed.name,
        rawCourseKey,
        courseKey: `${id}::${rawCourseKey}`,
        teacher: normalizeText(row.teacher),
        credit: normalizeText(row.credit),
        scheduleText: normalizeText(row.scheduleText)
      };
    });
    const events = courses.flatMap((course) => parseCourseEvents(course));
    return {
      id,
      label,
      kind: termInfo.kind || "",
      termStart,
      sourceName,
      rows,
      courses,
      events
    };
  }

  function hydrateTerm(record) {
    if (!record || !Array.isArray(record.rows)) return null;
    return buildTermFromRows(record.rows, record.sourceName || record.label || "课表", record.termStart || DEFAULT_TERM_START, {
      id: record.id,
      label: record.label,
      kind: record.kind || "",
      startDate: record.termStart || DEFAULT_TERM_START
    });
  }

  function parseCourseEvents(course) {
    const events = [];
    const text = normalizeImportedScheduleText(course.scheduleText);
    const appendEvents = (weeksText, day, startText, endText, placeText) => {
      const weeks = parseWeeks(weeksText);
      const dayIndex = DAY_NAME.get(day);
      const start = Number(startText);
      const end = Number(endText || startText);
      const place = normalizeText(placeText);
      if (!weeks.length || dayIndex === undefined || !start || !end) return;
      for (const week of weeks) {
        const date = dateForWeekDay(course.termStart, week, dayIndex);
        events.push({
          id: `${course.id}-${week}-${dayIndex}-${start}-${end}`,
          type: "course",
          detailType: "course",
          detailId: course.courseKey,
          targetKey: targetKeyForCourse(course.courseKey),
          noteKey: noteKeyForCourse(course.courseKey),
          courseKey: course.courseKey,
          title: course.name,
          name: course.name,
          teacher: course.teacher,
          place,
          week,
          dayIndex,
          start,
          end,
          startTime: periodClock(start, "start"),
          endTime: periodClock(end, "end"),
          timeText: `${periodClock(start, "start")}-${periodClock(end, "end")}`,
          typeLabel: "课程",
          meta: `${place || "地点未填"} · ${course.teacher || "教师未填"}`,
          date,
          termId: course.termId
        });
      }
    };
    const pattern = /([0-9,\-，\s单双]+)周\s*(?:周)?([一二三四五六日天])\s*\[(\d{1,2})(?:-(\d{1,2}))?\]\s*([^,，;；]*)/g;
    let match;
    while ((match = pattern.exec(text))) {
      appendEvents(match[1], match[2], match[3], match[4], match[5]);
    }
    const dayFirstPattern = /周([一二三四五六日天])\s*\[(\d{1,2})(?:-(\d{1,2}))?\]\s*([0-9,\-，\s单双]+)周\s*([^,，;；]*)/g;
    while ((match = dayFirstPattern.exec(text))) {
      appendEvents(match[4], match[1], match[2], match[3], match[5]);
    }
    return events;
  }

  function parseExamSchedulesFromHtml(htmlText, plainText) {
    const exams = [];
    if (/<table\b/i.test(htmlText || "")) {
      const doc = new DOMParser().parseFromString(htmlText, "text/html");
      for (const table of doc.querySelectorAll("table")) {
        const rows = [...table.querySelectorAll("tr")]
          .map((tr) => [...tr.querySelectorAll("td,th")].map((cell) => normalizeText(cell.textContent)))
          .filter((row) => row.some(Boolean));
        const headerIndex = rows.findIndex((row) => /考试|课程|科目/.test(row.join(" ")) && /日期|时间|考场|地点/.test(row.join(" ")));
        if (headerIndex < 0) continue;
        const headers = rows[headerIndex];
        const find = (words) => headers.findIndex((header) => words.some((word) => header.includes(word)));
        const nameIndex = find(["课程名称", "课程", "科目", "考试名称", "名称"]);
        const dateIndex = find(["考试日期", "日期"]);
        const timeIndex = find(["考试时间", "时间"]);
        const placeIndex = find(["考试地点", "地点", "考场", "教室"]);
        for (const row of rows.slice(headerIndex + 1)) {
          const title = row[nameIndex] || "";
          const combined = `${row[dateIndex] || ""} ${row[timeIndex] || ""} ${row.join(" ")}`;
          const date = parseDateValue(combined);
          if (!title || !date) continue;
          const parsedTime = parseTimeRange(combined);
          exams.push(normalizeExamSchedule({
            id: newId("exam"),
            date,
            title,
            place: row[placeIndex] || "",
            startTime: parsedTime.startTime,
            endTime: parsedTime.endTime
          }));
        }
      }
    }
    if (!exams.length && plainText) {
      const lines = plainText.split(/\r?\n/).map(normalizeText).filter(Boolean);
      lines.forEach((line, index) => {
        const date = parseDateValue(line);
        if (!date) return;
        const parsedTime = parseTimeRange(line);
        exams.push(normalizeExamSchedule({
          id: newId("exam"),
          date,
          title: lines[index - 1] || "考试",
          place: lines[index + 1] || "",
          startTime: parsedTime.startTime,
          endTime: parsedTime.endTime
        }));
      });
    }
    return exams.filter(Boolean);
  }

  function buildTermInfo(firstYear, secondYear, termText) {
    return buildDetectedTermInfo(firstYear, secondYear, termText);
  }

  function importedTermKind(termText) {
    const text = normalizeText(termText);
    if (/夏|暑|第三|第\s*[三3]|三\s*学期|16|03|3\s*学期/.test(text)) return "summer";
    if (/春|下|第二|第\s*[二2]|二\s*学期|2\s*学期|12/.test(text)) return "spring";
    if (/秋|上|第一|第\s*[一1]|一\s*学期|1\s*学期|01/.test(text)) return "autumn";
    return "";
  }

  function buildDetectedTermInfo(firstYear, secondYear, termText) {
    const kind = importedTermKind(termText);
    const kindLabel = kind === "spring" ? "春季学期" : kind === "autumn" ? "秋季学期" : kind === "summer" ? "夏季学期" : "";
    return {
      label: kindLabel ? `${firstYear}-${secondYear}学年${kindLabel}` : `${firstYear}-${secondYear}学年`,
      kind,
      startDate: suggestedTermStart(Number(firstYear), Number(secondYear), kind),
      detected: true
    };
  }

  function parseImportedTermCode(firstYear, secondYear, code, zfCode = false) {
    const value = normalizeText(code);
    if (value === "1" || value === "01" || (zfCode && value === "3")) return buildDetectedTermInfo(firstYear, secondYear, "第一学期");
    if (value === "2" || value === "02" || value === "12") return buildDetectedTermInfo(firstYear, secondYear, "第二学期");
    if (value === "3" || value === "03" || value === "16") return buildDetectedTermInfo(firstYear, secondYear, "夏季");
    return null;
  }

  function parseTermFieldValue(firstYear, rawTerm, zfCode = false) {
    const secondYear = String(Number(firstYear) + 1);
    const value = normalizeText(rawTerm);
    const code = value.match(/^(12|16|0?[123])$/)?.[1];
    if (code) return parseImportedTermCode(firstYear, secondYear, code, zfCode);
    if (importedTermKind(value)) return buildDetectedTermInfo(firstYear, secondYear, value);
    return null;
  }

  function parseZfTermFields(rawText) {
    const content = normalizeText(rawText);
    if (!content) return null;
    const termToken = "(12|16|0?[123]|第?\\s*[一二三123]\\s*学期|[上下]学期|春季|秋季|夏季|[上下春秋夏暑](?:\\s*学期)?)";
    let match = content.match(new RegExp("(?:xnm|xndm|xn|学年)[^\\d]{0,24}(20\\d{2}).{0,120}(?:xqm|xqdm|xq|学期)[^\\d一二三上下春秋夏暑]{0,24}" + termToken, "i"));
    if (match) return parseTermFieldValue(match[1], match[2], true);
    match = content.match(new RegExp("(?:xqm|xqdm|xq|学期)[^\\d一二三上下春秋夏暑]{0,24}" + termToken + ".{0,120}(?:xnm|xndm|xn|学年)[^\\d]{0,24}(20\\d{2})", "i"));
    if (match) return parseTermFieldValue(match[2], match[1], true);
    const yearMatch = content.match(/(?:xnm|xndm|xn|学年)[^\d]{0,24}(20\d{2})/i);
    const termMatch = content.match(new RegExp("(?:xqm|xqdm|xq|学期)[^\\d一二三上下春秋夏暑]{0,24}" + termToken, "i"));
    if (!yearMatch || !termMatch) return null;
    return parseTermFieldValue(yearMatch[1], termMatch[1], true);
  }

  function parseStrictZfTermFields(rawText) {
    const content = normalizeText(rawText);
    if (!content) return null;
    const yearField = "(?:xnm|xndm|xn|year|academicYear)";
    const termField = "(?:xqm|xqdm|xq|semester|term)";
    const termToken = "(12|16|0?[123]|第?\\s*[一二三123]\\s*学期|[上下]学期|春季|秋季|夏季|[上下春秋夏暑](?:\\s*学期)?)";
    let match = content.match(new RegExp(yearField + "[^\\d]{0,24}(20\\d{2}).{0,120}" + termField + "[^\\d一二三上下春秋夏暑]{0,24}" + termToken, "i"));
    if (match) return parseTermFieldValue(match[1], match[2], true);
    match = content.match(new RegExp(termField + "[^\\d一二三上下春秋夏暑]{0,24}" + termToken + ".{0,120}" + yearField + "[^\\d]{0,24}(20\\d{2})", "i"));
    if (match) return parseTermFieldValue(match[2], match[1], true);
    const yearMatch = content.match(new RegExp(yearField + "[^\\d]{0,24}(20\\d{2})", "i"));
    const termMatch = content.match(new RegExp(termField + "[^\\d一二三上下春秋夏暑]{0,24}" + termToken, "i"));
    if (!yearMatch || !termMatch) return null;
    return parseTermFieldValue(yearMatch[1], termMatch[1], true);
  }

  function parseImportedTermText(rawText) {
    const content = normalizeText(rawText);
    if (!content) return null;
    const zfInfo = parseZfTermFields(content);
    if (zfInfo) return zfInfo;
    let match = content.match(/(20\d{2})\s*[-—–~至]\s*(20\d{2})\s*学年.{0,32}?(春季|秋季|夏季|春|秋|夏|第?\s*[一二三123]\s*学期|[上下]学期|第三学期|三\s*学期)/);
    if (match) return buildDetectedTermInfo(match[1], match[2], match[3] || "");
    match = content.match(/(20\d{2})\s*[-—–~至]\s*(20\d{2}).{0,32}?(春季|秋季|夏季|春|秋|夏|第?\s*[一二三123]\s*学期|[上下]学期|第三学期|三\s*学期)/);
    if (match) return buildDetectedTermInfo(match[1], match[2], match[3] || "");
    match = content.match(/(20\d{2})\s*[-—–~至/]\s*(20\d{2})\s*[-_/]?\s*(12|16|[123])(?:\b|学期)/);
    if (match) return parseImportedTermCode(match[1], match[2], match[3]);
    match = content.match(/\b(20\d{2})(20\d{2})([123])\b/);
    if (match) return parseImportedTermCode(match[1], match[2], match[3]);
    match = parseZfTermFields(content);
    if (match) return match;
    match = content.match(/(20\d{2})\s*[-—–~至]\s*(20\d{2})\s*学年/);
    if (match) return buildDetectedTermInfo(match[1], match[2], "");
    match = content.match(/(20\d{2})\s*年\s*(春季|秋季|夏季|春|秋|夏|第?\s*[一二三123]\s*学期|[上下]学期|第三学期|三\s*学期)/);
    if (match) {
      const year = Number(match[1]);
      const kind = importedTermKind(match[2]);
      const firstYear = kind === "autumn" ? year : year - 1;
      return buildDetectedTermInfo(firstYear, firstYear + 1, match[2]);
    }
    return null;
  }

  function emptyTermInfo() {
    return { label: "未识别学期", kind: "", startDate: state.termStart || DEFAULT_TERM_START, detected: false };
  }

  function suggestedTermStart(firstYear, secondYear, kind) {
    if (kind === "autumn") return nearestMonday(firstYear, 9, 1);
    if (kind === "spring") return nearestMonday(secondYear, 2, 23);
    if (kind === "summer") return nearestMonday(secondYear, 6, 24);
    return state.termStart || DEFAULT_TERM_START;
  }

  function nearestMonday(year, month, day) {
    let best = new Date(year, month - 1, day);
    let bestDistance = Infinity;
    for (let offset = -4; offset <= 4; offset += 1) {
      const candidate = new Date(year, month - 1, day + offset);
      const distance = Math.abs(offset);
      if (candidate.getDay() === 1 && distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    return formatDate(best);
  }

  function dayItems(date) {
    const cacheKey = `${appCache.signature}|${date}|${notesCacheStamp()}`;
    if (dayItemsCache.has(cacheKey)) return dayItemsCache.get(cacheKey);
    const courseItems = mergeDailyCourses(appCache.courseEventsByDate[date] || []);
    const base = [
      ...courseItems,
      ...(appCache.recurringByDate[date] || []),
      ...(appCache.customByDate[date] || []),
      ...(appCache.examsByDate[date] || [])
    ];
    const hidden = new Set();
    const specials = [];
    for (const change of state.specialChanges) {
      const title = targetTitle(change.targetKey) || "特殊变更";
      if ((change.action === "cancel" || change.action === "move") && change.sourceDate === date) {
        hidden.add(change.targetKey);
      }
      if (change.action === "cancel" && change.sourceDate === date) {
        specials.push(specialToDisplay(change, `${title} 已取消`, change.sourceDate));
      }
      if (change.action === "move" && change.date === date) {
        specials.push(specialToDisplay(change, title, change.date));
      }
    }
    const result = [...base.filter((item) => !hidden.has(item.targetKey)), ...specials].sort(sortDisplayItems);
    dayItemsCache.set(cacheKey, result);
    if (dayItemsCache.size > DAY_ITEMS_CACHE_LIMIT) dayItemsCache.delete(dayItemsCache.keys().next().value);
    return result;
  }

  function mergeDailyCourses(events = []) {
    const grouped = new Map();
    for (const event of events) {
      const key = [event.courseKey, event.date, event.startTime, event.endTime, event.place || ""].join("|");
      if (!grouped.has(key)) {
        grouped.set(key, { ...event, mergedCount: 1, mergedWeeks: [event.week] });
        continue;
      }
      const current = grouped.get(key);
      current.mergedCount += 1;
      current.mergedWeeks.push(event.week);
      current.id = `${current.id}+${event.id}`;
    }
    return [...grouped.values()].map((item) => {
      const weeks = [...new Set(item.mergedWeeks)].sort((a, b) => a - b);
      return {
        ...item,
        meta: [
          item.place || "地点未填",
          item.teacher || "教师未填",
          weeks.length > 1 ? `第 ${formatWeeks(weeks)} 周` : ""
        ].filter(Boolean).join(" · ")
      };
    });
  }

  function activeDdlList() {
    const manual = state.ddls.filter((ddl) => !isCompleted(ddl.id));
    const schedule = state.customSchedules
      .filter((item) => item.syncToDdl && item.reminders?.length && !isCompleted(targetKeyForCustom(item.id)))
      .map((item) => ({
        id: targetKeyForCustom(item.id),
        date: item.date,
        time: item.startTime,
        topic: item.title,
        content: item.place || "",
        reminders: item.reminders,
        targetKey: targetKeyForCustom(item.id),
        sourceType: "schedule",
        sourceId: item.id
      }));
    return [...manual, ...schedule].sort(sortDdls);
  }

  function completedDdlList() {
    return state.completedDdls.slice().sort((a, b) => sortDdls(a, b) || String(a.completedAt || "").localeCompare(String(b.completedAt || "")));
  }

  function ddlDoneFilters() {
    const query = normalizeText(state.ddlDoneFilterQuery);
    const startDate = validDateInputValue(state.ddlDoneFilterStart);
    const startTime = validTimeInputValue(state.ddlDoneFilterStartTime);
    const endDate = validDateInputValue(state.ddlDoneFilterEnd);
    const endTime = validTimeInputValue(state.ddlDoneFilterEndTime);
    let fromStamp = startDate ? dateTimeStamp(startDate, startTime || "00:00", false) : null;
    let toStamp = endDate ? dateTimeStamp(endDate, endTime || "23:59", true) : null;
    if (fromStamp !== null && toStamp !== null && fromStamp > toStamp) {
      [fromStamp, toStamp] = [toStamp, fromStamp];
    }
    let fromMinute = !startDate && startTime ? clockToMinutes(startTime) : null;
    let toMinute = !endDate && endTime ? clockToMinutes(endTime) : null;
    if (fromMinute !== null && toMinute !== null && fromMinute > toMinute) {
      [fromMinute, toMinute] = [toMinute, fromMinute];
    }
    return {
      query,
      tokens: searchTokens(query),
      startDate,
      startTime,
      endDate,
      endTime,
      fromStamp,
      toStamp,
      fromMinute,
      toMinute
    };
  }

  function hasCompletedDdlFilters(filters = ddlDoneFilters()) {
    return Boolean(filters.query || filters.startDate || filters.startTime || filters.endDate || filters.endTime);
  }

  function filteredCompletedDdls() {
    const filters = ddlDoneFilters();
    return appCache.completedDdls.filter((ddl) => {
      if (filters.tokens.length && !completedDdlMatchesQuery(ddl, filters.tokens)) return false;
      const stamp = ddlDueStamp(ddl);
      if ((filters.fromStamp !== null || filters.toStamp !== null) && stamp === null) return false;
      if (filters.fromStamp !== null && stamp < filters.fromStamp) return false;
      if (filters.toStamp !== null && stamp > filters.toStamp) return false;
      const minute = clockToMinutes(ddl?.time || "23:59");
      if (filters.fromMinute !== null && minute < filters.fromMinute) return false;
      if (filters.toMinute !== null && minute > filters.toMinute) return false;
      return true;
    });
  }

  function completedDdlMatchesQuery(ddl, tokens) {
    const text = normalizeSearchText([
      ddl?.topic,
      ddl?.content,
      targetTitle(ddl?.targetKey),
      ddl?.sourceType === "schedule" ? "日程同步" : "DDL",
      formatDdlTime(ddl || {}),
      formatCompletedDdlTime(ddl?.completedAt)
    ].filter(Boolean).join(" "));
    return tokens.every((token) => text.includes(token));
  }

  function renderSwipeShell(type, id, cardHtml, actionsHtml) {
    return `
      <div class="swipe-shell" data-swipe-type="${escapeAttr(type)}" data-swipe-id="${escapeAttr(id)}">
        <div class="swipe-actions">${actionsHtml}</div>
        <div class="swipe-content">${cardHtml}</div>
      </div>
    `;
  }

  function customToDisplay(item) {
    return {
      ...item,
      type: "custom",
      kind: "custom",
      detailType: "custom",
      detailId: item.id,
      targetKey: targetKeyForCustom(item.id),
      noteKey: noteKeyForCustom(item.id),
      title: item.title,
      timeText: timeRange(item),
      typeLabel: "日程",
      meta: [item.place || "地点未填", item.syncToDdl ? "同步到 DDL" : ""].filter(Boolean).join(" · "),
      startMinute: clockToMinutes(item.startTime)
    };
  }

  function recurringToDisplay(item, date, week) {
    return {
      ...item,
      type: "recurring",
      kind: "recurring",
      detailType: "recurring",
      detailId: item.id,
      targetKey: targetKeyForRecurring(item.id),
      noteKey: noteKeyForRecurring(item.id),
      date,
      week,
      title: item.title,
      timeText: timeRange(item),
      typeLabel: "常驻",
      meta: `${item.place || "地点未填"} · ${formatWeeks(item.weeks)}`,
      startMinute: clockToMinutes(item.startTime)
    };
  }

  function examToDisplay(item) {
    return {
      ...item,
      type: "exam",
      kind: "exam",
      detailType: "exam",
      detailId: item.id,
      targetKey: "",
      noteKey: "",
      title: item.title,
      timeText: timeRange(item),
      typeLabel: "考试",
      meta: item.place || "地点未填",
      startMinute: clockToMinutes(item.startTime)
    };
  }

  function specialToDisplay(change, title, date) {
    return {
      ...change,
      type: "special",
      kind: "special",
      detailType: "special",
      detailId: change.id,
      title,
      date,
      timeText: change.action === "cancel" ? "变更" : timeRange(change),
      typeLabel: "变更",
      meta: [change.place || "", change.note || "", change.action === "cancel" ? "取消原安排" : ""].filter(Boolean).join(" · "),
      startMinute: change.action === "cancel" ? 0 : clockToMinutes(change.startTime || "00:00")
    };
  }

  function expandRecurring(item) {
    const dates = [];
    const weeks = item.weeks?.length ? item.weeks : [weekForDate(state.focusDate)];
    for (const week of weeks) {
      const date = dateForWeekDay(item.termStart || state.termStart || DEFAULT_TERM_START, week, item.dayIndex);
      if (item.startDate && date < item.startDate) continue;
      if (item.endDate && date > item.endDate) continue;
      dates.push(recurringToDisplay(item, date, week));
    }
    return dates;
  }

  function isRecurringEnded(item) {
    if (item.endDate) return item.endDate < todayString();
    const weeks = item.weeks?.length ? item.weeks : [];
    if (!weeks.length) return false;
    const lastWeek = Math.max(...weeks);
    const lastDate = dateForWeekDay(item.termStart || state.termStart || DEFAULT_TERM_START, lastWeek, item.dayIndex);
    return lastDate < todayString();
  }

  function groupedRecurringSchedules() {
    return state.recurringSchedules.reduce((groups, item) => {
      groups[isRecurringEnded(item) ? "ended" : "active"].push(item);
      return groups;
    }, { active: [], ended: [] });
  }

  function detailContext() {
    const { type, id } = state.modalData || {};
    if (type === "course") {
      const course = appCache.courseByKey[id];
      if (!course) return null;
      return {
        title: course.name,
        noteKey: noteKeyForCourse(course.courseKey),
        meta: [course.termLabel, course.scheduleText, course.teacher || "教师未填"].filter(Boolean)
      };
    }
    if (type === "recurring") {
      const item = appCache.recurringById[id];
      if (!item) return null;
      return {
        title: item.title,
        noteKey: noteKeyForRecurring(item.id),
        meta: [`周${DAYS[item.dayIndex]}`, timeRange(item), formatWeeks(item.weeks), item.place || "地点未填"]
      };
    }
    if (type === "custom") {
      const item = appCache.customById[id];
      if (!item) return null;
      return {
        title: item.title,
        noteKey: noteKeyForCustom(item.id),
        meta: [item.date, timeRange(item), item.place || "地点未填"]
      };
    }
    if (type === "special") {
      const item = state.specialChanges.find((change) => change.id === id);
      if (!item) return null;
      return {
        title: targetTitle(item.targetKey) || "特殊变更",
        noteKey: `special:${item.id}`,
        meta: [item.action, item.sourceDate, item.date, item.note].filter(Boolean)
      };
    }
    if (type === "exam") {
      const item = state.examSchedules.find((exam) => exam.id === id);
      if (!item) return null;
      return { title: item.title, noteKey: `exam:${item.id}`, meta: [item.date, timeRange(item), item.place].filter(Boolean) };
    }
    return null;
  }

  function targetTitle(targetKey) {
    if (!targetKey) return "";
    if (targetKey.startsWith("course:")) return appCache.courseByKey[targetKey.slice(7)]?.name || "";
    if (targetKey.startsWith("recurring:")) return appCache.recurringById[targetKey.slice(10)]?.title || "";
    if (targetKey.startsWith("custom:")) return appCache.customById[targetKey.slice(7)]?.title || "";
    return "";
  }

  function targetDdlBadge(targetKey) {
    if (!targetKey) return "";
    const count = (appCache.ddlByTarget[targetKey] || []).filter((ddl) => !isCompleted(ddl.id)).length;
    return count ? `DDL ${count}` : "";
  }

  function noteBadge(noteKey) {
    const count = noteKey && state.notes[noteKey] ? state.notes[noteKey].length : 0;
    return count ? `备注 ${count}` : "";
  }

  function notesCacheStamp() {
    return Object.entries(state.notes || {})
      .map(([key, list]) => `${key}:${Array.isArray(list) ? list.length : 0}`)
      .sort()
      .join("|");
  }

  function defaultSpecialTargetKey() {
    const item = dayItems(state.focusDate).find((entry) => entry.targetKey && (entry.type === "course" || entry.type === "recurring"));
    return item?.targetKey || Object.keys(appCache.courseByKey).map(targetKeyForCourse)[0] || "";
  }

  function handleReminderPermissionUpdated() {
    syncNativeNotifications({ requestPermission: false, force: !lastNativeReminderSignature, reason: "permission" });
    window.YayaLayers?.registerRuntime?.("platform", {
      reminderPermissionUpdatedAt: Date.now(),
      reminderStatus: reminderPermissionLabels(reminderPermissionStatus()).state
    });
    if (state.modal) renderModal();
  }

  function requestReminderPermission(options = {}) {
    const native = Boolean(window.YayaPlatform?.isNative?.());
    if (!native) {
      if (!options.silent) {
        state.notice = "网页预览中不会弹出系统权限；打包后的手机 App 内可开启提醒权限";
        persist({ immediate: true });
        renderModal();
        scheduleRenderAll({ force: true });
      }
      return false;
    }
    const ok = options.interactive === false
      ? Boolean(window.YayaPlatform?.requestNotificationPermission?.())
      : Boolean(window.YayaPlatform?.requestReminderPermissions?.() ?? window.YayaPlatform?.requestNotificationPermission?.());
    syncNativeNotifications({ requestPermission: false, force: true, reason: "permission-request" });
    if (!options.silent) {
      const labels = reminderPermissionLabels(reminderPermissionStatus());
      state.notice = labels.state === "ready" ? "提醒权限已开启，系统提醒已重新挂载" : "已发起提醒权限请求，请在系统弹窗或权限页中允许";
      persist({ immediate: true });
      renderModal();
      scheduleRenderAll({ force: true });
    }
    return ok;
  }

  function reminderValuesFromForm(data) {
    const enabled = data.get("reminderEnabled") === "1";
    if (!enabled) return [];
    const values = normalizeReminderValues(data.getAll("reminders"));
    return values.length ? values : [DEFAULT_REMINDER_VALUE];
  }

  function nativeReminderPayload() {
    const manualDdlPayload = state.ddls
      .filter((ddl) => !isCompleted(ddl.id))
      .filter((ddl) => normalizeReminderValues(ddl.reminders).length)
      .map((ddl) => ({
        id: ddl.id,
        alarmKey: ["ddl", ddl.id, ddl.date, ddl.time || "23:59"].join("|"),
        date: ddl.date,
        time: ddl.time || "23:59",
        topic: ddl.topic,
        content: ddl.content || "",
        reminders: normalizeReminderValues(ddl.reminders),
        kind: "ddl",
        timeLabel: "截止"
      }));
    const schedulePayload = state.customSchedules
      .filter((item) => !isCompleted(targetKeyForCustom(item.id)))
      .filter((item) => normalizeReminderValues(item.reminders).length)
      .map((item) => ({
        id: targetKeyForCustom(item.id),
        alarmKey: ["schedule", item.id, item.date, item.startTime || "08:00"].join("|"),
        date: item.date,
        time: item.startTime || "08:00",
        topic: item.title || "日程",
        content: item.place || "",
        reminders: normalizeReminderValues(item.reminders),
        kind: "schedule",
        timeLabel: "开始"
      }));
    return [...manualDdlPayload, ...schedulePayload].filter((item) => validDate(item.date));
  }

  function syncNativeNotifications(options = {}) {
    const payload = nativeReminderPayload();
    const signature = reminderPayloadSignature(payload);
    const force = options.force === true || signature !== lastNativeReminderSignature;
    if (!force) return true;
    const serialized = JSON.stringify(payload);
    const bridge = window.YayaPlatform;
    if (!bridge?.scheduleReminderNotifications && !bridge?.scheduleDdlNotifications) return false;
    if (payload.length && options.requestPermission !== false) bridge.requestNotificationPermission?.();
    let scheduled = bridge.scheduleReminderNotifications?.(serialized);
    if (scheduled === undefined || scheduled === false) {
      scheduled = bridge.scheduleDdlNotifications?.(serialized);
    }
    const ok = scheduled !== false;
    if (ok) lastNativeReminderSignature = signature;
    nativeReminderSyncGeneration += 1;
    window.YayaLayers?.registerRuntime?.("platform", {
      reminderPayloadCount: payload.length,
      reminderPayloadSignature: signature,
      reminderSyncGeneration: nativeReminderSyncGeneration,
      reminderSyncReason: options.reason || "sync",
      reminderBridgeMounted: ok
    });
    if (ok && options.retry !== false) {
      queueNativeNotificationSync({ requestPermission: false, force: true, retry: false, reason: "confirm", delay: 420 });
      window.setTimeout(() => syncNativeNotifications({ requestPermission: false, force: true, retry: false, reason: "confirm-late" }), 1500);
    }
    return ok;
  }

  function queueNativeNotificationSync(options = {}) {
    if (nativeReminderSyncTimer) window.clearTimeout(nativeReminderSyncTimer);
    nativeReminderSyncTimer = window.setTimeout(() => {
      nativeReminderSyncTimer = 0;
      syncNativeNotifications(options);
    }, Number.isFinite(options.delay) ? options.delay : 220);
  }

  function reminderPayloadSignature(payload) {
    return payload
      .map((item) => [
        item.alarmKey || item.id || "",
        item.kind || "",
        item.date || "",
        item.time || "",
        item.topic || "",
        item.content || "",
        item.timeLabel || "",
        normalizeReminderValues(item.reminders).join(",")
      ].join("@"))
      .sort()
      .join("||");
  }

  function updateNativeWidget() {
    const ddl = appCache.activeDdls[0] || {};
    const current = latestScheduleWidgetItem(todayString());
    const progress = scheduleProgress(current);
    window.YayaPlatform?.updateHomeWidget([
      ddl.topic || "暂无 DDL",
      ddl.date ? formatDdlTime(ddl) : "",
      current.title || "暂无安排",
      current.timeText || "",
      current.place || "",
      current.typeLabel || "",
      progress,
      progress > 0 && progress < 100,
      widgetThemePayload()
    ]);
  }

  function widgetThemePayload() {
    const vars = resolvedThemeVars();
    const fallback = THEME_PRESETS.coolGlass;
    return {
      themeId: normalizeThemeId(state.theme),
      accent: normalizeColor(vars.accent, fallback.accent),
      warm: normalizeColor(vars.warm, fallback.warm),
      bg: normalizeColor(vars.bg, fallback.bg),
      ink: normalizeColor(vars.ink, fallback.ink),
      muted: normalizeColor(vars.muted, fallback.muted),
      glassAlpha: clamp(Number(vars.glassAlpha), 18, 96),
      radius: clamp(Number(vars.radius), 10, 30)
    };
  }

  function latestScheduleWidgetItem(date) {
    const items = dayItems(date);
    const now = new Date();
    return items.find((item) => displayEndDate(item) >= now) || items[0] || {};
  }

  function nextFloatingLayer() {
    floatingLayer += FLOATING_LAYER_STEP;
    if (floatingLayer > FLOATING_LAYER_BASE + 9000) floatingLayer = FLOATING_LAYER_BASE + FLOATING_LAYER_STEP;
    return floatingLayer;
  }

  function templateInteraction(templateId = state.uiTemplate) {
    return resolveUiAssembly(templateId).interaction;
  }

  function applyTemplate() {
    const ui = resolveUiAssembly();
    const templateId = ui.id;
    const order = ui.order;
    const visibility = ui.visibility;
    const interaction = ui.interaction;
    const inputUi = normalizeInputUiComponent(ui.inputUi || interaction.inputUi || templateInputUi(templateId));
    document.body.dataset.template = templateId;
    document.body.dataset.icon = normalizeIconId(state.appIcon);
    document.body.dataset.templateInteraction = interaction.mode;
    document.body.dataset.modalLayout = interaction.modalLayout;
    document.body.dataset.density = interaction.density;
    document.body.dataset.inputUi = inputUi.variant;
    document.body.dataset.inputUiDensity = inputUi.density;
    document.body.dataset.inputUiShape = inputUi.shape;
    document.body.dataset.inputUiPopup = inputUi.popup;
    document.body.dataset.inputUiAffordance = inputUi.affordance;
    document.body.dataset.inputUiThemeSync = inputUi.themeSync === false ? "false" : "true";
    const elementByModule = {
      status: els.statusBar,
      ddl: els.ddlStrip,
      day: els.dayPanel,
      overview: els.dashboardGrid
    };
    order.forEach((key, index) => {
      if (!elementByModule[key]) return;
      elementByModule[key].style.order = String(index + 1);
      elementByModule[key].hidden = !visibility[key];
    });
    window.YayaLayers?.registerRuntime?.("components", {
      order,
      visibility,
      inputUi: inputUi.variant,
      inputUiThemeSync: inputUi.themeSync !== false
    });
    window.YayaLayers?.registerRuntime?.("interaction", {
      mode: interaction.mode,
      modalLayout: interaction.modalLayout,
      density: interaction.density,
      inputUi: inputUi.variant,
      inputPopup: inputUi.popup
    });
    window.YayaLayers?.registerRuntime?.("template", {
      activeTemplate: templateId,
      inputUi: inputUi.variant,
      inputUiThemeSync: inputUi.themeSync !== false
    });
    return ui;
  }

  function applyTheme() {
    const vars = resolvedThemeVars();
    const root = document.documentElement;
    const themeId = normalizeThemeId(state.theme);
    document.body.dataset.theme = themeId;
    root.style.setProperty("--accent", vars.accent);
    root.style.setProperty("--accent-warm", vars.warm);
    root.style.setProperty("--page-bg", vars.bg);
    root.style.setProperty("--ink", vars.ink);
    root.style.setProperty("--muted", vars.muted);
    root.style.setProperty("--line", vars.line);
    root.style.setProperty("--panel", vars.panel);
    root.style.setProperty("--panel-solid", vars.card);
    root.style.setProperty("--card", vars.card);
    root.style.setProperty("--hero-bg", vars.hero);
    root.style.setProperty("--soft", `color-mix(in srgb, ${vars.accent} 10%, white)`);
    root.style.setProperty("--course-color", vars.accent);
    root.style.setProperty("--ddl-color", vars.warm);
    root.style.setProperty("--schedule-color", vars.warm);
    root.style.setProperty("--recurring-color", `color-mix(in srgb, ${vars.accent} 58%, #16a34a)`);
    root.style.setProperty("--exam-color", `color-mix(in srgb, ${vars.accent} 56%, #7c3aed)`);
    root.style.setProperty("--special-color", `color-mix(in srgb, ${vars.warm} 70%, #dc2626)`);
    root.style.setProperty("--radius", `${vars.radius}px`);
    root.style.setProperty("--glass-blur", `${vars.blur}px`);
    root.style.setProperty("--glass-alpha", `${vars.glassAlpha}`);
    const glassAlpha = clamp(Number(vars.glassAlpha), 18, 96) / 100;
    const shadowAlpha = clamp(Number(vars.shadowAlpha), 4, 40) / 100;
    const shadowRgb = hexToRgbList(vars.accent) || "37, 99, 235";
    const softShadowAlpha = Math.max(0.08, Math.min(0.18, shadowAlpha * 0.84));
    root.style.setProperty("--glass", `rgba(255, 255, 255, ${Math.max(0.28, glassAlpha * 0.72).toFixed(2)})`);
    root.style.setProperty("--glass-strong", `rgba(255, 255, 255, ${Math.min(0.86, Math.max(0.52, glassAlpha)).toFixed(2)})`);
    root.style.setProperty("--glass-soft", `rgba(255, 255, 255, ${Math.max(0.22, glassAlpha * 0.48).toFixed(2)})`);
    root.style.setProperty("--glass-border", `rgba(255, 255, 255, ${Math.max(0.42, Math.min(0.82, glassAlpha * 0.86)).toFixed(2)})`);
    root.style.setProperty("--shadow", `0 18px 46px rgba(${shadowRgb}, ${shadowAlpha.toFixed(2)})`);
    root.style.setProperty("--soft-shadow", `0 12px 28px rgba(${shadowRgb}, ${softShadowAlpha.toFixed(2)})`);
    const bridgeVars = THEME_BRIDGE?.apply?.({
      root,
      body: document.body,
      theme: themeId,
      vars
    }) || {};
    window.YayaLayers?.registerRuntime?.("theme", {
      theme: themeId,
      accent: vars.accent,
      warm: vars.warm,
      bridge: Boolean(THEME_BRIDGE?.apply),
      templateCoupled: Boolean(bridgeVars && Object.keys(bridgeVars).length),
      inputUiThemeSync: true,
      moduleSlots: ["course", "custom", "recurring", "special", "exam"]
    });
    syncPortalImportUiBridge();
  }

  function portalImportUiConfig() {
    const vars = resolvedThemeVars();
    const themeId = normalizeThemeId(state.theme);
    const inputUi = templateInputUi();
    return {
      themeId,
      templateId: normalizeTemplateId(state.uiTemplate),
      inputUi: inputUi.variant || "originalGlass",
      density: inputUi.density || "airy",
      shape: inputUi.shape || "roundedGlass",
      accent: vars.accent,
      warm: vars.warm,
      bg: vars.bg,
      ink: vars.ink,
      muted: vars.muted,
      panel: vars.panel,
      card: vars.card,
      radius: vars.radius,
      blur: vars.blur,
      glassAlpha: vars.glassAlpha,
      shadowAlpha: vars.shadowAlpha
    };
  }

  function syncPortalImportUiBridge() {
    const config = portalImportUiConfig();
    window.YayaPlatform?.configurePortalUi?.(config);
    window.YayaLayers?.registerRuntime?.("platform", {
      portalUiBridge: Boolean(window.YayaPlatform?.configurePortalUi),
      portalTheme: config.themeId,
      portalTemplate: config.templateId,
      portalInputUi: config.inputUi
    });
    window.YayaLayers?.registerRuntime?.("interaction", {
      portalTermOverlay: true,
      portalOverlayScope: "viewport",
      portalOverlayThemeSync: true
    });
    window.YayaLayers?.registerRuntime?.("template", {
      portalImportBridge: "platform",
      theme: config.themeId,
      template: config.templateId,
      inputUi: config.inputUi,
      themeSync: true
    });
  }

  function normalizeTemplateId(value) {
    if (UI_MODULE_REGISTRY?.normalizeTemplateId) return UI_MODULE_REGISTRY.normalizeTemplateId(value);
    const id = String(value || "");
    return id in UI_TEMPLATES ? id : "classicOriginal";
  }

  function normalizeThemeId(value) {
    if (THEME_BRIDGE?.normalizeThemeId) return THEME_BRIDGE.normalizeThemeId(value);
    const id = String(value || "");
    if (id === "custom" || id === "customMono" || id === "classic" || id === "classicCustom") return "classicCustom";
    if (id === "clear" || id === "cool" || id === "study") return "coolGlass";
    if (id === "warm" || id === "berry") return "warmGlass";
    if (id in THEME_PRESETS) return id;
    return "coolGlass";
  }

  function normalizeIconId(value) {
    const id = String(value || "");
    return ICON_OPTIONS.some((item) => item.id === id) ? id : "cartoon";
  }

  function parseModuleOrder(value) {
    return normalizeModuleOrder(String(value || "").split(/[,\s，、]+/));
  }

  function normalizeModuleOrder(value) {
    if (UI_MODULE_REGISTRY?.normalizeOrder) return UI_MODULE_REGISTRY.normalizeOrder(value);
    const aliases = new Map([
      ["状态", "status"],
      ["status", "status"],
      ["DDL", "ddl"],
      ["ddl", "ddl"],
      ["任务", "ddl"],
      ["今日", "day"],
      ["日程", "day"],
      ["day", "day"],
      ["概览", "overview"],
      ["overview", "overview"]
    ]);
    const result = [];
    (Array.isArray(value) ? value : []).forEach((item) => {
      const key = aliases.get(String(item || "").trim()) || String(item || "").trim();
      if (DEFAULT_MODULE_ORDER.includes(key) && !result.includes(key)) result.push(key);
    });
    DEFAULT_MODULE_ORDER.forEach((key) => {
      if (!result.includes(key)) result.push(key);
    });
    return result;
  }

  function normalizeModuleVisibility(value) {
    if (UI_MODULE_REGISTRY?.normalizeVisibility) return UI_MODULE_REGISTRY.normalizeVisibility(value);
    const source = value && typeof value === "object" ? value : {};
    const next = {};
    UI_MODULES.forEach(([key]) => {
      next[key] = source[key] !== false;
    });
    return next;
  }

  function moduleLabel(key) {
    return UI_MODULES.find(([id]) => id === key)?.[1] || key;
  }

  function resolveUiAssembly(templateId = state.uiTemplate) {
    const nextState = templateId === state.uiTemplate ? state : { ...state, uiTemplate: templateId };
    if (UI_MODULE_REGISTRY?.resolve) {
      return UI_MODULE_REGISTRY.resolve({ state: nextState, cache: appCache });
    }
    const id = normalizeTemplateId(templateId);
    const template = UI_TEMPLATES[id] || {};
    const order = normalizeModuleOrder(state.moduleOrder?.length ? state.moduleOrder : template.order || DEFAULT_MODULE_ORDER);
    const inputUi = normalizeInputUiComponent(template.inputUi || template.interaction?.inputUi || DEFAULT_INPUT_UI.variant);
    return {
      id,
      label: template.label || "界面",
      description: template.description || "",
      order,
      visibility: normalizeModuleVisibility(state.moduleVisibility),
      actions: (template.actions || []).map((key) => TEMPLATE_ACTIONS[key]).filter(Boolean),
      interaction: {
        label: template.interaction?.label || "浮窗",
        mode: template.interaction?.mode || "floating",
        modalLayout: template.interaction?.modalLayout || "floating",
        density: template.interaction?.density || "comfortable",
        inputUi
      },
      inputUi
    };
  }

  function resolvedThemeVars() {
    const preset = THEME_PRESETS[normalizeThemeId(state.theme)] || THEME_PRESETS.coolGlass;
    return sanitizeThemeVars({ ...preset, ...state.themeVars });
  }

  function sanitizeThemeVars(vars = {}) {
    const preset = THEME_PRESETS[normalizeThemeId(state.theme)] || THEME_PRESETS.coolGlass;
    const next = {};
    const colorKeys = new Set(["accent", "warm", "bg", "ink", "muted"]);
    const textKeys = new Set(["line", "panel", "card", "hero"]);
    THEME_VAR_FIELDS.forEach(([key, , type]) => {
      const fallback = preset[key] ?? THEME_PRESETS.coolGlass[key];
      const value = vars[key] ?? fallback;
      if (colorKeys.has(key)) {
        next[key] = normalizeColor(value, fallback);
      } else if (textKeys.has(key)) {
        next[key] = normalizeCssText(value, fallback);
      } else if (type === "range") {
        const max = key === "blur" ? 30 : key === "radius" ? 30 : 100;
        next[key] = clamp(Number(value), 0, max);
      } else {
        next[key] = String(value || fallback);
      }
    });
    return next;
  }

  function normalizeColor(value, fallback) {
    const text = String(value || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback;
  }

  function hexToRgbList(value) {
    const text = String(value || "").trim();
    const match = /^#([0-9a-fA-F]{6})$/.exec(text);
    if (!match) return "";
    const hex = match[1];
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16)
    ].join(", ");
  }

  function normalizeCssText(value, fallback) {
    const text = String(value || "").trim();
    if (!text || /[<>;]/.test(text)) return String(fallback || "");
    return text.slice(0, 180);
  }

  function refreshDateIfNeeded() {
    const today = todayString();
    if (today === lastKnownToday) return false;
    const changed = syncFocusDate(today);
    lastKnownToday = today;
    if (changed) {
      persist({ immediate: true });
      scheduleRenderAll({ force: true });
    } else {
      renderStatus();
      updateNativeWidget();
    }
    return changed;
  }

  function syncFocusToToday(reason = "auto") {
    const today = todayString();
    const changed = syncFocusDate(today);
    lastKnownToday = today;
    window.YayaLayers?.registerRuntime?.("boot", {
      currentDateFocus: true,
      currentDateReason: reason,
      currentDate: today,
      focusDate: state.focusDate,
      changed
    });
    return changed;
  }

  function syncFocusDate(value) {
    const normalized = validDate(value) ? value : todayString();
    const before = `${state.focusDate}|${state.activeTermId}|${state.termStart}`;
    const term = termForDate(normalized);
    if (term) {
      state.activeTermId = term.id;
      state.termStart = term.termStart || state.termStart || DEFAULT_TERM_START;
    } else {
      syncActiveTerm();
    }
    state.focusDate = normalized;
    return `${state.focusDate}|${state.activeTermId}|${state.termStart}` !== before;
  }

  function syncActiveTerm() {
    const term = activeTerm();
    if (!term) return;
    state.activeTermId = term.id;
    state.termStart = term.termStart || state.termStart || DEFAULT_TERM_START;
  }

  function activeTerm() {
    return state.terms.find((term) => term.id === state.activeTermId) || state.terms[0] || null;
  }

  function currentCourseTerm() {
    return termForDate(state.focusDate || todayString()) || activeTerm();
  }

  function termStartForDate(date) {
    const term = termForDate(date || state.focusDate) || activeTerm();
    return term?.termStart || state.termStart || DEFAULT_TERM_START;
  }

  function weekForDate(date) {
    const term = termForDate(date) || activeTerm();
    const start = term?.termStart || state.termStart || DEFAULT_TERM_START;
    const diff = Math.floor((toDate(date) - toDate(start)) / 86400000);
    return Math.max(1, Math.floor(diff / 7) + 1);
  }

  function termForDate(date) {
    if (!state.terms.length) return null;
    return state.terms
      .slice()
      .sort((a, b) => b.termStart.localeCompare(a.termStart))
      .find((term) => date >= term.termStart) || state.terms[0];
  }

  function parseWeeks(value) {
    const text = normalizeText(value).replace(/周/g, "").replace(/\s/g, "");
    const weeks = new Set();
    for (const raw of text.split(/[，,、]/).filter(Boolean)) {
      const odd = raw.includes("单");
      const even = raw.includes("双");
      const part = raw.replace(/[单双]/g, "");
      const range = part.match(/^(\d+)-(\d+)$/);
      const single = part.match(/^(\d+)$/);
      let values = [];
      if (range) {
        const start = Number(range[1]);
        const end = Number(range[2]);
        const step = start <= end ? 1 : -1;
        for (let week = start; week !== end + step; week += step) values.push(week);
      } else if (single) {
        values = [Number(single[1])];
      } else if (odd || even) {
        values = Array.from({ length: MAX_WEEK }, (_, index) => index + 1);
      }
      for (const week of values) {
        if (week > 0 && week <= MAX_WEEK && (!odd || week % 2 === 1) && (!even || week % 2 === 0)) weeks.add(week);
      }
    }
    return [...weeks].sort((a, b) => a - b);
  }

  function formatWeeks(weeks = []) {
    if (!weeks.length) return "";
    const sorted = [...weeks].sort((a, b) => a - b);
    const ranges = [];
    let start = sorted[0];
    let prev = sorted[0];
    for (let index = 1; index <= sorted.length; index += 1) {
      if (sorted[index] === prev + 1) {
        prev = sorted[index];
        continue;
      }
      ranges.push(start === prev ? String(start) : `${start}-${prev}`);
      start = sorted[index];
      prev = sorted[index];
    }
    return ranges.join(",");
  }

  function normalizeCustomSchedule(item) {
    const range = manualTimeRange(item, "08:00", "09:40");
    const startTime = range.startTime;
    const endTime = range.endTime;
    const reminders = normalizeReminderValues(item?.reminders);
    return {
      id: String(item?.id || newId("sch")),
      date: validDate(item?.date) ? item.date : todayString(),
      startTime,
      endTime: endTime <= startTime ? startTime : endTime,
      title: normalizeText(item?.title || "日程"),
      place: normalizeText(item?.place),
      reminders,
      syncToDdl: !!item?.syncToDdl && reminders.length > 0
    };
  }

  function normalizeRecurringSchedule(item) {
    const range = manualTimeRange(item, "08:00", "09:40");
    return {
      id: String(item?.id || newId("rec")),
      title: normalizeText(item?.title || "常驻日程"),
      place: normalizeText(item?.place),
      dayIndex: clamp(Number(item?.dayIndex), 0, 6),
      startTime: range.startTime,
      endTime: range.endTime,
      weeks: Array.isArray(item?.weeks) ? item.weeks.filter((week) => week > 0 && week <= MAX_WEEK) : parseWeeks(item?.weeks || "1-16"),
      startDate: validDate(item?.startDate) ? item.startDate : "",
      endDate: validDate(item?.endDate) ? item.endDate : "",
      termStart: validDate(item?.termStart) ? item.termStart : state.termStart || DEFAULT_TERM_START
    };
  }

  function normalizeExamSchedule(item) {
    if (!item || !validDate(item.date) || !normalizeText(item.title)) return null;
    return {
      id: String(item.id || newId("exam")),
      date: item.date,
      title: normalizeText(item.title),
      place: normalizeText(item.place),
      startTime: normalizeTime(item.startTime || "00:00"),
      endTime: normalizeTime(item.endTime || item.startTime || "00:00")
    };
  }

  function normalizeSpecialChange(item) {
    if (!item || !item.targetKey || !validDate(item.sourceDate || item.date)) return null;
    const action = ["move", "cancel"].includes(item.action) ? item.action : "";
    if (!action) return null;
    const range = manualTimeRange(item, "08:00", "09:40");
    return {
      id: String(item.id || newId("sp")),
      targetKey: String(item.targetKey),
      action,
      sourceDate: validDate(item.sourceDate) ? item.sourceDate : item.date,
      date: validDate(item.date) ? item.date : item.sourceDate,
      startTime: range.startTime,
      endTime: range.endTime,
      place: normalizeText(item.place),
      note: normalizeText(item.note)
    };
  }

  function normalizeDdl(item) {
    if (!item || !validDate(item.date)) return null;
    const topic = normalizeText(item.topic);
    if (!topic) return null;
    return {
      id: String(item.id || newId("ddl")),
      date: item.date,
      time: normalizeTime(item.time || "23:59"),
      topic,
      content: normalizeText(item.content),
      targetKey: String(item.targetKey || ""),
      reminders: normalizeReminderValues(item.reminders)
    };
  }

  function normalizeCompletedDdl(item) {
    const base = normalizeDdl(item);
    if (!base) return null;
    return {
      ...base,
      sourceType: item.sourceType || "ddl",
      sourceId: item.sourceId || "",
      completedAt: item.completedAt || new Date().toISOString()
    };
  }

  function manualTimeRange(item = {}, startFallback = "08:00", endFallback = "09:40") {
    const fallbackStart = item.start ? periodClock(Number(item.start), "start") : startFallback;
    const fallbackEnd = item.end ? periodClock(Number(item.end), "end") : endFallback;
    let startTime = normalizeTime(item.startTime || fallbackStart);
    let endTime = normalizeTime(item.endTime || fallbackEnd);
    if (clockToMinutes(endTime) < clockToMinutes(startTime)) {
      [startTime, endTime] = [endTime, startTime];
    }
    return { startTime, endTime };
  }

  function normalizeReminderValues(values) {
    const list = Array.isArray(values) ? values : [];
    const allowed = new Set(REMINDER_OPTIONS.map(([value]) => value));
    const seen = new Set();
    return list.map(String).filter((value) => allowed.has(value) && !seen.has(value) && seen.add(value));
  }

  function normalizeNotes(raw) {
    const out = {};
    if (!raw || typeof raw !== "object") return out;
    for (const [key, value] of Object.entries(raw)) {
      const list = Array.isArray(value) ? value : [];
      out[key] = list
        .map((note) => typeof note === "string" ? { id: newId("note"), text: note } : note)
        .filter((note) => normalizeText(note?.text))
        .map((note) => ({ id: String(note.id || newId("note")), text: normalizeText(note.text), createdAt: note.createdAt || "" }));
    }
    return out;
  }

  function parseCourseName(raw) {
    const text = normalizeText(raw);
    const match = text.match(/^\[?([A-Za-z0-9._-]{3,})\]?\s*(.+)$/);
    return match ? { code: match[1], name: normalizeText(match[2]) } : { code: "", name: text };
  }

  function termIdFromInfo(info, termStart) {
    const label = normalizeText(info?.label || "课表");
    return `term:${label}|${termStart}`;
  }

  function dateForWeekDay(termStart, week, dayIndex) {
    return addDays(termStart, (Number(week) - 1) * 7 + Number(dayIndex || 0));
  }

  function periodClock(period, edge) {
    const pair = PERIOD_TIMES[period] || PERIOD_TIMES[1];
    return edge === "end" ? pair[1] : pair[0];
  }

  function parseDateValue(value) {
    const text = normalizeText(value);
    let match = text.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    if (match) return `${match[1]}-${pad(match[2])}-${pad(match[3])}`;
    match = text.match(/(\d{1,2})月(\d{1,2})日/);
    if (!match) return "";
    const start = toDate(state.termStart || DEFAULT_TERM_START);
    const month = Number(match[1]);
    const year = start.getMonth() >= 7 && month <= 2 ? start.getFullYear() + 1 : start.getFullYear();
    return `${year}-${pad(match[1])}-${pad(match[2])}`;
  }

  function parseTimeRange(value) {
    const text = normalizeText(value).replace(/[~～—–－至到]/g, "-");
    const match = text.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (!match) return { startTime: "00:00", endTime: "00:00" };
    return {
      startTime: `${pad(match[1])}:${match[2]}`,
      endTime: `${pad(match[3])}:${match[4]}`
    };
  }

  function timeRange(item) {
    const start = item.startTime || item.time || "00:00";
    const end = item.endTime || "";
    return end && end !== start ? `${start}-${end}` : start;
  }

  function formatDdlTime(ddl) {
    return `${ddl.date} ${ddl.time || "23:59"}`;
  }

  function formatCompletedDdlTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = pad(date.getHours());
    const minute = pad(date.getMinutes());
    return `${month}月${day}日 ${hour}:${minute}`;
  }

  function reminderSummary(ddl) {
    if (!ddl.reminders?.length) return "未设置通知";
    const labels = new Map(REMINDER_OPTIONS);
    return ddl.reminders.map((value) => labels.get(String(value))).filter(Boolean).join("、");
  }

  function sortDisplayItems(a, b) {
    return (a.startMinute ?? clockToMinutes(a.startTime || "23:59")) - (b.startMinute ?? clockToMinutes(b.startTime || "23:59"))
      || COLLATOR.compare(a.title || a.name || "", b.title || b.name || "");
  }

  function sortDdls(a, b) {
    return `${a.date} ${a.time || "23:59"}`.localeCompare(`${b.date} ${b.time || "23:59"}`)
      || COLLATOR.compare(a.topic || "", b.topic || "");
  }

  function displayEndDate(item) {
    const time = item.endTime || item.time || "23:59";
    return new Date(`${item.date || todayString()}T${time}:00`);
  }

  function scheduleProgress(item) {
    if (!item.date || !item.startTime || !item.endTime) return 0;
    const start = new Date(`${item.date}T${item.startTime}:00`).getTime();
    const end = new Date(`${item.date}T${item.endTime}:00`).getTime();
    const now = Date.now();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || now <= start) return 0;
    if (now >= end) return 100;
    return Math.round(((now - start) / (end - start)) * 100);
  }

  function isCompleted(id) {
    return state.completedDdls.some((item) => item.id === id);
  }

  function targetKeyForCourse(key) {
    return `course:${key}`;
  }

  function targetKeyForRecurring(id) {
    return `recurring:${id}`;
  }

  function targetKeyForCustom(id) {
    return `custom:${id}`;
  }

  function noteKeyForCourse(key) {
    return `course:${key}`;
  }

  function noteKeyForRecurring(id) {
    return `recurring:${id}`;
  }

  function noteKeyForCustom(id) {
    return `custom:${id}`;
  }

  function noteKeyForTarget(targetKey) {
    const key = String(targetKey || "");
    if (key.startsWith("course:")) return noteKeyForCourse(key.slice(7));
    if (key.startsWith("recurring:")) return noteKeyForRecurring(key.slice(10));
    if (key.startsWith("custom:")) return noteKeyForCustom(key.slice(7));
    if (key.startsWith("exam:") || key.startsWith("special:")) return key;
    return "";
  }

  function pushDateItem(map, date, item) {
    if (!validDate(date)) return;
    if (!map[date]) map[date] = [];
    map[date].push(item);
    map[date].sort(sortDisplayItems);
  }

  function readJson(key) {
    return safeJson(localStorage.getItem(key));
  }

  function safeJson(raw) {
    try {
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function setText(element, value) {
    if (element && element.textContent !== String(value)) element.textContent = String(value);
  }

  function setCachedHtml(element, html, key = html) {
    if (!element) return false;
    const cacheKey = String(key);
    if (htmlCache.get(element) === cacheKey) return false;
    element.innerHTML = html;
    htmlCache.set(element, cacheKey);
    return true;
  }

  function clearCachedHtml(element) {
    if (!element) return;
    htmlCache.delete(element);
    element.innerHTML = "";
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeTime(value) {
    const text = String(value || "").trim();
    const match = text.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return "00:00";
    return `${pad(clamp(Number(match[1]), 0, 23))}:${pad(clamp(Number(match[2]), 0, 59))}`;
  }

  function validTimeInputValue(value) {
    const text = String(value || "").trim();
    const match = text.match(/^(\d{1,2}):(\d{1,2})$/);
    if (!match) return "";
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
    return `${pad(hour)}:${pad(minute)}`;
  }

  function dateTimeStamp(date, time, endOfMinute = false) {
    const normalizedDate = validDateInputValue(date);
    const normalizedTime = validTimeInputValue(time);
    if (!normalizedDate || !normalizedTime) return null;
    const [year, month, day] = normalizedDate.split("-").map(Number);
    const [hour, minute] = normalizedTime.split(":").map(Number);
    return new Date(year, month - 1, day, hour, minute, endOfMinute ? 59 : 0, endOfMinute ? 999 : 0).getTime();
  }

  function ddlDueStamp(ddl) {
    return dateTimeStamp(ddl?.date, validTimeInputValue(ddl?.time) || "23:59", false);
  }

  function normalizeSearchText(value) {
    return normalizeText(value).toLocaleLowerCase();
  }

  function searchTokens(value) {
    return normalizeSearchText(value).split(/\s+/).filter(Boolean);
  }

  function clockToMinutes(value) {
    const [hour, minute] = normalizeTime(value).split(":").map(Number);
    return hour * 60 + minute;
  }

  function todayString() {
    return formatDate(new Date());
  }

  function dateLabel(value) {
    const info = dateInfo(value);
    return `${info.month}月${info.dayOfMonth}日 周${info.day}`;
  }

  function dateInfo(value) {
    const date = toDate(value);
    const dayIndex = (date.getDay() + 6) % 7;
    return {
      date,
      dayIndex,
      day: DAYS[dayIndex],
      label: `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`,
      month: date.getMonth() + 1,
      dayOfMonth: date.getDate()
    };
  }

  function toDate(value) {
    const fallback = new Date();
    const text = validDate(value) ? value : formatDate(fallback);
    const [year, month, day] = text.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function formatDate(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function addDays(value, delta) {
    const date = toDate(value);
    date.setDate(date.getDate() + Number(delta || 0));
    return formatDate(date);
  }

  function validDate(value) {
    const text = String(value || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    const [year, month, day] = text.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  function validDateInputValue(value) {
    const text = String(value || "").trim();
    return validDate(text) ? text : "";
  }

  function daysInMonth(year, month) {
    return new Date(Number(year), Number(month), 0).getDate();
  }

  function datePickerBound(input, key) {
    const attr = key === "dateMin" ? "min" : "max";
    return validDateInputValue(input?.dataset?.[key] || input?.getAttribute?.(attr) || "");
  }

  function clampDateForInput(value, input = datePickerInput) {
    let date = validDateInputValue(value) || todayString();
    const min = datePickerBound(input, "dateMin");
    const max = datePickerBound(input, "dateMax");
    if (min && date < min) date = min;
    if (max && date > max) date = max;
    return date;
  }

  function setDatePickerFromDate(value) {
    const date = clampDateForInput(value);
    datePickerYear = Number(date.slice(0, 4));
    datePickerMonth = Number(date.slice(5, 7));
    datePickerDay = Number(date.slice(8, 10));
  }

  function setDatePickerParts(year, month, day) {
    const safeYear = clamp(Number(year), DATE_PICKER_MIN_YEAR, DATE_PICKER_MAX_YEAR);
    const safeMonth = clamp(Number(month), 1, 12);
    const safeDay = clamp(Number(day), 1, daysInMonth(safeYear, safeMonth));
    setDatePickerFromDate(`${safeYear}-${pad(safeMonth)}-${pad(safeDay)}`);
  }

  function formatPickerDate() {
    return clampDateForInput(`${datePickerYear}-${pad(datePickerMonth)}-${pad(datePickerDay)}`);
  }

  function pickerDateLabel(value = formatPickerDate()) {
    const info = dateInfo(value);
    return `${info.label} · 周${info.day}`;
  }

  function datePickerYears() {
    const currentYear = Number(todayString().slice(0, 4));
    const min = datePickerBound(datePickerInput, "dateMin");
    const max = datePickerBound(datePickerInput, "dateMax");
    let start = Math.min(currentYear, datePickerYear) - DATE_PICKER_YEAR_RADIUS;
    let end = Math.max(currentYear, datePickerYear) + DATE_PICKER_YEAR_RADIUS;
    if (min) start = Math.min(start, Number(min.slice(0, 4)));
    if (max) end = Math.min(end, Number(max.slice(0, 4)));
    start = clamp(start, DATE_PICKER_MIN_YEAR, DATE_PICKER_MAX_YEAR);
    end = clamp(end, start, DATE_PICKER_MAX_YEAR);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
  }

  function newId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  init();
})();
