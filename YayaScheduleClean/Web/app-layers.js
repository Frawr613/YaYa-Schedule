(function (global) {
  "use strict";

  const expectedIds = ["source", "domain", "cache", "commands", "components", "interaction", "theme", "template", "platform", "boot"];
  const expectedModuleIds = ["app-layers", "platform-bridge", "ui-modules", "theme-modules", "app"];
  const originalEffectAnchors = {
    source: ["教务导入", "文件导入", "确认学期", "教务页内确认学期", "分页采集"],
    domain: ["课程分组", "常驻日程", "日程进行中/已结束", "DDL 进行中/已完成", "已完成 DDL 内容/时间检索", "特殊变更进行中/已结束", "移动/取消变更", "取消已设置变更", "普通备注"],
    cache: ["localStorage", "日期索引", "DDL 索引", "日程/特殊变更状态分桶", "DDL 视图状态", "已完成 DDL 检索状态", "HTML 局部缓存", "浮窗惰性 HTML 缓存", "空浮窗快速跳过", "自动定位签名缓存", "滚动标记节流", "强制渲染滚动后合并", "前台恢复合并", "权限状态 UI 去重", "滚动延迟渲染闸门", "主题变量缓存", "模板签名缓存", "原生桥接去重缓存", "Service Worker"],
    commands: ["data-action", "表单提交", "左滑命令", "DDL 页签切换", "已完成 DDL 检索清除", "主题保存即时刷新", "自定义主题保存", "特殊变更撤销", "内置选项提交"],
    components: ["顶部状态", "DDL 条", "DDL 分页面板", "已完成 DDL 检索面板", "今日面板", "课程/日程概览", "课程概览打开时本学期定位", "状态分组概览卡", "主题配色面板", "模板化内置输入/选项组件"],
    interaction: ["玻璃浮窗", "本地丝滑弹出动画", "独立自定义主题面", "底部/侧边抽屉", "日期时间选择器", "模板输入浮层", "内置选项弹层", "滚动锁定", "滚动锁定签名去重", "顶层滚动白名单", "选择器轻量定位", "自动定位签名去重", "滚动标记节流", "强制渲染滚动后合并", "滚动不触发日程卡重绘", "渲染运行时节流", "模板 DOM 去重应用", "空浮窗快速跳过", "浮窗惰性 HTML 生成", "教务页内确认浮窗", "视窗锁定拖动"],
    theme: ["玻璃变量", "暗色玻璃变量", "暗色基底识别", "暗色透明哑光玻璃", "标题卡日程卡同步", "标题左右按钮同步", "标题/小日程默认透明度隔离", "主题保存即时刷新", "主题 CSS 去重应用", "暗色反光降噪", "主题预设", "自定义主题栏", "独立自定义主题面", "模板-主题桥接", "输入组件主题变量", "模块语义色", "状态色", "应用图标"],
    template: ["模块顺序", "入口动作", "浮窗策略", "输入组件形态", "主题桥接变量", "模块语义槽位", "模板 DOM 去重应用"],
    platform: ["原生 WebView", "通知", "后台/系统提醒管理", "应用图标", "小组件", "Widget 去重刷新", "iOS Widget 刷新合批", "iOS 提醒重复挂载去重", "iOS 前后台提醒轻量恢复", "iOS 前台恢复合并", "iOS 权限状态查询节流", "iOS 权限状态 UI 去重", "iOS 教务状态回写去重", "教务单层网页登录", "教务主题桥接去重"],
    boot: ["脚本顺序", "恢复状态", "启动当天聚焦", "跨天自检", "预览闭合检查"]
  };

  const layers = [
    {
      id: "source",
      name: "原始数据导入层",
      files: ["app.js"],
      owns: ["教务 HTML", "教务学期字段", "教务分页内容", "网页型 XLS", "CSV/TXT", "备份 JSON"],
      provides: ["原始课表行", "原始考试行", "分页采集载荷", "学期候选", "备份载荷"],
      effects: originalEffectAnchors.source,
      dependsOn: [],
      handoffTo: ["domain"]
    },
    {
      id: "domain",
      name: "领域模型层",
      files: ["app.js"],
      owns: ["课程", "学期确认", "课程分组", "日程", "日程进行中/已结束", "DDL", "DDL 进行中/已完成", "已完成 DDL 内容/时间检索", "考试", "特殊变更进行中/已结束", "移动/取消变更", "取消已设置变更", "普通备注"],
      provides: ["标准课程事件", "按课程聚合结果", "标准日程项", "日程状态分桶", "标准 DDL 项", "DDL 完成归档", "已完成 DDL 筛选结果", "特殊变更状态分桶", "备注归属"],
      effects: originalEffectAnchors.domain,
      dependsOn: ["source"],
      handoffTo: ["cache", "commands"]
    },
    {
      id: "cache",
      name: "本地状态/缓存层",
      files: ["app.js", "sw.js"],
      owns: ["localStorage 状态", "日期索引", "DDL 索引", "日程/特殊变更状态分桶", "DDL 页签状态", "已完成 DDL 检索状态", "HTML 局部缓存", "浮窗惰性 HTML 缓存", "空浮窗快速跳过", "自动定位签名缓存", "当天条目缓存", "滚动标记节流", "强制渲染滚动后合并", "前台恢复合并", "权限状态 UI 去重", "滚动延迟渲染闸门", "主题/模板应用签名缓存", "原生桥接去重缓存", "Service Worker 优先缓存"],
      provides: ["当天日程读取", "日程/特殊变更进行中计数", "DDL 快照", "DDL 进行中/已完成快照", "已完成 DDL 检索快照", "局部渲染快照", "浮窗惰性 HTML 快照", "空浮窗无操作快照", "自动定位去重签名", "滚动标记低频刷新", "滚动后合并强制渲染", "前台恢复合并触发", "权限状态 UI 去重签名", "滚动后仅补积压渲染", "主题/模板去重签名", "原生桥接去重签名", "离线资源"],
      effects: originalEffectAnchors.cache,
      dependsOn: ["domain"],
      handoffTo: ["components", "platform"]
    },
    {
      id: "commands",
      name: "功能命令层",
      files: ["app.js", "ui-modules.js"],
      owns: ["打开", "保存", "完成", "删除", "导入", "DDL 页签切换", "已完成 DDL 检索清除", "主题保存即时刷新", "自定义主题保存", "特殊变更撤销", "备注查看修改", "预览动作映射"],
      provides: ["data-action 命令", "表单提交命令", "业务状态变更", "DDL 视图命令", "已完成 DDL 检索命令", "主题即时应用命令", "主题一次性应用", "备注常规入口"],
      effects: originalEffectAnchors.commands,
      dependsOn: ["domain", "cache"],
      handoffTo: ["components", "template", "platform"]
    },
    {
      id: "components",
      name: "UI 组件层",
      files: ["app.js", "styles.css"],
      owns: ["状态条", "DDL 条", "DDL 页签面板", "已完成 DDL 检索面板", "日期查询", "日期选择器", "时间选择器", "内置选项组件", "今日面板", "概览卡", "课程概览打开时定位", "状态分组概览卡", "设置浮窗", "主题配色面板", "备注卡片"],
      provides: ["可排序模块", "可隐藏模块", "功能面板 DOM", "DDL 分页 DOM", "已完成 DDL 检索 DOM", "课程分组卡片", "课程概览打开定位 DOM", "日程/特殊变更状态页 DOM", "模板输入组件 DOM"],
      effects: originalEffectAnchors.components,
      dependsOn: ["cache", "commands"],
      handoffTo: ["template", "interaction", "theme"]
    },
    {
      id: "interaction",
      name: "交互控制层",
      files: ["app.js", "styles.css", "ui-modules.js"],
      owns: ["浮窗层级", "独立自定义主题面", "底部抽屉", "侧边抽屉", "居中面板", "选择器浮层", "滚动隔离", "滚动锁定签名去重", "顶层滚动白名单", "选择器轻量定位", "自动定位签名去重", "滚动标记节流", "强制渲染滚动后合并", "滚动不触发日程卡重绘", "渲染运行时节流", "模板 DOM 去重应用", "空浮窗快速跳过", "浮窗惰性 HTML 生成", "滑动操作", "重渲染保护"],
      provides: ["modalLayout", "density", "浮窗置顶", "下层冻结", "滚动渲染闸门", "滚动标记低频刷新", "滚动后合并强制渲染", "运行时刷新预算", "模板应用去重", "空浮窗无操作", "浮窗内容惰性生成", "自动定位去重", "选择器轻量定位", "轻触反馈", "繁忙降噪"],
      effects: originalEffectAnchors.interaction,
      dependsOn: ["components"],
      handoffTo: ["template"]
    },
    {
      id: "theme",
      name: "视觉主题层",
      files: ["app.js", "styles.css", "theme-modules.js"],
      owns: ["主题预设", "自定义主题栏", "独立自定义主题面", "详细变量", "状态色", "玻璃感", "暗色玻璃感", "暗色基底识别", "暗色透明哑光玻璃", "标题卡日程卡同步", "标题左右按钮同步", "标题/小日程默认透明度隔离", "主题保存即时刷新", "主题 CSS 去重应用", "暗色反光降噪", "圆角阴影", "输入组件主题变量"],
      provides: ["CSS 变量", "功能状态色", "静态主题预览", "自定义主题即时应用", "自定义主题一次性应用", "主题应用去重签名", "模板主题桥接变量", "暗色日程卡槽位", "标题卡日程卡同步槽位", "标题左右按钮同步槽位", "标题/小日程默认透明度槽位", "暗色页面/浮窗反光槽位", "底层暗色透明哑光玻璃变量", "输入组件主题同步变量"],
      effects: originalEffectAnchors.theme,
      dependsOn: ["components"],
      handoffTo: ["template"]
    },
    {
      id: "template",
      name: "模板装配层",
      files: ["ui-modules.js", "theme-modules.js", "app.js", "styles.css"],
      owns: ["模块顺序", "模块可见性", "功能入口栏", "交互策略", "组件组合", "输入组件形态", "模板 DOM 去重应用"],
      provides: ["UI 装配结果", "入口动作集合", "交互模式", "主题语义槽位", "模板输入组件配置", "模板应用去重签名"],
      effects: originalEffectAnchors.template,
      dependsOn: ["components", "commands", "interaction", "theme"],
      handoffTo: ["boot"]
    },
    {
      id: "platform",
      name: "平台桥接层",
      files: ["platform-bridge.js", "app.js"],
      owns: ["原生保存", "通知", "后台/系统提醒管理", "应用图标", "小组件", "Widget 去重刷新", "iOS Widget 刷新合批", "iOS 提醒重复挂载去重", "iOS 前后台提醒轻量恢复", "iOS 前台恢复合并", "iOS 权限状态查询节流", "iOS 权限状态 UI 去重", "iOS 教务状态回写去重", "教务 WebView", "单层网页登录", "教务主题桥接去重", "Web 预览降级"],
      provides: ["统一平台 API", "原生能力探测", "后台提醒状态", "后台提醒状态节流", "前台恢复合并触发", "权限状态 UI 去重签名", "Widget 更新", "Widget 去重更新", "Widget 刷新合批", "教务导入回传", "教务状态回写去重", "教务主题桥接去重", "安全降级"],
      effects: originalEffectAnchors.platform,
      dependsOn: ["commands", "cache"],
      handoffTo: ["boot"]
    },
    {
      id: "boot",
      name: "启动/持久化层",
      files: ["index.html", "app.js", "app-layers.js", "platform-bridge.js", "ui-modules.js", "theme-modules.js"],
      owns: ["脚本加载顺序", "恢复状态", "启动当天聚焦", "跨天自检", "注册事件", "离开页面落盘", "预览闭合检查"],
      provides: ["完整应用运行时", "当天默认焦点", "预览器自检状态"],
      effects: originalEffectAnchors.boot,
      dependsOn: ["source", "domain", "cache", "commands", "components", "interaction", "theme", "template", "platform"],
      handoffTo: []
    }
  ];

  const byId = Object.fromEntries(layers.map((layer) => [layer.id, layer]));
  const runtime = {};
  const modules = {};
  let moduleSequence = 0;

  function get(id) {
    return byId[id] || null;
  }

  function trace(id, visited = new Set()) {
    const layer = get(id);
    if (!layer || visited.has(id)) return [];
    visited.add(id);
    return [
      ...layer.dependsOn.flatMap((dependency) => trace(dependency, visited)),
      layer
    ];
  }

  function registerRuntime(layerId, payload) {
    if (!get(layerId)) return;
    runtime[layerId] = { ...(runtime[layerId] || {}), ...payload, updatedAt: new Date().toISOString() };
  }

  function registerModule(moduleId, payload = {}) {
    const id = String(moduleId || "").trim();
    if (!id) return;
    const previous = modules[id] || {};
    const order = previous.order || ++moduleSequence;
    modules[id] = {
      ...previous,
      ...payload,
      id,
      order,
      loaded: true,
      loadedAt: previous.loadedAt || new Date().toISOString()
    };
    runtime.boot = {
      ...(runtime.boot || {}),
      moduleLoadCount: Object.keys(modules).length,
      moduleLoadOk: validateModules().ok,
      loadedModules: expectedModuleIds.filter((expectedId) => modules[expectedId]),
      updatedAt: new Date().toISOString()
    };
  }

  function validateModules() {
    const moduleMissing = expectedModuleIds.filter((id) => !modules[id]);
    const loadedExpected = expectedModuleIds.filter((id) => modules[id]);
    const loadedOrder = loadedExpected.slice().sort((a, b) => modules[a].order - modules[b].order);
    const moduleOrderBreaks = loadedOrder
      .map((id, index) => id === loadedExpected[index] ? "" : `${loadedExpected[index]}!=${id}`)
      .filter(Boolean);
    return {
      ok: moduleMissing.length === 0 && moduleOrderBreaks.length === 0,
      expected: expectedModuleIds.slice(),
      loaded: Object.keys(modules).sort((a, b) => modules[a].order - modules[b].order),
      moduleMissing,
      moduleOrderBreaks
    };
  }

  function validateClosure() {
    const ids = new Set(layers.map((layer) => layer.id));
    const moduleState = validateModules();
    const missing = expectedIds.filter((id) => !ids.has(id));
    const dependencyBreaks = layers.flatMap((layer) => layer.dependsOn
      .filter((dependency) => !ids.has(dependency))
      .map((dependency) => `${layer.id}->${dependency}`));
    const handoffBreaks = layers.flatMap((layer) => layer.handoffTo
      .filter((target) => !ids.has(target))
      .map((target) => `${layer.id}->${target}`));
    const runtimeMissing = expectedIds.filter((id) => !runtime[id] || !Object.keys(runtime[id]).length);
    const repeated = expectedIds.filter((id, index) => expectedIds.indexOf(id) !== index);
    const ok = layers.length === expectedIds.length
      && missing.length === 0
      && dependencyBreaks.length === 0
      && handoffBreaks.length === 0
      && repeated.length === 0
      && runtimeMissing.length === 0
      && moduleState.ok;
    return {
      ok,
      expected: expectedIds.slice(),
      ids: layers.map((layer) => layer.id),
      expectedModules: moduleState.expected,
      loadedModules: moduleState.loaded,
      missing,
      moduleMissing: moduleState.moduleMissing,
      moduleOrderBreaks: moduleState.moduleOrderBreaks,
      dependencyBreaks,
      handoffBreaks,
      runtimeMissing,
      originalEffectAnchors
    };
  }

  function describe(id) {
    const layer = get(id);
    if (!layer) return null;
    return {
      ...layer,
      runtime: runtime[id] || {},
      trace: trace(id).map((item) => item.id)
    };
  }

  global.YayaLayers = {
    all: layers,
    ids: layers.map((layer) => layer.id),
    expectedIds: expectedIds.slice(),
    originalEffectAnchors,
    runtime,
    modules,
    get,
    trace,
    describe,
    registerModule,
    registerRuntime,
    validateModules,
    validateClosure
  };
  registerModule("app-layers", {
    layer: "boot",
    provides: ["YayaLayers", "validateClosure", "validateModules"],
    handoffTo: ["platform-bridge", "ui-modules", "theme-modules", "app"]
  });
})(window);
