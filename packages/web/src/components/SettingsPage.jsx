import { I } from '../icons.jsx';

// Nothing to connect and nothing to paste. The API answers on this page's own origin, and the
// homelab instance is reachable only over Tailscale, where being on the network is the whole
// authorization model (ADR-0003).

export function SettingsPage({ onRefresh, refreshing }) {
  return (
    <div className="fade-in">
      <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #F0EBE3', marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#7A7568', letterSpacing: 0.5, marginBottom: 14 }}>DATA</h3>
        <p style={{ fontSize: 13, color: '#7A7568', marginBottom: 16, lineHeight: 1.6 }}>
          Your recipes load from this app's own database. Nothing to configure.
        </p>
        <button className="btn-secondary" onClick={onRefresh} disabled={refreshing}>
          {I.refresh} {refreshing ? 'Refreshing...' : 'Refresh Data'}
        </button>
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
