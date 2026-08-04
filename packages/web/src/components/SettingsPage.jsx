import { useState } from 'react';
import { SHEET_ID } from '../config.js';
import { I } from '../icons.jsx';

export function SettingsPage({ apiKey, scriptUrl, onScriptUrlSave, onDisconnect, onRefresh, refreshing }) {
  const [urlInput, setUrlInput] = useState(scriptUrl);
  const [saving, setSaving] = useState(false);
  const handleSaveUrl = async () => {
    setSaving(true);
    try {
      const res = await fetch(urlInput.trim(), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ tab: '__ping__', values: [] }) });
      const data = await res.json();
      if (data.ok || data.error === 'Sheet tab not found: __ping__') {
        onScriptUrlSave(urlInput.trim());
        alert('Script URL saved!');
      } else {
        alert('Script responded with an error: ' + (data.error || 'unknown'));
      }
    } catch {
      alert('Could not reach the script URL. Make sure it is deployed and access is set to Anyone.');
    }
    setSaving(false);
  };
  return (
    <div className="fade-in">
      <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #F0EBE3', marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#7A7568', letterSpacing: 0.5, marginBottom: 14 }}>CONNECTION</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#5B7C5A' }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>Connected to Google Sheets</span>
        </div>
        <p style={{ fontSize: 13, color: '#7A7568', marginBottom: 16 }}>API Key: {apiKey.slice(0, 8)}...{apiKey.slice(-4)}</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={onRefresh} disabled={refreshing}>{I.refresh} {refreshing ? 'Refreshing...' : 'Refresh Data'}</button>
          <button className="btn-secondary" style={{ color: '#C26A5A', borderColor: '#C26A5A' }} onClick={onDisconnect}>Disconnect</button>
        </div>
      </div>
      <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #F0EBE3', marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#7A7568', letterSpacing: 0.5, marginBottom: 14 }}>WRITE ACCESS (APPS SCRIPT)</h3>
        <p style={{ fontSize: 13, color: '#7A7568', marginBottom: 12, lineHeight: 1.6 }}>
          Paste your deployed Apps Script Web App URL here to enable adding recipes from the app.
        </p>
        <div style={{ marginBottom: 12 }}>
          <input
            className="input-field"
            placeholder="https://script.google.com/macros/s/..."
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn-primary" style={{ padding: '10px 20px' }} onClick={handleSaveUrl} disabled={saving || !urlInput.trim()}>
            {saving ? 'Testing...' : 'Save URL'}
          </button>
          {scriptUrl && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#5B7C5A' }} />
              <span style={{ fontSize: 13, color: '#5B7C5A', fontWeight: 600 }}>Write access enabled</span>
            </div>
          )}
        </div>
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: 'pointer', color: '#5B7C5A', fontWeight: 600, fontSize: 13 }}>How to set this up</summary>
          <div style={{ marginTop: 10, padding: 14, background: '#F5EDE3', borderRadius: 12, fontSize: 13, lineHeight: 1.8, color: '#7A7568' }}>
            <p>1. Go to <strong>script.google.com</strong> and create a new project</p>
            <p>2. Copy the contents of <strong>Code.gs</strong> into the editor</p>
            <p>3. Click <strong>Deploy → New deployment → Web app</strong></p>
            <p>4. Set <strong>Execute as: Me</strong> and <strong>Who has access: Anyone</strong></p>
            <p>5. Copy the Web App URL and paste it above</p>
          </div>
        </details>
      </div>
      <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #F0EBE3', marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#7A7568', letterSpacing: 0.5, marginBottom: 14 }}>GOOGLE SHEET</h3>
        <a href={`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`} target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ textDecoration: 'none' }}>
          Open in Google Sheets {I.external}
        </a>
      </div>
      <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #F0EBE3' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#7A7568', letterSpacing: 0.5, marginBottom: 14 }}>ADD TO HOME SCREEN</h3>
        <p style={{ fontSize: 13, color: '#7A7568', lineHeight: 1.6 }}>
          To use this as an app on your iPhone: tap the <strong>Share</strong> button in Safari, then <strong>"Add to Home Screen"</strong>.
        </p>
      </div>
    </div>
  );
}
