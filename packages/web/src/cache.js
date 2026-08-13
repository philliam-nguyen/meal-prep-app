// Versioned, because the payload shape changed when reads moved off the spreadsheet. A browser
// holding a Sheets-era cache reads nothing under this key and refetches instead of rendering rows
// in a shape the app no longer understands.
const CACHE_KEY = 'meal-prep-cache-v2';

export function saveCache(data) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, savedAt: Date.now() })); } catch {} }
export function loadCache() { try { const raw = localStorage.getItem(CACHE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } }
