import { useState } from 'react';
import { getApiKey, setApiKeyStore } from '../config.js';
import { fetchSheet } from '../sheets.js';
import { I } from '../icons.jsx';

export function SetupScreen({ onSave }) {
  const [key, setKey] = useState(getApiKey());
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);
  const handleSave = async () => {
    if (!key.trim()) return setError('Please enter your API key');
    setTesting(true); setError('');
    try { await fetchSheet('Recipes', key.trim()); setApiKeyStore(key.trim()); onSave(key.trim()); }
    catch { setError('Could not connect. Check your API key and make sure the sheet is shared.'); }
    setTesting(false);
  };
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#FAF6F1' }}>
      <div className="fade-in" style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', background: '#E8F0E7', borderRadius: '50%', padding: 20, marginBottom: 24 }}>
          <span style={{ color: '#5B7C5A' }}>{I.leaf}</span>
        </div>
        <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, marginBottom: 8 }}>Meal Prep</h1>
        <p style={{ color: '#7A7568', marginBottom: 32, lineHeight: 1.5 }}>Connect your Google Sheet to get started.</p>
        <div style={{ textAlign: 'left', marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: '#7A7568', display: 'block', marginBottom: 6 }}>GOOGLE SHEETS API KEY</label>
          <input className="input-field" type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="AIzaSy..." onKeyDown={e => e.key === 'Enter' && handleSave()} />
        </div>
        {error && <p style={{ color: '#C26A5A', fontSize: 14, marginBottom: 16, textAlign: 'left' }}>{error}</p>}
        <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 14 }} onClick={handleSave} disabled={testing}>
          {testing ? 'Connecting...' : 'Connect Sheet'}
        </button>
        <details style={{ marginTop: 24, textAlign: 'left' }}>
          <summary style={{ cursor: 'pointer', color: '#5B7C5A', fontWeight: 600, fontSize: 14 }}>How do I get an API key?</summary>
          <div style={{ marginTop: 12, padding: 16, background: '#F5EDE3', borderRadius: 12, fontSize: 13, lineHeight: 1.7, color: '#7A7568' }}>
            <p>1. Go to <strong>console.cloud.google.com</strong></p>
            <p>2. Create a new project (or use an existing one)</p>
            <p>3. Enable the <strong>Google Sheets API</strong></p>
            <p>4. Go to <strong>Credentials → Create Credentials → API Key</strong></p>
            <p>5. Copy the key and paste it above</p>
            <p style={{ marginTop: 8 }}>Make sure your Google Sheet is set to <strong>"Anyone with the link can view"</strong></p>
          </div>
        </details>
      </div>
    </div>
  );
}
