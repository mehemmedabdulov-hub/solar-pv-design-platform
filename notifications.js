(function (global) {
  "use strict";

  const API = {};
  let region = null;
  let liveRegion = null;

  function ensureRegions() {
    if (typeof document === "undefined") return;
    if (!region) {
      region = document.getElementById("solarToastRegion");
      if (!region) {
        region = document.createElement("div");
        region.id = "solarToastRegion";
        region.className = "solar-toast-region";
        region.setAttribute("aria-label", "Application notifications");
        document.body.appendChild(region);
      }
    }
    if (!liveRegion) {
      liveRegion = document.getElementById("solarLiveRegion");
      if (!liveRegion) {
        liveRegion = document.createElement("div");
        liveRegion.id = "solarLiveRegion";
        liveRegion.className = "sr-only";
        liveRegion.setAttribute("aria-live", "polite");
        liveRegion.setAttribute("aria-atomic", "true");
        document.body.appendChild(liveRegion);
      }
    }
  }

  function normalizeType(type) {
    return ["success", "info", "warning", "error"].includes(type) ? type : "info";
  }

  API.toast = function toast(message, options = {}) {
    if (typeof document === "undefined") return null;
    ensureRegions();
    const type = normalizeType(options.type);
    const toastEl = document.createElement("div");
    toastEl.className = `solar-toast solar-toast-${type}`;
    toastEl.setAttribute("role", type === "error" ? "alert" : "status");
    const copy = document.createElement("div");
    copy.className = "solar-toast-copy";
    copy.textContent = String(message || "");
    toastEl.appendChild(copy);
    if (options.actionLabel && typeof options.onAction === "function") {
      const action = document.createElement("button");
      action.type = "button";
      action.className = "solar-toast-action";
      action.textContent = options.actionLabel;
      action.addEventListener("click", () => {
        options.onAction();
        toastEl.remove();
      });
      toastEl.appendChild(action);
    }
    const close = document.createElement("button");
    close.type = "button";
    close.className = "solar-toast-close";
    close.setAttribute("aria-label", "Dismiss notification");
    close.textContent = "×";
    close.addEventListener("click", () => toastEl.remove());
    toastEl.appendChild(close);
    region.appendChild(toastEl);
    if (liveRegion) liveRegion.textContent = String(message || "");
    const timeout = Number.isFinite(Number(options.timeout)) ? Number(options.timeout) : (type === "error" ? 9000 : 5000);
    if (timeout > 0) setTimeout(() => toastEl.remove(), timeout);
    return toastEl;
  };

  API.inline = function inline(target, message, options = {}) {
    if (typeof document === "undefined") return null;
    const el = typeof target === "string" ? document.getElementById(target) : target;
    if (!el) return null;
    const type = normalizeType(options.type);
    el.className = options.baseClass || el.className || "solar-inline-message";
    el.classList.remove("success", "info", "warning", "error", "pass", "fail", "neutral");
    el.classList.add(type === "success" ? "success" : type);
    el.textContent = String(message || "");
    if (options.focus) {
      el.setAttribute("tabindex", "-1");
      el.focus({ preventScroll: true });
    }
    return el;
  };

  API.problem = function problem({ what, where, action, type = "warning", target = null, persistent = true } = {}) {
    const pieces = [what, where ? `Fix: ${where}.` : "", action ? `Next: ${action}.` : ""].filter(Boolean);
    const message = pieces.join(" ");
    if (target) return API.inline(target, message, { type });
    return API.toast(message, { type: type === "warning" ? "warning" : "error", timeout: persistent ? 0 : undefined });
  };

  API.confirmDestructive = function confirmDestructive(message) {
    if (typeof global.confirm !== "function") return false;
    return global.confirm(String(message || "This action is destructive. Continue?"));
  };

  API.decision = function decision({ title = "Confirm action", message = "", details = [], confirmLabel = "Continue", cancelLabel = "Cancel", danger = false } = {}) {
    if (typeof document === "undefined") return Promise.resolve(false);
    ensureRegions();
    return new Promise(resolve => {
      const dialog = document.createElement("dialog");
      dialog.className = "solar-decision-dialog";
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", "solarDecisionTitle");
      const heading = document.createElement("h2");
      heading.id = "solarDecisionTitle";
      heading.textContent = String(title || "Confirm action");
      const copy = document.createElement("p");
      copy.textContent = String(message || "");
      const list = document.createElement("ul");
      (Array.isArray(details) ? details : []).filter(Boolean).forEach(item => {
        const li = document.createElement("li");
        li.textContent = String(item);
        list.appendChild(li);
      });
      const actions = document.createElement("div");
      actions.className = "solar-decision-actions";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "secondary-button";
      cancel.textContent = String(cancelLabel || "Cancel");
      const confirm = document.createElement("button");
      confirm.type = "button";
      confirm.className = danger ? "danger-button" : "project-save-button";
      confirm.textContent = String(confirmLabel || "Continue");
      actions.append(cancel, confirm);
      dialog.append(heading, copy);
      if (list.childElementCount) dialog.appendChild(list);
      dialog.appendChild(actions);
      document.body.appendChild(dialog);

      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        try { if (dialog.open) dialog.close(); } catch (_) { /* no-op */ }
        dialog.remove();
        resolve(!!value);
      };
      cancel.addEventListener("click", () => finish(false));
      confirm.addEventListener("click", () => finish(true));
      dialog.addEventListener("cancel", event => { event.preventDefault(); finish(false); });
      dialog.addEventListener("close", () => finish(false));
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      setTimeout(() => cancel.focus(), 0);
    });
  };

  API.announce = function announce(message) {
    ensureRegions();
    if (liveRegion) liveRegion.textContent = String(message || "");
  };

  global.SolarPVNotifications = Object.freeze(API);
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
