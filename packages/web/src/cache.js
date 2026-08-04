const CACHE_KEY = 'meal-prep-cache';

export function saveCache(data) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, savedAt: Date.now() })); } catch {} }
export function loadCache() { try { const raw = localStorage.getItem(CACHE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } }
