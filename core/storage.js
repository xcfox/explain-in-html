/** 持久化读写：接受 storage 对象（window.localStorage 或测试用 Map 适配器），不直接碰 DOM。 */

export const ERD_PANE_KEY = "erd-pane-w";
export const API_PANE_KEY = "api-pane-w";
export const API_COLLAPSE_KEY = "api-dom-collapsed";
export function erdPosKey(schemaName) {
  return "erd-pos-v2-" + (schemaName || "schema");
}

export function memoryStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
  };
}

export function getStorage() {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch { /* 隐私模式 */ }
  return memoryStorage();
}

export function readJSON(storage, key, fallback) {
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    if (raw == null || raw === "") return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJSON(storage, key, val) {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(val));
    return true;
  } catch {
    return false;
  }
}

export function readNumber(storage, key, fallback) {
  if (!storage) return fallback;
  try {
    const n = parseInt(storage.getItem(key), 10);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

export function writeText(storage, key, val) {
  if (!storage) return false;
  try {
    storage.setItem(key, String(val));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(storage, key) {
  if (!storage) return;
  try { storage.removeItem(key); } catch { /* ignore */ }
}

export function loadPositions(storage, schemaName) {
  const o = readJSON(storage, erdPosKey(schemaName), {}) || {};
  const out = {};
  for (const k of Object.keys(o)) {
    const p = o[k];
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) out[k] = { x: p.x, y: p.y };
  }
  return out;
}

export function savePositions(storage, schemaName, nodes) {
  const o = {};
  for (const n of nodes || []) o[n.name] = { x: Math.round(n.x), y: Math.round(n.y) };
  return writeJSON(storage, erdPosKey(schemaName), o);
}

export function clearPositions(storage, schemaName) {
  removeKey(storage, erdPosKey(schemaName));
}
