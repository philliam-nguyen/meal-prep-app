import { SHEET_ID } from './config.js';

export async function fetchSheet(tab, apiKey) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(tab)}?key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const data = await res.json();
  return data.values || [];
}

export async function appendToSheet(tab, values, scriptUrl) {
  if (!scriptUrl) throw new Error('No script URL configured');
  const res = await fetch(scriptUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ tab, values }) });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Script error');
  return data;
}

export async function updateCell(tab, range, value, scriptUrl) {
  if (!scriptUrl) throw new Error('No script URL configured');
  const res = await fetch(scriptUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'updateCell', tab, range, value }) });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Script error');
  return data;
}
