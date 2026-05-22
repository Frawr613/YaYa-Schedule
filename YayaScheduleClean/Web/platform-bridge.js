(function (global) {
  "use strict";

  const PORTAL_OPEN_COOLDOWN_MS = 1400;
  let lastPortalBridgeOpenAt = 0;

  function nativeCall(name, args = [], fallback) {
    const native = global.YayaNative;
    if (!native || typeof native[name] !== "function") {
      return typeof fallback === "function" ? fallback() : fallback;
    }
    try {
      return native[name](...args);
    } catch (error) {
      console.warn("YayaPlatform native call failed:", name, error);
      return typeof fallback === "function" ? fallback(error) : fallback;
    }
  }

  function hasNativeMethod(name) {
    return Boolean(global.YayaNative && typeof global.YayaNative[name] === "function");
  }

  const REMINDER_PERMISSION_FALLBACK = JSON.stringify({
    native: false,
    notifications: "preview",
    sound: "preview",
    exactAlarms: "preview",
    scheduledCount: 0,
    lastSyncAt: 0,
    canNotify: false,
    canSound: false,
    canExact: false,
    needsAction: false
  });

  global.YayaPlatform = {
    layer: "platform",
    capabilities: ["savePortalAccount", "setLauncherIcon", "openAcademicPortal", "takeImportedPage", "getReminderPermissionStatus", "requestReminderPermissions", "requestNotificationPermission", "scheduleReminderNotifications", "scheduleDdlNotifications", "updateHomeWidget"],
    isNative() {
      return Boolean(global.YayaNative);
    },
    savePortalAccount(username, password) {
      return Boolean(nativeCall("savePortalAccount", [username, password], false));
    },
    setLauncherIcon(iconId) {
      if (!hasNativeMethod("setLauncherIcon")) return false;
      nativeCall("setLauncherIcon", [iconId], false);
      return true;
    },
    openAcademicPortal() {
      if (!hasNativeMethod("openAcademicPortal")) return false;
      const now = Date.now();
      if (now - lastPortalBridgeOpenAt < PORTAL_OPEN_COOLDOWN_MS) return true;
      lastPortalBridgeOpenAt = now;
      nativeCall("openAcademicPortal", [], false);
      return true;
    },
    takeImportedPage() {
      return nativeCall("takeImportedPage", [], "");
    },
    requestNotificationPermission() {
      return nativeCall("requestNotificationPermission", [], false);
    },
    getReminderPermissionStatus() {
      return nativeCall("getReminderPermissionStatus", [], REMINDER_PERMISSION_FALLBACK);
    },
    requestReminderPermissions() {
      return nativeCall("requestReminderPermissions", [], false);
    },
    scheduleReminderNotifications(payload) {
      if (hasNativeMethod("scheduleReminderNotifications")) {
        return nativeCall("scheduleReminderNotifications", [payload], false);
      }
      return nativeCall("scheduleDdlNotifications", [payload], false);
    },
    scheduleDdlNotifications(payload) {
      return this.scheduleReminderNotifications(payload);
    },
    updateHomeWidget(payload) {
      const value = typeof payload === "string" ? payload : JSON.stringify(payload || {});
      return nativeCall("updateHomeWidget", [value], false);
    }
  };
  global.YayaLayers?.registerModule?.("platform-bridge", {
    layer: "platform",
    dependsOn: ["app-layers"],
    provides: global.YayaPlatform.capabilities,
    handoffTo: ["app"]
  });
  global.YayaLayers?.registerRuntime?.("platform", {
    native: Boolean(global.YayaNative),
    capabilities: global.YayaPlatform.capabilities,
    portalCooldown: PORTAL_OPEN_COOLDOWN_MS
  });
})(window);
