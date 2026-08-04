import { useCallback, useEffect, useState } from 'react';
import { getApiKey, getScriptUrl, setApiKeyStore, setScriptUrlStore } from './config.js';
import { fetchSheet, updateCell } from './sheets.js';
import { loadCache, saveCache } from './cache.js';
import { computeShoppingList } from './shoppingList.js';
import { formatSince } from './format.js';
import { I } from './icons.jsx';
import { Toast } from './components/Toast.jsx';
import { SetupScreen } from './components/SetupScreen.jsx';
import { RecipesPage } from './components/RecipesPage.jsx';
import { ShoppingListPage } from './components/ShoppingListPage.jsx';
import { IngredientsMatchPage } from './components/IngredientsMatchPage.jsx';
import { AddRecipePage } from './components/AddRecipePage.jsx';
import { SettingsPage } from './components/SettingsPage.jsx';

export function MealPrepApp() {
  const [apiKey, setApiKeyState] = useState(getApiKey());
  const [scriptUrl, setScriptUrlState] = useState(getScriptUrl());
  const [tab, setTab] = useState('recipes');
  const [recipes, setRecipes] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [shoppingList, setShoppingList] = useState([]);
  const [pantryItems, setPantryItems] = useState([]);
  const [bestMatches, setBestMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [bgSyncing, setBgSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const [toastMsg, setToastMsg] = useState('');

  const toast = useCallback(msg => { setToastMsg(''); setTimeout(() => setToastMsg(msg), 10); }, []);

  const loadData = useCallback(async (key, silent = false) => {
    if (!silent) setLoading(true); else setBgSyncing(true);
    try {
      const [recipeRows, ingRows, shoppingRows, matchRows] = await Promise.all([
        fetchSheet('Recipes', key), fetchSheet('Ingredients', key),
        fetchSheet('Shopping_List', key), fetchSheet('Ingredients Match', key),
      ]);
      const newRecipes = recipeRows.slice(1).filter(r => r[0]).map((r, idx) => ({ id: r[0]||'', name: r[1]||'', type: r[2]||'', cardUrl: r[3]||'', inShoppingList: r[4] === 'TRUE', rowIndex: idx + 2 }));
      const newIngredients = ingRows.slice(1).filter(r => r[0]).map(r => ({ recipeId: r[0]||'', ingredient: r[1]||'', quantity: r[2]||'', unit: r[3]||'' }));
      const newShoppingList = shoppingRows.slice(2).filter(r => r[1]).map((r, idx) => ({ gotIt: r[0] === 'TRUE', ingredient: r[1]||'', total: r[2]||'', unit: r[3]||'', aisle: r[4]||'', rowIndex: idx + 3 }));
      const newPantryItems = matchRows.slice(1).filter(r => r[1]).map((r, idx) => ({ haveIt: r[0] === 'TRUE', ingredient: r[1]||'', rowIndex: idx + 2 }));
      const newBestMatches = matchRows.slice(1).filter(r => r[3]).map(r => ({ recipeId: r[3]||'', recipeName: r[4]||'', missing: r[5]||'' }));
      setRecipes(newRecipes);
      setIngredients(newIngredients);
      setShoppingList(newShoppingList);
      setPantryItems(newPantryItems);
      setBestMatches(newBestMatches);
      setLastSynced(Date.now());
      saveCache({ recipes: newRecipes, ingredients: newIngredients, shoppingList: newShoppingList, pantryItems: newPantryItems, bestMatches: newBestMatches });
    } catch { if (!silent) toast('Error loading data. Check your connection.'); }
    if (!silent) setLoading(false); else setBgSyncing(false);
  }, [toast]);

  const loadMatchData = useCallback(async () => {
    try {
      const rows = await fetchSheet('Ingredients Match', apiKey);
      setPantryItems(rows.slice(1).filter(r => r[1]).map((r, idx) => ({ haveIt: r[0] === 'TRUE', ingredient: r[1]||'', rowIndex: idx + 2 })));
      setBestMatches(rows.slice(1).filter(r => r[3]).map(r => ({ recipeId: r[3]||'', recipeName: r[4]||'', missing: r[5]||'' })));
    } catch {}
  }, [apiKey]);

  const loadShoppingData = useCallback(async () => {
    try {
      const rows = await fetchSheet('Shopping_List', apiKey);
      setShoppingList(rows.slice(2).filter(r => r[1]).map((r, idx) => ({ gotIt: r[0] === 'TRUE', ingredient: r[1]||'', total: r[2]||'', unit: r[3]||'', aisle: r[4]||'', rowIndex: idx + 3 })));
    } catch {}
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey) return;
    const cache = loadCache();
    if (cache && cache.savedAt) {
      if (cache.recipes) setRecipes(cache.recipes);
      if (cache.ingredients) setIngredients(cache.ingredients);
      if (cache.shoppingList) setShoppingList(cache.shoppingList);
      if (cache.pantryItems) setPantryItems(cache.pantryItems);
      if (cache.bestMatches) setBestMatches(cache.bestMatches);
      setLastSynced(cache.savedAt);
      loadData(apiKey, true);
    } else {
      loadData(apiKey);
    }
  }, [apiKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!apiKey) return;
    if (tab === 'shopping') loadShoppingData();
    else if (tab === 'match') loadMatchData();
  }, [tab, loadShoppingData, loadMatchData]);

  const handleRefresh = async () => { setRefreshing(true); await loadData(apiKey, true); setRefreshing(false); toast('Data refreshed!'); };
  const handleToggleShoppingList = async recipe => {
    const newVal = !recipe.inShoppingList;
    const newRecipes = recipes.map(r => r.id === recipe.id ? { ...r, inShoppingList: newVal } : r);
    setRecipes(newRecipes);
    setShoppingList(prev => computeShoppingList(newRecipes, ingredients, prev));
    try {
      await updateCell('Recipes', `E${recipe.rowIndex}`, newVal, scriptUrl);
      toast(newVal ? `Added ${recipe.name} to shopping list` : `Removed ${recipe.name} from shopping list`);
    } catch {
      toast('Failed to save — check your Script URL in Settings.');
      setRecipes(prev => prev.map(r => r.id === recipe.id ? { ...r, inShoppingList: !newVal } : r));
      setShoppingList(prev => computeShoppingList(recipes, ingredients, prev));
    }
  };
  const handleDisconnect = () => { setApiKeyStore(''); setScriptUrlStore(''); setApiKeyState(''); setScriptUrlState(''); setRecipes([]); setIngredients([]); setShoppingList([]); setPantryItems([]); setBestMatches([]); };
  const handleScriptUrlSave = url => { setScriptUrlStore(url); setScriptUrlState(url); };

  if (!apiKey) return <SetupScreen onSave={k => setApiKeyState(k)} />;

  const navItems = [
    { id: 'recipes', label: 'Recipes', icon: I.recipes },
    { id: 'shopping', label: 'Shopping', icon: I.cart },
    { id: 'match', label: 'Match', icon: I.search },
    { id: 'add', label: 'Add', icon: I.plus },
    { id: 'settings', label: 'Settings', icon: I.settings },
  ];
  const pageTitle = { recipes: 'Recipes', shopping: 'Shopping List', match: 'Ingredients Match', add: 'Add Recipe', settings: 'Settings' };

  return (
    <div style={{ minHeight: '100vh', background: '#FAF6F1' }}>
      {toastMsg && <Toast message={toastMsg} onDone={() => setToastMsg('')} />}
      <nav className="nav-bar">
        {navItems.map(n => <button key={n.id} className={`nav-item ${tab === n.id ? 'active' : ''}`} onClick={() => setTab(n.id)}>{n.icon}<span>{n.label}</span></button>)}
      </nav>
      <div className="page-content" style={{ padding: '24px 20px 100px', maxWidth: 640, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26 }}>{pageTitle[tab]}</h1>
            {tab === 'recipes' && <p style={{ color: '#7A7568', fontSize: 14, marginTop: 2 }}>{recipes.length} recipe{recipes.length !== 1 ? 's' : ''}</p>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
              {bgSyncing && <div className="loading-spinner" style={{ width: 11, height: 11, borderWidth: 2 }} />}
              {lastSynced && <span style={{ fontSize: 11, color: '#A39E93' }}>{bgSyncing ? 'Syncing...' : `Synced ${formatSince(lastSynced)}`}</span>}
            </div>
          </div>
          {(tab === 'recipes' || tab === 'shopping' || tab === 'match') && <button className="btn-secondary" style={{ padding: '8px 14px' }} onClick={handleRefresh} disabled={refreshing}>{I.refresh}</button>}
        </div>
        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center' }}><div className="loading-spinner" /><p style={{ color: '#7A7568', marginTop: 16, fontSize: 14 }}>Loading your meal prep data...</p></div>
        ) : (
          <>
            {tab === 'recipes' && <RecipesPage recipes={recipes} ingredients={ingredients} onToggleShoppingList={handleToggleShoppingList} />}
            {tab === 'shopping' && <ShoppingListPage shoppingList={shoppingList} setShoppingList={setShoppingList} scriptUrl={scriptUrl} toast={toast} />}
            {tab === 'match' && <IngredientsMatchPage pantryItems={pantryItems} setPantryItems={setPantryItems} bestMatches={bestMatches} scriptUrl={scriptUrl} toast={toast} onRefreshMatch={loadMatchData} />}
            {tab === 'add' && <AddRecipePage scriptUrl={scriptUrl} onRecipeAdded={handleRefresh} toast={toast} recipes={recipes} />}
            {tab === 'settings' && <SettingsPage apiKey={apiKey} scriptUrl={scriptUrl} onScriptUrlSave={handleScriptUrlSave} onDisconnect={handleDisconnect} onRefresh={handleRefresh} refreshing={refreshing} />}
          </>
        )}
      </div>
    </div>
  );
}
