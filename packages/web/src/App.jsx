import { useCallback, useEffect, useState } from 'react';
import { fetchState } from './api.js';
import { loadCache, saveCache } from './cache.js';
import { formatSince } from './format.js';
import { I } from './icons.jsx';
import { Toast } from './components/Toast.jsx';
import { RecipesPage } from './components/RecipesPage.jsx';
import { ShoppingListPage } from './components/ShoppingListPage.jsx';
import { PantryPage } from './components/PantryPage.jsx';
import { AddRecipePage } from './components/AddRecipePage.jsx';
import { SettingsPage } from './components/SettingsPage.jsx';

// There is no setup screen and no key to paste. The API is on this same origin and the homelab
// instance is reachable only over Tailscale, where network membership is the whole authorization
// model (ADR-0003).

const NAV_ITEMS = [
  { id: 'recipes', label: 'Recipes', icon: I.recipes },
  { id: 'shopping', label: 'Shopping', icon: I.cart },
  { id: 'pantry', label: 'Pantry', icon: I.search },
  { id: 'add', label: 'Add', icon: I.plus },
  { id: 'settings', label: 'Settings', icon: I.settings },
];

const PAGE_TITLES = {
  recipes: 'Recipes',
  shopping: 'Shopping List',
  pantry: 'Pantry',
  add: 'Add Recipe',
  settings: 'Settings',
};

export function MealPrepApp() {
  const [tab, setTab] = useState('recipes');
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [bgSyncing, setBgSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const [toastMsg, setToastMsg] = useState('');

  const toast = useCallback(msg => { setToastMsg(''); setTimeout(() => setToastMsg(msg), 10); }, []);

  const loadData = useCallback(async (silent = false) => {
    if (silent) setBgSyncing(true); else setLoading(true);
    try {
      const { recipes: loaded } = await fetchState();
      setRecipes(loaded);
      setLastSynced(Date.now());
      saveCache({ recipes: loaded });
    } catch {
      if (!silent) toast('Could not load your recipes. Check your connection.');
    }
    if (silent) setBgSyncing(false); else setLoading(false);
  }, [toast]);

  useEffect(() => {
    const cache = loadCache();
    if (cache?.savedAt) {
      if (cache.recipes) setRecipes(cache.recipes);
      setLastSynced(cache.savedAt);
      loadData(true);
    } else {
      loadData();
    }
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
    toast('Data refreshed!');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#FAF6F1' }}>
      {toastMsg && <Toast message={toastMsg} onDone={() => setToastMsg('')} />}
      <nav className="nav-bar">
        {NAV_ITEMS.map(n => <button key={n.id} className={`nav-item ${tab === n.id ? 'active' : ''}`} onClick={() => setTab(n.id)}>{n.icon}<span>{n.label}</span></button>)}
      </nav>
      <div className="page-content" style={{ padding: '24px 20px 100px', maxWidth: 640, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26 }}>{PAGE_TITLES[tab]}</h1>
            {tab === 'recipes' && <p style={{ color: '#7A7568', fontSize: 14, marginTop: 2 }}>{recipes.length} recipe{recipes.length !== 1 ? 's' : ''}</p>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
              {bgSyncing && <div className="loading-spinner" style={{ width: 11, height: 11, borderWidth: 2 }} />}
              {lastSynced && <span style={{ fontSize: 11, color: '#A39E93' }}>{bgSyncing ? 'Syncing...' : `Synced ${formatSince(lastSynced)}`}</span>}
            </div>
          </div>
          {tab === 'recipes' && <button className="btn-secondary" style={{ padding: '8px 14px' }} onClick={handleRefresh} disabled={refreshing}>{I.refresh}</button>}
        </div>
        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center' }}><div className="loading-spinner" /><p style={{ color: '#7A7568', marginTop: 16, fontSize: 14 }}>Loading your meal prep data...</p></div>
        ) : (
          <>
            {tab === 'recipes' && <RecipesPage recipes={recipes} />}
            {tab === 'shopping' && <ShoppingListPage />}
            {tab === 'pantry' && <PantryPage />}
            {tab === 'add' && <AddRecipePage />}
            {tab === 'settings' && <SettingsPage onRefresh={handleRefresh} refreshing={refreshing} />}
          </>
        )}
      </div>
    </div>
  );
}
