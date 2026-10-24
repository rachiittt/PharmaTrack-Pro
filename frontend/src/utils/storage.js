/**
 * Safe localStorage utilities to prevent uncaught SyntaxErrors
 * if storage contains invalid JSON, undefined, or corrupted data.
 */

export function safeGetJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw || raw === 'undefined' || raw === 'null') {
      return fallback;
    }
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[Storage] Failed to parse key "${key}":`, err);
    return fallback;
  }
}

export function safeSetJSON(key, value) {
  try {
    if (value === undefined) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (err) {
    console.warn(`[Storage] Failed to set key "${key}":`, err);
  }
}

export function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}
