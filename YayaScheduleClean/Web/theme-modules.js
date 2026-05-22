(function (global) {
  "use strict";

  const THEME_ALIASES = {
    cool: "coolGlass",
    clear: "coolGlass",
    study: "coolGlass",
    warm: "warmGlass",
    berry: "warmGlass",
    custom: "classicCustom",
    customMono: "classicCustom",
    classic: "classicCustom",
    classicCustom: "classicCustom"
  };

  const BASE_BRIDGE = {
    "--blue": "#2563eb",
    "--green": "#14b8a6",
    "--orange": "#f59e0b",
    "--violet": "#7c3aed",
    "--tpl-action-text": "#ffffff",
    "--tpl-action-today-text": "#ffffff",
    "--tpl-action-settings-text": "#ffffff",
    "--tpl-date-main-text": "#111827",
    "--tpl-date-main-muted": "rgba(17, 24, 39, 0.7)",
    "--tpl-date-main-subtle": "rgba(17, 24, 39, 0.58)",
    "--tpl-today-card-text": "#111827",
    "--tpl-today-card-muted": "rgba(17, 24, 39, 0.66)",
    "--tpl-today-time-text": "#ffffff"
  };

  const PRESETS = {
    coolGlass: bridge({
      "--page-bg": "#edf5ff",
      "--ink": "#14213d",
      "--muted": "#64748b",
      "--line": "rgba(37, 99, 235, 0.16)",
      "--tpl-bg": "radial-gradient(circle at 18% 8%, rgba(124, 58, 237, 0.16), transparent 32%), radial-gradient(circle at 86% 12%, rgba(16, 185, 129, 0.14), transparent 30%), linear-gradient(180deg, #f8fbff 0%, #eef4ff 52%, #eef9f6 100%)",
      "--tpl-body": "linear-gradient(135deg, rgba(37, 99, 235, 0.1), rgba(124, 58, 237, 0.09), rgba(16, 185, 129, 0.08)), linear-gradient(180deg, rgba(255, 255, 255, 0.58), rgba(255, 255, 255, 0.08))",
      "--tpl-ink": "#111111",
      "--tpl-muted": "rgba(17, 17, 17, 0.66)",
      "--tpl-line": "rgba(37, 99, 235, 0.16)",
      "--tpl-brand": "#2563eb",
      "--tpl-brand-deep": "#1d4ed8",
      "--tpl-surface": "linear-gradient(145deg, rgba(255, 255, 255, 0.78), rgba(239, 246, 255, 0.5)), rgba(255, 255, 255, 0.42)",
      "--tpl-surface-strong": "linear-gradient(145deg, rgba(255, 255, 255, 0.9), rgba(239, 246, 255, 0.64)), rgba(255, 255, 255, 0.58)",
      "--tpl-card": "linear-gradient(145deg, rgba(255, 255, 255, 0.76), rgba(239, 246, 255, 0.48)), rgba(255, 255, 255, 0.34)",
      "--tpl-card-solid": "linear-gradient(145deg, #ffffff, #eff6ff 50%, #ecfdf5), #ffffff",
      "--tpl-card-active": "linear-gradient(145deg, #ffffff, #dbeafe 48%, #ecfdf5), #ffffff",
      "--tpl-input": "linear-gradient(145deg, rgba(255, 255, 255, 0.84), rgba(239, 246, 255, 0.58)), rgba(255, 255, 255, 0.46)",
      "--tpl-chip": "linear-gradient(145deg, rgba(255, 255, 255, 0.78), rgba(239, 246, 255, 0.52)), rgba(255, 255, 255, 0.36)",
      "--tpl-chip-active": "linear-gradient(135deg, rgba(37, 99, 235, 0.86), rgba(124, 58, 237, 0.68), rgba(16, 185, 129, 0.7))",
      "--tpl-hero": "linear-gradient(135deg, rgba(16, 185, 129, 0.76), rgba(37, 99, 235, 0.74) 58%, rgba(124, 58, 237, 0.72)), rgba(255, 255, 255, 0.16)",
      "--tpl-hero-text": "#111827",
      "--tpl-hero-muted": "rgba(17, 24, 39, 0.72)",
      "--tpl-primary-action": "linear-gradient(135deg, rgba(37, 99, 235, 0.86), rgba(124, 58, 237, 0.68), rgba(16, 185, 129, 0.7))",
      "--tpl-action-today": "radial-gradient(circle at 20% 16%, rgba(255, 255, 255, 0.2), transparent 34%), linear-gradient(135deg, rgba(37, 99, 235, 0.74), rgba(14, 165, 233, 0.62) 50%, rgba(20, 184, 166, 0.56))",
      "--tpl-action-settings": "radial-gradient(circle at 78% 18%, rgba(255, 255, 255, 0.18), transparent 36%), linear-gradient(135deg, rgba(124, 58, 237, 0.7), rgba(37, 99, 235, 0.58) 50%, rgba(20, 184, 166, 0.52))",
      "--tpl-action-add": "linear-gradient(135deg, rgba(16, 185, 129, 0.86), rgba(37, 99, 235, 0.58))",
      "--tpl-action-panel": "linear-gradient(135deg, rgba(14, 165, 233, 0.76), rgba(124, 58, 237, 0.58))",
      "--tpl-action-hint": "linear-gradient(135deg, rgba(217, 119, 6, 0.86), rgba(245, 158, 11, 0.68))",
      "--tpl-action-portal": "linear-gradient(135deg, rgba(239, 68, 68, 0.84), rgba(249, 115, 22, 0.68))",
      "--tpl-ddl-mini-bg": "linear-gradient(135deg, rgba(37, 99, 235, 0.82), rgba(124, 58, 237, 0.62), rgba(16, 185, 129, 0.66)), rgba(255, 255, 255, 0.16)",
      "--tpl-ddl-mini-text": "#ffffff",
      "--tpl-ddl-mini-border": "rgba(255, 255, 255, 0.42)",
      "--tpl-ddl-mini-shadow": "0 8px 18px rgba(37, 99, 235, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.36)",
      "--tpl-border": "rgba(255, 255, 255, 0.5)",
      "--tpl-border-dark": "rgba(37, 99, 235, 0.16)",
      "--tpl-shadow": "0 16px 36px rgba(37, 99, 235, 0.1)",
      "--tpl-shadow-strong": "0 22px 50px rgba(15, 23, 42, 0.14)"
    }, todaySlots("cool")),

    warmGlass: bridge({
      "--page-bg": "#fff4ed",
      "--ink": "#2f1b12",
      "--muted": "#7c6357",
      "--line": "rgba(249, 115, 22, 0.18)",
      "--tpl-bg": "radial-gradient(circle at 18% 8%, rgba(249, 115, 22, 0.16), transparent 32%), radial-gradient(circle at 86% 14%, rgba(219, 39, 119, 0.12), transparent 30%), linear-gradient(180deg, #fffaf5 0%, #fff4ed 52%, #fff7ed 100%)",
      "--tpl-body": "linear-gradient(135deg, rgba(249, 115, 22, 0.1), rgba(219, 39, 119, 0.08), rgba(245, 158, 11, 0.08)), linear-gradient(180deg, rgba(255, 250, 245, 0.64), rgba(255, 247, 237, 0.1))",
      "--tpl-ink": "#111111",
      "--tpl-muted": "rgba(17, 17, 17, 0.66)",
      "--tpl-line": "rgba(249, 115, 22, 0.18)",
      "--tpl-brand": "#f97316",
      "--tpl-brand-deep": "#c2410c",
      "--tpl-surface": "linear-gradient(145deg, rgba(255, 250, 245, 0.78), rgba(255, 237, 213, 0.48)), rgba(255, 250, 245, 0.42)",
      "--tpl-surface-strong": "linear-gradient(145deg, rgba(255, 250, 245, 0.9), rgba(255, 237, 213, 0.64)), rgba(255, 250, 245, 0.58)",
      "--tpl-card": "linear-gradient(145deg, rgba(255, 250, 245, 0.76), rgba(255, 237, 213, 0.48)), rgba(255, 250, 245, 0.34)",
      "--tpl-card-solid": "linear-gradient(145deg, #fffdfa, #fff1e7 50%, #fff7ed), #fffdfa",
      "--tpl-card-active": "linear-gradient(145deg, #ffffff, #ffedd5 48%, #fff7ed), #ffffff",
      "--tpl-input": "linear-gradient(145deg, rgba(255, 250, 245, 0.86), rgba(255, 237, 213, 0.6)), rgba(255, 250, 245, 0.48)",
      "--tpl-chip": "linear-gradient(145deg, rgba(255, 250, 245, 0.78), rgba(255, 237, 213, 0.52)), rgba(255, 250, 245, 0.36)",
      "--tpl-chip-active": "linear-gradient(135deg, rgba(249, 115, 22, 0.88), rgba(219, 39, 119, 0.66), rgba(245, 158, 11, 0.7))",
      "--tpl-hero": "linear-gradient(135deg, rgba(249, 115, 22, 0.84), rgba(219, 39, 119, 0.68) 58%, rgba(245, 158, 11, 0.72)), rgba(255, 250, 245, 0.16)",
      "--tpl-hero-text": "#ffffff",
      "--tpl-hero-muted": "rgba(255, 255, 255, 0.78)",
      "--tpl-primary-action": "linear-gradient(135deg, rgba(249, 115, 22, 0.88), rgba(219, 39, 119, 0.66), rgba(245, 158, 11, 0.7))",
      "--tpl-action-today": "radial-gradient(circle at 20% 16%, rgba(255, 255, 255, 0.2), transparent 34%), linear-gradient(135deg, rgba(249, 115, 22, 0.72), rgba(219, 39, 119, 0.58) 48%, rgba(245, 158, 11, 0.54))",
      "--tpl-action-settings": "radial-gradient(circle at 78% 16%, rgba(255, 255, 255, 0.18), transparent 36%), linear-gradient(135deg, rgba(236, 72, 153, 0.68), rgba(249, 115, 22, 0.56) 48%, rgba(217, 119, 6, 0.52))",
      "--tpl-action-add": "linear-gradient(135deg, rgba(20, 184, 166, 0.78), rgba(249, 115, 22, 0.56))",
      "--tpl-action-panel": "linear-gradient(135deg, rgba(234, 88, 12, 0.74), rgba(190, 24, 93, 0.56))",
      "--tpl-action-hint": "linear-gradient(135deg, rgba(202, 138, 4, 0.86), rgba(180, 83, 9, 0.62))",
      "--tpl-action-portal": "linear-gradient(135deg, rgba(220, 38, 38, 0.84), rgba(190, 18, 60, 0.66))",
      "--tpl-ddl-mini-bg": "linear-gradient(135deg, rgba(249, 115, 22, 0.8), rgba(219, 39, 119, 0.6), rgba(245, 158, 11, 0.7)), rgba(255, 250, 245, 0.18)",
      "--tpl-ddl-mini-text": "#fff7ed",
      "--tpl-ddl-mini-border": "rgba(255, 237, 213, 0.58)",
      "--tpl-ddl-mini-shadow": "0 8px 18px rgba(249, 115, 22, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.26)",
      "--tpl-border": "rgba(255, 237, 213, 0.58)",
      "--tpl-border-dark": "rgba(249, 115, 22, 0.18)",
      "--tpl-shadow": "0 18px 42px rgba(249, 115, 22, 0.12)",
      "--tpl-shadow-strong": "0 24px 58px rgba(124, 45, 18, 0.18)"
    }, todaySlots("warm")),

    doodle: bridge({
      "--page-bg": "#f4f7ff",
      "--ink": "#1f2933",
      "--muted": "#68717a",
      "--line": "rgba(99, 102, 241, 0.18)",
      "--tpl-bg": "radial-gradient(circle at 18% 10%, rgba(56, 189, 248, 0.14), transparent 32%), radial-gradient(circle at 84% 12%, rgba(251, 191, 36, 0.15), transparent 28%), radial-gradient(circle at 72% 88%, rgba(52, 211, 153, 0.14), transparent 30%), linear-gradient(180deg, #fbfdff 0%, #f4f7ff 52%, #effdf8 100%)",
      "--tpl-body": "radial-gradient(circle at 12% 18%, rgba(251, 191, 36, 0.08) 0 18px, transparent 19px), linear-gradient(135deg, rgba(56, 189, 248, 0.09), rgba(168, 85, 247, 0.07), rgba(52, 211, 153, 0.08))",
      "--tpl-ink": "#111111",
      "--tpl-muted": "rgba(17, 17, 17, 0.66)",
      "--tpl-line": "rgba(99, 102, 241, 0.18)",
      "--tpl-brand": "#6366f1",
      "--tpl-brand-deep": "#4338ca",
      "--tpl-surface": "radial-gradient(circle at 88% 12%, rgba(251, 191, 36, 0.16) 0 7px, transparent 8px), linear-gradient(145deg, rgba(255, 255, 255, 0.84), rgba(240, 249, 255, 0.54)), rgba(255, 255, 255, 0.42)",
      "--tpl-surface-strong": "radial-gradient(circle at 88% 12%, rgba(251, 191, 36, 0.18) 0 7px, transparent 8px), linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(240, 249, 255, 0.64)), rgba(255, 255, 255, 0.58)",
      "--tpl-card": "radial-gradient(circle at 92% 18%, rgba(251, 191, 36, 0.14) 0 6px, transparent 7px), linear-gradient(145deg, rgba(255, 255, 255, 0.76), rgba(247, 242, 255, 0.5)), rgba(255, 255, 255, 0.36)",
      "--tpl-card-solid": "radial-gradient(circle at 92% 18%, rgba(251, 191, 36, 0.15) 0 6px, transparent 7px), linear-gradient(145deg, #ffffff, #f7f2ff 48%, #ecfdf5), #ffffff",
      "--tpl-card-active": "radial-gradient(circle at 92% 18%, rgba(251, 191, 36, 0.2) 0 6px, transparent 7px), linear-gradient(145deg, #ffffff, #eef2ff 48%, #dcfce7), #ffffff",
      "--tpl-input": "linear-gradient(145deg, rgba(255, 255, 255, 0.82), rgba(240, 249, 255, 0.58)), rgba(255, 255, 255, 0.46)",
      "--tpl-chip": "linear-gradient(145deg, rgba(255, 255, 255, 0.78), rgba(240, 249, 255, 0.56)), rgba(255, 255, 255, 0.36)",
      "--tpl-chip-active": "radial-gradient(circle at 84% 18%, rgba(251, 191, 36, 0.22) 0 5px, transparent 6px), linear-gradient(135deg, rgba(99, 102, 241, 0.84), rgba(20, 184, 166, 0.72))",
      "--tpl-hero": "radial-gradient(circle at 88% 20%, rgba(251, 191, 36, 0.24) 0 12px, transparent 13px), linear-gradient(135deg, rgba(99, 102, 241, 0.8), rgba(56, 189, 248, 0.72) 52%, rgba(20, 184, 166, 0.72)), rgba(255, 255, 255, 0.16)",
      "--tpl-hero-text": "#ffffff",
      "--tpl-hero-muted": "rgba(255, 255, 255, 0.78)",
      "--tpl-primary-action": "radial-gradient(circle at 84% 20%, rgba(251, 191, 36, 0.2) 0 5px, transparent 6px), linear-gradient(135deg, rgba(99, 102, 241, 0.84), rgba(20, 184, 166, 0.72))",
      "--tpl-action-today": "radial-gradient(circle at 84% 20%, rgba(255, 255, 255, 0.16) 0 5px, transparent 6px), radial-gradient(circle at 18% 18%, rgba(251, 191, 36, 0.18) 0 5px, transparent 6px), linear-gradient(135deg, rgba(56, 189, 248, 0.7), rgba(99, 102, 241, 0.58) 48%, rgba(52, 211, 153, 0.54))",
      "--tpl-action-settings": "radial-gradient(circle at 82% 22%, rgba(255, 255, 255, 0.16) 0 5px, transparent 6px), radial-gradient(circle at 20% 18%, rgba(251, 191, 36, 0.14) 0 5px, transparent 6px), linear-gradient(135deg, rgba(168, 85, 247, 0.68), rgba(56, 189, 248, 0.56) 48%, rgba(34, 197, 94, 0.52))",
      "--tpl-action-add": "radial-gradient(circle at 84% 20%, rgba(251, 191, 36, 0.22) 0 5px, transparent 6px), linear-gradient(135deg, rgba(34, 197, 94, 0.8), rgba(56, 189, 248, 0.62))",
      "--tpl-action-panel": "radial-gradient(circle at 82% 20%, rgba(251, 191, 36, 0.18) 0 5px, transparent 6px), linear-gradient(135deg, rgba(56, 189, 248, 0.72), rgba(168, 85, 247, 0.56))",
      "--tpl-action-hint": "radial-gradient(circle at 18% 20%, rgba(255, 255, 255, 0.22) 0 5px, transparent 6px), linear-gradient(135deg, rgba(245, 158, 11, 0.84), rgba(251, 191, 36, 0.66))",
      "--tpl-action-portal": "radial-gradient(circle at 82% 18%, rgba(251, 191, 36, 0.18) 0 4px, transparent 5px), linear-gradient(135deg, rgba(239, 68, 68, 0.78), rgba(251, 113, 133, 0.62))",
      "--tpl-ddl-mini-bg": "radial-gradient(circle at 88% 16%, rgba(251, 191, 36, 0.2) 0 5px, transparent 6px), linear-gradient(135deg, rgba(56, 189, 248, 0.34), rgba(168, 85, 247, 0.24), rgba(52, 211, 153, 0.26)), rgba(255, 255, 255, 0.34)",
      "--tpl-ddl-mini-text": "#111111",
      "--tpl-ddl-mini-border": "rgba(99, 102, 241, 0.28)",
      "--tpl-ddl-mini-shadow": "0 8px 18px rgba(99, 102, 241, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.3)",
      "--tpl-border": "rgba(99, 102, 241, 0.22)",
      "--tpl-border-dark": "rgba(99, 102, 241, 0.2)",
      "--tpl-shadow": "0 18px 42px rgba(99, 102, 241, 0.12)",
      "--tpl-shadow-strong": "0 24px 58px rgba(37, 99, 235, 0.16)"
    }, todaySlots("doodle")),

    mono: bridge({
      "--page-bg": "#f6f6f4",
      "--ink": "#111827",
      "--muted": "#6b7280",
      "--line": "rgba(17, 19, 22, 0.12)",
      "--tpl-bg": "radial-gradient(circle at 20% 6%, rgba(24, 24, 27, 0.06), transparent 34%), radial-gradient(circle at 86% 10%, rgba(113, 113, 122, 0.08), transparent 30%), linear-gradient(180deg, #fbfbfa 0%, #f5f5f3 52%, #eeeeec 100%)",
      "--tpl-body": "linear-gradient(135deg, rgba(24, 24, 27, 0.04), rgba(113, 113, 122, 0.035)), linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(244, 244, 242, 0.9)), #f6f6f4",
      "--tpl-ink": "#111316",
      "--tpl-muted": "rgba(17, 19, 22, 0.64)",
      "--tpl-line": "rgba(17, 19, 22, 0.12)",
      "--tpl-brand": "#202226",
      "--tpl-brand-deep": "#0b0c0e",
      "--tpl-surface": "linear-gradient(145deg, rgba(255, 255, 255, 0.88), rgba(245, 245, 243, 0.64)), rgba(255, 255, 255, 0.5)",
      "--tpl-surface-strong": "linear-gradient(145deg, rgba(255, 255, 255, 0.96), rgba(246, 246, 244, 0.76)), rgba(255, 255, 255, 0.62)",
      "--tpl-card": "linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(243, 243, 241, 0.72)), rgba(255, 255, 255, 0.46)",
      "--tpl-card-solid": "linear-gradient(145deg, #ffffff 0%, #f7f7f6 50%, #ececea 100%), #ffffff",
      "--tpl-card-active": "linear-gradient(145deg, #ffffff 0%, #f5f5f4 44%, #e2e2df 100%), #ffffff",
      "--tpl-input": "linear-gradient(145deg, rgba(255, 255, 255, 0.96), rgba(245, 245, 243, 0.78)), rgba(255, 255, 255, 0.52)",
      "--tpl-chip": "linear-gradient(145deg, rgba(255, 255, 255, 0.9), rgba(244, 244, 242, 0.72)), rgba(255, 255, 255, 0.44)",
      "--tpl-chip-active": "linear-gradient(135deg, rgba(24, 24, 27, 0.92), rgba(82, 82, 91, 0.76))",
      "--tpl-hero": "radial-gradient(circle at 16% 10%, rgba(255, 255, 255, 0.12), transparent 32%), linear-gradient(135deg, rgba(14, 15, 17, 0.96), rgba(39, 39, 42, 0.9) 58%, rgba(24, 24, 27, 0.88)), #111316",
      "--tpl-hero-text": "#ffffff",
      "--tpl-hero-muted": "rgba(255, 255, 255, 0.76)",
      "--tpl-primary-action": "linear-gradient(135deg, rgba(17, 19, 22, 0.94), rgba(75, 85, 99, 0.78))",
      "--tpl-action-today": "radial-gradient(circle at 18% 14%, rgba(255, 255, 255, 0.22), transparent 34%), linear-gradient(135deg, rgba(82, 82, 91, 0.78), rgba(63, 63, 70, 0.66) 52%, rgba(113, 113, 122, 0.58))",
      "--tpl-action-settings": "radial-gradient(circle at 82% 16%, rgba(255, 255, 255, 0.18), transparent 36%), linear-gradient(135deg, rgba(64, 64, 66, 0.74), rgba(113, 113, 122, 0.6) 48%, rgba(39, 39, 42, 0.56))",
      "--tpl-action-add": "linear-gradient(135deg, rgba(30, 33, 38, 0.9), rgba(122, 127, 136, 0.64))",
      "--tpl-action-panel": "linear-gradient(135deg, rgba(44, 47, 53, 0.84), rgba(126, 126, 132, 0.58))",
      "--tpl-action-hint": "linear-gradient(135deg, rgba(134, 134, 132, 0.84), rgba(67, 70, 76, 0.66))",
      "--tpl-action-portal": "linear-gradient(135deg, rgba(12, 13, 15, 0.94), rgba(64, 64, 66, 0.72))",
      "--tpl-ddl-mini-bg": "linear-gradient(145deg, rgba(255, 255, 255, 0.94), rgba(232, 232, 230, 0.72)), rgba(255, 255, 255, 0.6)",
      "--tpl-ddl-mini-text": "#111316",
      "--tpl-ddl-mini-border": "rgba(17, 19, 22, 0.14)",
      "--tpl-ddl-mini-shadow": "inset 0 1px 0 rgba(255, 255, 255, 0.74), 0 8px 16px rgba(17, 19, 22, 0.055)",
      "--tpl-border": "rgba(17, 19, 22, 0.1)",
      "--tpl-border-dark": "rgba(17, 19, 22, 0.13)",
      "--tpl-shadow": "0 18px 42px rgba(17, 19, 22, 0.075)",
      "--tpl-shadow-strong": "0 24px 58px rgba(17, 19, 22, 0.14)",
      "--tpl-inset": "inset 0 1px 0 rgba(255, 255, 255, 0.64)"
    }, todaySlots("mono"), {
      "--tpl-date-main-text": "#ffffff",
      "--tpl-date-main-muted": "rgba(255, 255, 255, 0.78)",
      "--tpl-date-main-subtle": "rgba(255, 255, 255, 0.62)"
    })
  };

  function todaySlots(kind) {
    const slots = {
      cool: [
        ["14, 165, 233", "37, 99, 235", "14, 165, 233"],
        ["124, 58, 237", "14, 165, 233", "124, 58, 237"],
        ["16, 185, 129", "16, 185, 129", "37, 99, 235"],
        ["245, 158, 11", "245, 158, 11", "217, 119, 6"],
        ["239, 68, 68", "239, 68, 68", "249, 115, 22"]
      ],
      warm: [
        ["249, 115, 22", "249, 115, 22", "219, 39, 119"],
        ["219, 39, 119", "234, 88, 12", "190, 24, 93"],
        ["20, 184, 166", "20, 184, 166", "249, 115, 22"],
        ["245, 158, 11", "202, 138, 4", "180, 83, 9"],
        ["220, 38, 38", "220, 38, 38", "190, 18, 60"]
      ],
      doodle: [
        ["56, 189, 248", "99, 102, 241", "56, 189, 248"],
        ["168, 85, 247", "56, 189, 248", "168, 85, 247"],
        ["34, 197, 94", "34, 197, 94", "56, 189, 248"],
        ["245, 158, 11", "245, 158, 11", "251, 191, 36"],
        ["239, 68, 68", "239, 68, 68", "251, 113, 133"]
      ],
      mono: [
        ["39, 39, 42", "17, 19, 22", "88, 90, 96"],
        ["96, 100, 108", "44, 47, 53", "126, 126, 132"],
        ["113, 113, 122", "30, 33, 38", "122, 127, 136"],
        ["148, 148, 154", "134, 134, 132", "67, 70, 76"],
        ["17, 19, 22", "12, 13, 15", "64, 64, 66"]
      ]
    }[kind];
    const names = ["course", "custom", "recurring", "special", "exam"];
    return Object.fromEntries(slots.flatMap((slot, index) => {
      const [left, a, b] = slot;
      const name = names[index];
      return [
        [`--tpl-today-${name}-bg`, `radial-gradient(circle at 92% 10%, rgba(${left}, 0.16), transparent 38%), linear-gradient(145deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.94) 52%, rgba(236, 253, 245, 0.9))`],
        [`--tpl-today-${name}-left`, `rgba(${left}, 0.88)`],
        [`--tpl-today-${name}-time`, `linear-gradient(135deg, rgba(${a}, 0.88), rgba(${b}, 0.68))`]
      ];
    }));
  }

  function bridge(...objects) {
    return Object.assign({}, BASE_BRIDGE, ...objects, {
      "--glass-panel-bg": "var(--tpl-surface-strong)",
      "--glass-card-bg": "var(--tpl-card)",
      "--glass-control-bg": "var(--tpl-input)",
      "--input-ui-bg": "var(--tpl-input)",
      "--input-ui-panel": "var(--tpl-surface-strong)",
      "--input-ui-text": "var(--tpl-ink, var(--ink))",
      "--input-ui-muted": "var(--tpl-muted, var(--muted))",
      "--input-ui-accent": "var(--tpl-brand, var(--accent))",
      "--input-ui-action": "var(--tpl-primary-action, var(--accent))",
      "--input-ui-border": "var(--tpl-border, var(--glass-border))",
      "--input-ui-border-strong": "color-mix(in srgb, var(--tpl-brand, var(--accent)) 26%, var(--tpl-border, var(--glass-border)))",
      "--input-ui-shadow": "0 10px 24px color-mix(in srgb, var(--tpl-brand, var(--accent)) 12%, transparent)",
      "--input-ui-inset": "var(--tpl-inset, var(--glass-inset))",
      "--shadow": "var(--tpl-shadow)",
      "--soft-shadow": "var(--tpl-shadow)",
      "--swipe-edit-bg": "var(--tpl-edit-action, var(--tpl-action-panel))",
      "--swipe-delete-bg": "var(--tpl-delete-action, var(--tpl-action-portal))"
    });
  }

  function custom(vars = {}) {
    const accent = normalizeColor(vars.accent, "#2563eb");
    const warm = normalizeColor(vars.warm, "#14b8a6");
    const bg = normalizeColor(vars.bg, "#edf5ff");
    const ink = normalizeColor(vars.ink, "#14213d");
    const accentRgb = hexToRgb(accent);
    const warmRgb = hexToRgb(warm);
    const dark = luminance(hexToRgb(bg)) < 0.28 || luminance(hexToRgb(ink)) > 0.72;
    const text = dark ? "#ffffff" : "#111827";
    const muted = dark ? "rgba(255, 255, 255, 0.76)" : "rgba(17, 24, 39, 0.68)";
    const surface = dark
      ? `linear-gradient(145deg, rgba(255, 255, 255, 0.14), rgba(${accentRgb}, 0.16)), rgba(15, 23, 42, 0.46)`
      : `linear-gradient(145deg, rgba(255, 255, 255, 0.82), rgba(${accentRgb}, 0.12)), rgba(255, 255, 255, 0.42)`;
    return bridge(todaySlots("cool"), {
      "--page-bg": bg,
      "--ink": ink,
      "--muted": vars.muted || muted,
      "--line": vars.line || `rgba(${accentRgb}, 0.18)`,
      "--tpl-bg": `radial-gradient(circle at 18% 8%, rgba(${accentRgb}, 0.16), transparent 32%), radial-gradient(circle at 86% 14%, rgba(${warmRgb}, 0.12), transparent 30%), linear-gradient(180deg, ${bg} 0%, color-mix(in srgb, ${bg} 82%, white) 100%)`,
      "--tpl-body": `linear-gradient(135deg, rgba(${accentRgb}, 0.1), rgba(${warmRgb}, 0.08)), linear-gradient(180deg, rgba(255, 255, 255, ${dark ? "0.08" : "0.58"}), rgba(255, 255, 255, ${dark ? "0.02" : "0.08"}))`,
      "--tpl-ink": ink,
      "--tpl-muted": vars.muted || muted,
      "--tpl-line": vars.line || `rgba(${accentRgb}, 0.18)`,
      "--tpl-brand": accent,
      "--tpl-brand-deep": accent,
      "--tpl-surface": surface,
      "--tpl-surface-strong": surface,
      "--tpl-card": vars.card || surface,
      "--tpl-card-solid": vars.card || surface,
      "--tpl-card-active": `linear-gradient(145deg, rgba(255, 255, 255, ${dark ? "0.18" : "0.9"}), rgba(${accentRgb}, 0.22))`,
      "--tpl-input": vars.panel || surface,
      "--tpl-chip": `linear-gradient(145deg, rgba(255, 255, 255, ${dark ? "0.16" : "0.78"}), rgba(${accentRgb}, 0.14))`,
      "--tpl-chip-active": `linear-gradient(135deg, rgba(${accentRgb}, 0.86), rgba(${warmRgb}, 0.68))`,
      "--tpl-hero": vars.hero || `linear-gradient(135deg, rgba(${accentRgb}, 0.78), rgba(${warmRgb}, 0.66))`,
      "--tpl-hero-text": text,
      "--tpl-hero-muted": muted,
      "--tpl-primary-action": `linear-gradient(135deg, rgba(${accentRgb}, 0.86), rgba(${warmRgb}, 0.66))`,
      "--tpl-action-today": `linear-gradient(135deg, rgba(${accentRgb}, 0.76), rgba(${warmRgb}, 0.58))`,
      "--tpl-action-settings": `linear-gradient(135deg, rgba(${warmRgb}, 0.7), rgba(${accentRgb}, 0.56))`,
      "--tpl-action-add": `linear-gradient(135deg, rgba(${warmRgb}, 0.82), rgba(${accentRgb}, 0.58))`,
      "--tpl-action-panel": `linear-gradient(135deg, rgba(${accentRgb}, 0.74), rgba(${warmRgb}, 0.54))`,
      "--tpl-action-hint": `linear-gradient(135deg, rgba(${warmRgb}, 0.84), rgba(${accentRgb}, 0.58))`,
      "--tpl-action-portal": "linear-gradient(135deg, rgba(239, 68, 68, 0.84), rgba(249, 115, 22, 0.68))",
      "--tpl-ddl-mini-bg": `linear-gradient(135deg, rgba(${accentRgb}, 0.72), rgba(${warmRgb}, 0.56))`,
      "--tpl-ddl-mini-text": "#ffffff",
      "--tpl-ddl-mini-border": "rgba(255, 255, 255, 0.42)",
      "--tpl-ddl-mini-shadow": `0 8px 18px rgba(${accentRgb}, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.3)`,
      "--tpl-border": dark ? "rgba(255, 255, 255, 0.18)" : "rgba(255, 255, 255, 0.52)",
      "--tpl-border-dark": `rgba(${accentRgb}, 0.2)`,
      "--tpl-shadow": `0 18px 42px rgba(${accentRgb}, 0.12)`,
      "--tpl-shadow-strong": `0 24px 58px rgba(${accentRgb}, 0.18)`,
      "--tpl-date-main-text": text,
      "--tpl-date-main-muted": muted,
      "--tpl-date-main-subtle": dark ? "rgba(255, 255, 255, 0.62)" : "rgba(17, 24, 39, 0.58)",
      "--tpl-today-card-text": dark ? "#f8fafc" : "#111827",
      "--tpl-today-card-muted": dark ? "rgba(255, 255, 255, 0.72)" : "rgba(17, 24, 39, 0.66)",
      "--tpl-today-course-left": `rgba(${accentRgb}, 0.88)`,
      "--tpl-today-custom-left": `rgba(${warmRgb}, 0.84)`,
      "--tpl-today-recurring-left": `rgba(${warmRgb}, 0.88)`,
      "--tpl-today-special-left": "rgba(245, 158, 11, 0.9)",
      "--tpl-today-exam-left": "rgba(239, 68, 68, 0.88)",
      "--tpl-today-course-time": `linear-gradient(135deg, rgba(${accentRgb}, 0.9), rgba(${warmRgb}, 0.68))`,
      "--tpl-today-custom-time": `linear-gradient(135deg, rgba(${warmRgb}, 0.82), rgba(${accentRgb}, 0.58))`,
      "--tpl-today-recurring-time": `linear-gradient(135deg, rgba(${warmRgb}, 0.84), rgba(${accentRgb}, 0.56))`,
      "--tpl-today-special-time": "linear-gradient(135deg, rgba(217, 119, 6, 0.86), rgba(245, 158, 11, 0.68))",
      "--tpl-today-exam-time": "linear-gradient(135deg, rgba(239, 68, 68, 0.84), rgba(249, 115, 22, 0.68))"
    });
  }

  function normalizeThemeId(value) {
    const id = String(value || "");
    return THEME_ALIASES[id] || (id in PRESETS ? id : "coolGlass");
  }

  function resolve(theme, vars) {
    const id = normalizeThemeId(theme);
    return id === "classicCustom" ? custom(vars) : { ...(PRESETS[id] || PRESETS.coolGlass) };
  }

  function apply(options = {}) {
    const root = options.root || global.document?.documentElement;
    const body = options.body || global.document?.body;
    const values = resolve(options.theme, options.vars);
    [root, body].filter(Boolean).forEach((node) => {
      Object.entries(values).forEach(([key, value]) => node.style.setProperty(key, value));
    });
    global.YayaLayers?.registerRuntime?.("theme", {
      bridge: "theme-modules",
      theme: normalizeThemeId(options.theme),
      variableCount: Object.keys(values).length,
      templateCoupled: true,
      moduleSlots: ["course", "custom", "recurring", "special", "exam"],
      inputUiThemeSync: true
    });
    return values;
  }

  function normalizeColor(value, fallback) {
    const text = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(text) ? text : fallback;
  }

  function hexToRgb(hex) {
    const value = normalizeColor(hex, "#2563eb").slice(1);
    return [
      parseInt(value.slice(0, 2), 16),
      parseInt(value.slice(2, 4), 16),
      parseInt(value.slice(4, 6), 16)
    ].join(", ");
  }

  function luminance(rgbText) {
    const parts = rgbText.split(",").map((part) => Number(part.trim()) / 255);
    const [r, g, b] = parts.map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  global.YayaThemeModules = {
    PRESETS,
    normalizeThemeId,
    resolve,
    apply
  };
  global.YayaLayers?.registerModule?.("theme-modules", {
    layer: "theme",
    dependsOn: ["app-layers", "ui-modules"],
    provides: ["themePresets", "templateBridge", "inputUiThemeVars", "moduleSlots"],
    presetCount: Object.keys(PRESETS).length,
    handoffTo: ["app"]
  });
})(window);
