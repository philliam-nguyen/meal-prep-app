import { useCallback, useEffect, useRef, useState } from 'react';
import { 
  fetchState,
  fetchVersion,
  deleteRecipe,
  clearGotItMarks,
  setIngredientAisle,
  setIngredientGotIt, 
  setIngredientPantry, 
  setIngredientStaple, 
  setRecipeSelected 
} from './api.js';
import { loadCache, saveCache } from './cache.js';
import { startFreshnessPoll } from './freshness.js';
import { formatSince } from './format.js';
import { I } from './icons.jsx';
import { Toast } from './components/Toast.jsx';
import { RecipesPage } from './components/RecipesPage.jsx';
import { ShoppingListPage } from './components/ShoppingListPage.jsx';
import { PantryPage } from './components/PantryPage.jsx';
import { AddRecipePage } from './components/AddRecipePage.jsx';
import { EditRecipePage } from './components/EditRecipePage.jsx';
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
  // The id of the Recipe being edited rather than the Recipe itself, so that a Recipe deleted on
  // the other phone closes the form instead of leaving a cook typing into a row that is gone. The
  // form keeps its own copy of the fields once it opens, so a background reload cannot overwrite a
  // half-typed correction.
  const [editingId, setEditingId] = useState(null);
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
  // Refs, not state: neither is rendered, and neither changing should cost a paint.
  const version = useRef(null);
  const latestLoad = useRef(0);

  const toast = useCallback(msg => { setToastMsg(''); setTimeout(() => setToastMsg(msg), 10); }, []);

  // Reloads overlap: every toggle asks for one, so does the poll, so does the Refresh button. They
  // are not guaranteed to come back in the order they went out, and an older reply landing last used
  // to repaint the screen with data the newer one had already replaced. Worse now that a version
  // travels with the payload, because the same reply would rewind the freshness mark to a version
  // the screen has moved past, and the poll would then refetch what it already had. Only the newest
  // request in flight is allowed to land.
  const loadData = useCallback(async (silent = false) => {
    const load = (latestLoad.current += 1);
    const stale = () => load !== latestLoad.current;

    if (silent) setBgSyncing(true); else setLoading(true);
    try {
      const state = await fetchState();
      if (stale()) return;
      setRecipes(state.recipes);
      setShoppingList(state.shoppingList);
      setPantryChecklist(state.pantryChecklist);
      setStaples(state.staples);
      setBestMatches(state.bestMatches);
      setLastSynced(Date.now());
      saveCache(state);
      // The version this data arrived with, which is what the next poll is compared against. The
      // payload carries it rather than the poll fetching its own, so there is no window between the
      // two where a change can land and be mistaken for the version already on screen.
      version.current = state.version;
    } catch {
      if (!silent && !stale()) toast('Could not load your recipes. Check your connection.');
    } finally {
      // Cleared by whichever call set it, overtaken or not. Letting an overtaken load leave it on
      // would trade a moment of missing spinner for a first paint that never stops loading.
      if (silent) setBgSyncing(false); else setLoading(false);
    }
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
      // What the cached payload was current at, so a poll has something to compare against even if
      // the reload below never lands.
      version.current = cache.version ?? null;
      loadData(true);
    } else {
      loadData();
    }
  }, [loadData]);

  // Restarted per view, because staleness does not matter on all of them. Which ones is the poll's
  // own decision, so this hands it the view rather than asking first.
  useEffect(() => {
    const watching = startFreshnessPoll({
      view: tab,
      versionOnScreen: () => version.current,
      readVersion: fetchVersion,
      onStale: () => loadData(true),
    });

    return () => watching.stop();
  }, [tab, loadData]);

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

  // This one waits for the server and shows nothing optimistically. A Recipe removed from the list
  // before the write lands would have to be put back if it failed, and a Recipe reappearing after a
  // cook watched it go is worse than a moment's wait. A Protected Recipe refuses here, and the
  // server's refusal names it rather than being flattened into "could not delete".
  const handleDelete = useCallback(async recipe => {
    try {
      await deleteRecipe(recipe.id);
    } catch (error) {
      toast(error.message);
      return;
    }
    toast(`Deleted ${recipe.name}`);
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

  // Looked up on every render rather than held, so a Recipe that disappears takes its form with it.
  const editing = recipes.find(r => r.id === editingId) ?? null;

  return (
    <div style={{ minHeight: '100vh', background: '#FAF6F1' }}>
      {toastMsg && <Toast message={toastMsg} onDone={() => setToastMsg('')} />}
      <nav className="nav-bar">
        {NAV_ITEMS.map(n => <button key={n.id} className={`nav-item ${tab === n.id ? 'active' : ''}`} onClick={() => { setEditingId(null); setTab(n.id); }}>{n.icon}<span>{n.label}</span></button>)}
      </nav>
      <div className="page-content" style={{ padding: '24px 20px 100px', maxWidth: 640, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26 }}>{editing ? 'Edit Recipe' : PAGE_TITLES[tab]}</h1>
            {tab === 'recipes' && !editing && <p style={{ color: '#7A7568', fontSize: 14, marginTop: 2 }}>{recipes.length} recipe{recipes.length !== 1 ? 's' : ''}</p>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
              {bgSyncing && <div className="loading-spinner" style={{ width: 11, height: 11, borderWidth: 2 }} />}
              {lastSynced && <span style={{ fontSize: 11, color: '#A39E93' }}>{bgSyncing ? 'Syncing...' : `Synced ${formatSince(lastSynced)}`}</span>}
            </div>
          </div>
          {tab === 'recipes' && !editing && <button className="btn-secondary" style={{ padding: '8px 14px' }} onClick={handleRefresh} disabled={refreshing}>{I.refresh}</button>}
        </div>
        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center' }}><div className="loading-spinner" /><p style={{ color: '#7A7568', marginTop: 16, fontSize: 14 }}>Loading your meal prep data...</p></div>
        ) : editing ? (
          // Editing takes over the content area rather than opening another modal, because a
          // Recipe's worth of fields does not fit in the sheet the card slides up in.
          <EditRecipePage
            recipe={editing}
            onSaved={() => { setEditingId(null); loadData(true); }}
            onCancel={() => setEditingId(null)}
            toast={toast}
          />
        ) : (
          <>
            {tab === 'recipes' && <RecipesPage recipes={recipes} onToggleSelected={handleToggleSelected} onEdit={recipe => setEditingId(recipe.id)} onDelete={handleDelete} />}
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
