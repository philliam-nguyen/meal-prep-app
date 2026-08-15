import { useCallback, useEffect, useState } from 'react';
import {
  clearGotItMarks,
  fetchState,
  setIngredientAisle,
  setIngredientGotIt,
  setIngredientPantry,
  setIngredientStaple,
  setRecipeSelected,
} from './api.js';
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
  const [shoppingList, setShoppingList] = useState([]);
  const [pantryChecklist, setPantryChecklist] = useState([]);
  const [staples, setStaples] = useState([]);
  const [bestMatches, setBestMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [bgSyncing, setBgSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const [toastMsg, setToastMsg] = useState('');

  const toast = useCallback(msg => { setToastMsg(''); setTimeout(() => setToastMsg(msg), 10); }, []);

  const loadData = useCallback(async (silent = false) => {
    if (silent) setBgSyncing(true); else setLoading(true);
    try {
      const state = await fetchState();
      setRecipes(state.recipes);
      setShoppingList(state.shoppingList);
      setPantryChecklist(state.pantryChecklist);
      setStaples(state.staples);
      setBestMatches(state.bestMatches);
      setLastSynced(Date.now());
      saveCache(state);
    } catch {
      if (!silent) toast('Could not load your recipes. Check your connection.');
    }
    if (silent) setBgSyncing(false); else setLoading(false);
  }, [toast]);

  useEffect(() => {
    const cache = loadCache();
    if (cache?.savedAt) {
      if (cache.recipes) setRecipes(cache.recipes);
      // A cache written before the Shopping List moved into the payload has no list in it. The
      // silent reload below is what fills it, so an old cache costs a paint rather than an error.
      if (cache.shoppingList) setShoppingList(cache.shoppingList);
      if (cache.pantryChecklist) setPantryChecklist(cache.pantryChecklist);
      if (cache.staples) setStaples(cache.staples);
      if (cache.bestMatches) setBestMatches(cache.bestMatches);
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

  // The toggle lands on screen before the write does, because a cook changing their mind about four
  // Recipes should not wait four times. A write that fails puts the Recipe back the way it was and
  // says so, so nothing stays ticked that never saved.
  const handleToggleSelected = useCallback(async recipe => {
    const selected = !recipe.selected;
    const show = value => setRecipes(prev => prev.map(r => (r.id === recipe.id ? { ...r, selected: value } : r)));

    show(selected);
    try {
      await setRecipeSelected(recipe.id, selected);
    } catch {
      show(!selected);
      toast(`Could not ${selected ? 'add' : 'remove'} ${recipe.name}. Nothing was saved.`);
      return;
    }
    toast(selected ? `Added ${recipe.name} to your shopping list` : `Removed ${recipe.name} from your shopping list`);
    // The Shopping List is a query now, not a calculation this app can redo, so what changed comes
    // back from the server rather than from here.
    loadData(true);
  }, [loadData, toast]);

  // Same shape as the toggle above, and no toast on success: a cook works down the checklist a dozen
  // items at a time, and a dozen confirmations would be noise. Best Matches reranks from the server
  // afterwards, because keeping a copy of the match rule here is the drift this migration removed.
  const handleTogglePantry = useCallback(async ingredient => {
    const inPantry = !ingredient.inPantry;
    const show = value => setPantryChecklist(prev => prev.map(i => (i.id === ingredient.id ? { ...i, inPantry: value } : i)));

    show(inPantry);
    try {
      await setIngredientPantry(ingredient.id, inPantry);
    } catch {
      show(!inPantry);
      toast(`Could not update ${ingredient.name}. Nothing was saved.`);
      return;
    }
    loadData(true);
  }, [loadData, toast]);

  // Same shape as the Pantry toggle, and no toast on success for the same reason: a cook ticks a
  // dozen entries walking one aisle, and a dozen confirmations would be noise. The reload that
  // follows is what puts the mark in the offline cache and brings the other phone's ticks over.
  const handleToggleGotIt = useCallback(async entry => {
    const gotIt = !entry.gotIt;
    const show = value => setShoppingList(prev => prev.map(e => (e.ingredientId === entry.ingredientId ? { ...e, gotIt: value } : e)));

    show(gotIt);
    try {
      await setIngredientGotIt(entry.ingredientId, gotIt);
    } catch {
      show(!gotIt);
      toast(`Could not update ${entry.name}. Nothing was saved.`);
      return;
    }
    loadData(true);
  }, [loadData, toast]);

  // Sends what the cook typed, untouched. Trimming here and emptying to null would be the server's
  // rule written a second time in the browser, which is the drift ADR-0005 keeps out; the box shows
  // what was typed until the reload replaces it with what the server actually stored.
  //
  // The Aisle is the Ingredient's rather than this list's, so that reload is also what carries a
  // correction to wherever else that Ingredient shows up.
  const handleSetAisle = useCallback(async (entry, aisle) => {
    const previous = entry.aisle;
    if (aisle === (previous ?? '')) return;
    const show = value => setShoppingList(prev => prev.map(e => (e.ingredientId === entry.ingredientId ? { ...e, aisle: value } : e)));

    show(aisle);
    try {
      await setIngredientAisle(entry.ingredientId, aisle);
    } catch {
      show(previous);
      toast(`Could not set the aisle for ${entry.name}. Nothing was saved.`);
      return;
    }
    loadData(true);
  }, [loadData, toast]);

  // Deliberate, and the only thing that clears a mark. Nothing else does: adding a forgotten Recipe
  // mid-trip has to leave the ticks already earned in the store.
  const handleClearGotIt = useCallback(async () => {
    // The marks alone, not the list they sit on. Putting a whole captured list back would throw away
    // a background reload that landed while the write was in flight, which is the stale snapshot
    // ticket 06's review caught in RecipesPage. An entry that arrived since keeps what it arrived
    // with.
    const marks = new Map(shoppingList.map(entry => [entry.ingredientId, entry.gotIt]));

    setShoppingList(prev => prev.map(entry => ({ ...entry, gotIt: false })));
    try {
      await clearGotItMarks();
    } catch {
      setShoppingList(prev => prev.map(entry => ({ ...entry, gotIt: marks.get(entry.ingredientId) ?? entry.gotIt })));
      toast('Could not clear your marks. Nothing was saved.');
      return;
    }
    toast('Cleared every Got It mark');
    loadData(true);
  }, [loadData, shoppingList, toast]);

  // This one waits for its write, unlike the two above. It moves an Ingredient between two lists
  // rather than flipping a field, and a cook does it when they notice one rather than twelve times
  // down an aisle, so it lets the reload place the row.
  const handleSetStaple = useCallback(async (ingredient, staple) => {
    try {
      await setIngredientStaple(ingredient.id, staple);
    } catch {
      toast(`Could not update ${ingredient.name}. Nothing was saved.`);
      return;
    }
    toast(staple ? `${ingredient.name} is a staple now` : `${ingredient.name} is back on your pantry list`);
    loadData(true);
  }, [loadData, toast]);

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
            {tab === 'recipes' && <RecipesPage recipes={recipes} onToggleSelected={handleToggleSelected} />}
            {tab === 'shopping' && (
              <ShoppingListPage
                shoppingList={shoppingList}
                onToggleGotIt={handleToggleGotIt}
                onSetAisle={handleSetAisle}
                onClearGotIt={handleClearGotIt}
              />
            )}
            {tab === 'pantry' && (
              <PantryPage
                recipes={recipes}
                pantryChecklist={pantryChecklist}
                staples={staples}
                bestMatches={bestMatches}
                syncing={bgSyncing}
                onTogglePantry={handleTogglePantry}
                onSetStaple={handleSetStaple}
              />
            )}
            {tab === 'add' && (
              <AddRecipePage onRecipeAdded={() => loadData(true)} toast={toast} />
            )}
            {tab === 'settings' && <SettingsPage onRefresh={handleRefresh} refreshing={refreshing} />}
          </>
        )}
      </div>
    </div>
  );
}
