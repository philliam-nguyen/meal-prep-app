export const SHEET_ID = '1h2SZCwjKsfIaxThGBCfh55rOZVfZUjzp0fRuGgQMK0k';

const API_KEY_STORAGE = 'meal-prep-api-key';
const SCRIPT_URL_STORAGE = 'meal-prep-script-url';

export function getApiKey() { try { return localStorage.getItem(API_KEY_STORAGE) || ''; } catch { return ''; } }
export function setApiKeyStore(k) { try { localStorage.setItem(API_KEY_STORAGE, k); } catch {} }
export function getScriptUrl() { try { return localStorage.getItem(SCRIPT_URL_STORAGE) || ''; } catch { return ''; } }
export function setScriptUrlStore(u) { try { localStorage.setItem(SCRIPT_URL_STORAGE, u); } catch {} }
