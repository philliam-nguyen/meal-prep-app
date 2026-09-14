import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchVersion,
  createAisle,
  deleteAisle,
  deleteRecipe,
  renameAisle,
  reorderAisles,
  doneShopping,
  setIngredientAisle,
  setIngredientGotIt, 
  setIngredientPantry, 
  setIngredientStaple, 
  setRecipeSelected 
} from './api.js';
import { walkAfterMoving } from './aisleOrder.js';
import { loadCache, saveCache } from './cache.js';
import { OFFLINE_NOTICE, readRenderableState } from './degraded.js';
import { NO_BASELINE, startFreshnessPoll } from './freshness.js';
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
  // The store's sections in the order they are walked. Position never reaches here: the array is
  // the order, and a move sends the whole list of ids back.
  const [aisles, setAisles] = useState([]);
  // A line the deployment configured, or null. It arrives in the payload like everything else here
  // and nothing in this app asks why it is set: the public instance says its data is a fixture
  // because something set the text, and the homelab says nothing because nothing did (ADR-0002).
  const [notice, setNotice] = useState(null);
  // Whether what is on screen is the recording rather than anything the API said. Every control that
  // writes reads it, because a write against a backend that cannot answer is a write that evaporates
  // (ADR-0009).
  const [degraded, setDegraded] = useState(false);
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
      // Only a load with nothing behind it may fall back to the recording, and that is the first
      // paint. Every other load has a screenful already, and a fixed sample is not an improvement
      // on it.
      const { state, degraded: fromRecording } = await readRenderableState({
        nothingOnScreen: !silent,
      });
      if (stale()) return;
      setRecipes(state.recipes);
      setShoppingList(state.shoppingList);
      setPantryChecklist(state.pantryChecklist);
      setStaples(state.staples);
      setBestMatches(state.bestMatches);
      // A payload from before Aisles became a list has none, which is the recording and an old
      // cache. Empty rather than left alone, so the section reads as "no aisles yet" instead of
      // showing a walk the backend no longer has.
      setAisles(state.aisles ?? []);
      // Whatever this payload says, including the recording's null: the notice describes the
      // deployment that answered, and during an outage nothing answered. That is also why the
      // offline banner never has to share the screen with this one.
      setNotice(state.notice ?? null);
      setDegraded(fromRecording);
      if (fromRecording) {
        // None of the three things a live payload leaves behind. The recording is nobody's data to
        // cache, nothing about it was synced, and the version it carries must not become what the
        // poll compares against: NO_BASELINE is what makes the way back one unconditional refetch.
        version.current = NO_BASELINE;
        return;
      }
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
      if (cache.aisles) setAisles(cache.aisles);
      // Null rather than left alone when a cache predates the field, so a banner is never restored
      // from a cache written before the deployment configured one - or after it stopped.
      setNotice(cache.notice ?? null);
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

  // A read, so it stays offered while the backend is offline: it is the way back to live for a
  // visitor who does not want to wait out a poll.
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
    // The ref rather than the flag beside it, which the load above has only just asked React to
    // change. Saying the data refreshed while the banner says the backend is offline is exactly the
    // contradiction degraded mode exists to avoid.
    toast(version.current === NO_BASELINE ? 'Still offline. Showing the fixed sample.' : 'Data refreshed!');
  };

  // The toggle lands on screen before the write does, because a cook changing their mind about four
  // Recipes should not wait four times. A write that fails puts the Recipe back the way it was and
  // says so, so nothing stays ticked that never saved.
  const handleToggleSelected = useCallback(async (recipe, batch = 1) => {
    const selected = !recipe.selected;
    // Deselecting resets the Batch on the server, in the same statement that clears the flag, so it
    // resets here too rather than waiting for the reload to say so.
    const show = (value, batchValue) => setRecipes(prev => prev.map(r => (r.id === recipe.id ? { ...r, selected: value, batch: batchValue } : r)));

    show(selected, selected ? batch : 1);
    try {
      await setRecipeSelected(recipe.id, selected, batch);
    } catch {
      show(!selected, recipe.batch);
      toast(`Could not ${selected ? 'add' : 'remove'} ${recipe.name}. Nothing was saved.`);
      return;
    }
    toast(selected ? `Added ${recipe.name} to your shopping list` : `Removed ${recipe.name} from your shopping list`);
    // The Shopping List is a query now, not a calculation this app can redo, so what changed comes
    // back from the server rather than from here.
    loadData(true);
  }, [loadData, toast]);

  // Changing the Batch of a Recipe already on the Shopping List. The same write the toggle makes,
  // with the flag left where it is: there is no endpoint of its own, because a Batch is only ever
  // set on a Recipe that is being added or is already there.
  //
  // Optimistic like the toggle, and for the same reason: a cook stepping from one to three taps
  // twice and should see the number move both times. No toast on success, as the Pantry and Got It
  // toggles have none - a confirmation per tap on a stepper would be noise. The reload is what
  // brings back the Shopping List this changed, which only the server can say.
  const handleSetBatch = useCallback(async (recipe, batch) => {
    const show = value => setRecipes(prev => prev.map(r => (r.id === recipe.id ? { ...r, batch: value } : r)));

    show(batch);
    try {
      await setRecipeSelected(recipe.id, true, batch);
    } catch {
      show(recipe.batch);
      toast(`Could not change how many times you are making ${recipe.name}. Nothing was saved.`);
      return;
    }
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

  // The end of a trip: every Recipe deselected and every Got It mark cleared, in one request the
  // server runs as one transaction. The cook has already confirmed on the page before this runs.
  //
  // This one waits for the server and shows nothing optimistically, like the delete above and
  // unlike the ticks. Emptying the page before the write lands would mean putting a whole list back
  // if it failed, and a Shopping List reappearing after a cook watched it go is worse than a
  // moment's wait. What replaces it is the server's own answer, which is also the only thing that
  // knows what a second phone did while this was in flight.
  const handleDoneShopping = useCallback(async () => {
    try {
      await doneShopping();
    } catch {
      toast('Could not clear your list. Nothing was saved.');
      return;
    }
    toast('Shopping trip cleared');
    loadData(true);
  }, [loadData, toast]);

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

  // These four wait for the server rather than landing on screen first, unlike the Got It and
  // Pantry ticks. A cook sets the walk up once and then leaves it alone, so there is no run of taps
  // to keep ahead of, and the refusals here are ones only the server can make - a name another Aisle
  // already has, a walk that has gone stale on this screen - which are worth showing as they are
  // written rather than being flattened into "could not save".
  const handleAddAisle = useCallback(async name => {
    let added;
    try {
      added = await createAisle(name);
    } catch (error) {
      toast(error.message);
      return;
    }
    // The name the server stored rather than the one that was typed, so a trimmed name is confirmed
    // as what it actually became.
    toast(`Added ${added.name}`);
    loadData(true);
  }, [loadData, toast]);

  // Compared as typed rather than trimmed, for the reason handleSetAisle sends what it was given:
  // trimming here would be the server's rule written a second time in the browser, which is the
  // drift ADR-0005 keeps out. What this skips is a box closed without a keystroke in it.
  const handleRenameAisle = useCallback(async (aisle, name) => {
    if (name === aisle.name) return;
    try {
      await renameAisle(aisle.id, name);
    } catch (error) {
      toast(error.message);
      return;
    }
    loadData(true);
  }, [loadData, toast]);

  // The whole walk goes back, computed from what is on screen. A button at either end of the list
  // is already disabled, so a null here is a screen that has moved on rather than a mis-tap.
  const handleMoveAisle = useCallback(async (aisle, step) => {
    const walk = walkAfterMoving(aisles, aisle.id, step);
    if (!walk) return;
    try {
      await reorderAisles(walk);
    } catch (error) {
      toast(error.message);
      return;
    }
    loadData(true);
  }, [aisles, loadData, toast]);

  const handleRemoveAisle = useCallback(async aisle => {
    try {
      await deleteAisle(aisle.id);
    } catch (error) {
      toast(error.message);
      return;
    }
    toast(`Removed ${aisle.name}`);
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
        {/* On the text being set and on nothing else. There is no flag to consult here, and adding
            one would be the `isDemo` ADR-0002 exists to keep out. Beige rather than the banner
            below's reddish warning, because this one is a standing fact about the instance rather
            than something being wrong with it. */}
        {notice && (
          <div role="status" style={{ background: '#F3EDE3', border: '1px solid #E3D8C6', borderRadius: 14, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#6E6455', lineHeight: 1.5 }}>
            {notice}
          </div>
        )}
        {/* Named rather than hinted at. A visitor who is told only that something is wrong reaches
            for the refresh button, and the greyed-out controls below make no sense without it. */}
        {degraded && (
          <div role="status" style={{ background: '#F7E9E6', border: '1px solid #EBD5CF', borderRadius: 14, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#8A5245', lineHeight: 1.5 }}>
            {OFFLINE_NOTICE}
          </div>
        )}
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
            {tab === 'recipes' && <RecipesPage recipes={recipes} readOnly={degraded} onToggleSelected={handleToggleSelected} onSetBatch={handleSetBatch} onEdit={recipe => setEditingId(recipe.id)} onDelete={handleDelete} />}
            {tab === 'shopping' && (
              <ShoppingListPage
                shoppingList={shoppingList}
                readOnly={degraded}
                onToggleGotIt={handleToggleGotIt}
                onSetAisle={handleSetAisle}
                onDoneShopping={handleDoneShopping}
              />
            )}
            {tab === 'pantry' && (
              <PantryPage
                recipes={recipes}
                pantryChecklist={pantryChecklist}
                staples={staples}
                bestMatches={bestMatches}
                syncing={bgSyncing}
                readOnly={degraded}
                onTogglePantry={handleTogglePantry}
                onSetStaple={handleSetStaple}
              />
            )}
            {tab === 'add' && (
              <AddRecipePage readOnly={degraded} onRecipeAdded={() => loadData(true)} toast={toast} />
            )}
            {tab === 'settings' && (
              <SettingsPage
                aisles={aisles}
                readOnly={degraded}
                onRefresh={handleRefresh}
                refreshing={refreshing}
                onAddAisle={handleAddAisle}
                onRenameAisle={handleRenameAisle}
                onMoveAisle={handleMoveAisle}
                onRemoveAisle={handleRemoveAisle}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
