(function (global) {
  "use strict";

  const MODULES = [
    ["status", "状态", "components"],
    ["ddl", "DDL", "components"],
    ["day", "今日", "components"],
    ["overview", "概览", "components"]
  ];

  const DEFAULT_ORDER = ["status", "ddl", "day", "overview"];
  const DEFAULT_VISIBILITY = Object.fromEntries(MODULES.map(([key]) => [key, true]));

  const ACTIONS = {
    today: { label: "今日", action: "jump-today", layer: "commands", targetLayer: "cache" },
    portal: { label: "教务", action: "open-portal", layer: "platform", targetLayer: "source" },
    file: { label: "文件", action: "choose-file", layer: "source", targetLayer: "domain" },
    newDdl: { label: "新DDL", action: "new-ddl", layer: "commands", targetLayer: "domain" },
    openDdl: { label: "DDL", action: "open-ddl", layer: "commands", targetLayer: "components" },
    newSchedule: { label: "新日程", action: "new-schedule", layer: "commands", targetLayer: "domain" },
    newRecurring: { label: "常驻", action: "new-recurring", layer: "commands", targetLayer: "domain" },
    openSchedules: { label: "日程", action: "open-schedules", layer: "commands", targetLayer: "components" },
    openCourses: { label: "课程", action: "open-courses", layer: "commands", targetLayer: "components" },
    openExams: { label: "考试", action: "open-exams", layer: "commands", targetLayer: "components" },
    openSpecials: { label: "变更", action: "open-specials", layer: "commands", targetLayer: "components" },
    newSpecial: { label: "新变更", action: "new-special", layer: "commands", targetLayer: "domain" },
    settings: { label: "设置", action: "open-settings", layer: "commands", targetLayer: "components" }
  };

  const INPUT_COMPONENTS = {
    originalGlass: {
      label: "原版玻璃输入",
      variant: "originalGlass",
      density: "airy",
      shape: "roundedGlass",
      popup: "glassSheet",
      affordance: "softBadge",
      themeSync: true
    },
    glassPill: {
      label: "玻璃胶囊输入",
      variant: "glassPill",
      density: "airy",
      shape: "pillGlass",
      popup: "glassSheet",
      affordance: "softBadge",
      themeSync: true
    },
    sheetInput: {
      label: "抽屉面板输入",
      variant: "sheetInput",
      density: "comfortable",
      shape: "roundedPanel",
      popup: "sheet",
      affordance: "lineBadge",
      themeSync: true
    },
    drawerInput: {
      label: "侧栏紧凑输入",
      variant: "drawerInput",
      density: "comfortable",
      shape: "sidePanel",
      popup: "drawer",
      affordance: "lineBadge",
      themeSync: true
    },
    compactInput: {
      label: "紧凑输入",
      variant: "compactInput",
      density: "compact",
      shape: "compactChip",
      popup: "compactSheet",
      affordance: "minimal",
      themeSync: true
    }
  };

  const TEMPLATES = {
    classicOriginal: createTemplate({
      label: "原版实机",
      description: "按原版自定义主题的首页结构和浮窗质感装配",
      order: ["day", "overview", "status", "ddl"],
      visibility: { status: false, ddl: false, day: true, overview: true },
      actions: ["today", "settings"],
      mode: "floating",
      modalLayout: "floating",
      density: "airy",
      inputUi: "originalGlass"
    }),
    glassFlow: createTemplate({
      label: "玻璃悬浮",
      description: "旧版透明玻璃和悬浮卡片气质",
      order: ["status", "ddl", "day", "overview"],
      actions: ["newDdl", "newSchedule", "openCourses", "openSpecials"],
      mode: "floating",
      modalLayout: "floating",
      density: "airy",
      inputUi: "glassPill"
    }),
    todayFocus: createTemplate({
      label: "今日优先",
      description: "打开后先看当天安排，再看 DDL",
      order: ["status", "day", "ddl", "overview"],
      actions: ["today", "newSchedule", "newRecurring", "newDdl"],
      mode: "sheet",
      modalLayout: "bottomSheet",
      density: "comfortable",
      inputUi: "sheetInput"
    }),
    ddlFocus: createTemplate({
      label: "DDL 优先",
      description: "任务截止置顶，适合赶作业",
      order: ["status", "ddl", "overview", "day"],
      actions: ["newDdl", "openDdl", "newSchedule", "openSpecials"],
      mode: "drawer",
      modalLayout: "sideSheet",
      density: "comfortable",
      inputUi: "drawerInput"
    }),
    courseFocus: createTemplate({
      label: "课程优先",
      description: "课表概览更靠前，适合查课",
      order: ["status", "overview", "day", "ddl"],
      actions: ["openCourses", "portal", "newSchedule", "newSpecial"],
      mode: "panel",
      modalLayout: "centerPanel",
      density: "comfortable",
      inputUi: "sheetInput"
    }),
    compact: createTemplate({
      label: "紧凑列表",
      description: "信息密度更高，减少滚动",
      order: ["status", "day", "overview", "ddl"],
      actions: ["today", "newSchedule", "newDdl", "settings"],
      mode: "compact",
      modalLayout: "compactSheet",
      density: "compact",
      inputUi: "compactInput"
    })
  };

  function createTemplate(config) {
    return {
      label: config.label,
      description: config.description,
      order: config.order.slice(),
      actions: config.actions.slice(),
      interaction: {
        label: config.label,
        mode: config.mode,
        modalLayout: config.modalLayout,
        density: config.density,
        inputUi: normalizeInputUi(config.inputUi)
      },
      assemble(context) {
        const overrides = context.overrides || {};
        const order = normalizeOrder(overrides.order && overrides.order.length ? overrides.order : config.order);
        const visibility = normalizeVisibility(overrides.visibility || config.visibility || DEFAULT_VISIBILITY);
        const actions = config.actions.map((key) => ACTIONS[key]).filter(Boolean);
        return {
          id: context.id,
          label: config.label,
          description: config.description,
          order,
          visibility,
          components: order.map((key) => ({
            id: key,
            label: moduleLabel(key),
            layer: "components",
            visible: visibility[key] !== false
          })),
          actions,
          interaction: {
            label: config.label,
            mode: config.mode,
            modalLayout: config.modalLayout,
            density: config.density,
            inputUi: normalizeInputUi(config.inputUi),
            layer: "interaction"
          },
          inputUi: {
            ...normalizeInputUi(config.inputUi),
            layer: "template",
            targetLayer: "theme"
          },
          layerTrace: ["template", "components", "commands", "interaction", "theme"]
        };
      }
    };
  }

  function normalizeInputUi(value) {
    const key = String(value || "originalGlass");
    const preset = INPUT_COMPONENTS[key] || INPUT_COMPONENTS.originalGlass;
    return { ...preset };
  }

  function normalizeTemplateId(value) {
    const id = String(value || "");
    return id in TEMPLATES ? id : "classicOriginal";
  }

  function normalizeOrder(value) {
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
      if (DEFAULT_ORDER.includes(key) && !result.includes(key)) result.push(key);
    });
    DEFAULT_ORDER.forEach((key) => {
      if (!result.includes(key)) result.push(key);
    });
    return result;
  }

  function normalizeVisibility(value) {
    const source = value && typeof value === "object" ? value : {};
    const next = {};
    MODULES.forEach(([key]) => {
      next[key] = source[key] !== false;
    });
    return next;
  }

  function moduleLabel(key) {
    return MODULES.find(([id]) => id === key)?.[1] || key;
  }

  function resolve(context = {}) {
    const state = context.state || {};
    const id = normalizeTemplateId(state.uiTemplate);
    const assembly = TEMPLATES[id].assemble({
      id,
      overrides: context.overrides || state.uiAssemblyOverrides || {}
    });
    global.YayaLayers?.registerRuntime?.("template", {
      activeTemplate: id,
      order: assembly.order,
      actions: assembly.actions.map((item) => item.action),
      interaction: assembly.interaction.modalLayout,
      inputUi: assembly.inputUi.variant,
      inputUiThemeSync: Boolean(assembly.inputUi.themeSync)
    });
    return assembly;
  }

  global.YayaUiModules = {
    MODULES,
    DEFAULT_ORDER,
    DEFAULT_VISIBILITY,
    ACTIONS,
    INPUT_COMPONENTS,
    TEMPLATES,
    normalizeTemplateId,
    normalizeInputUi,
    normalizeOrder,
    normalizeVisibility,
    moduleLabel,
    resolve
  };
  global.YayaLayers?.registerModule?.("ui-modules", {
    layer: "template",
    dependsOn: ["app-layers"],
    provides: ["templates", "actions", "inputComponents", "moduleOrder"],
    templateCount: Object.keys(TEMPLATES).length,
    inputComponentCount: Object.keys(INPUT_COMPONENTS).length,
    handoffTo: ["app"]
  });
  global.YayaLayers?.registerRuntime?.("template", {
    templates: Object.keys(TEMPLATES),
    modules: MODULES.map(([id]) => id),
    inputComponents: Object.keys(INPUT_COMPONENTS)
  });
})(window);
