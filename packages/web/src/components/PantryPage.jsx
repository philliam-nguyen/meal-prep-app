import { useState } from 'react';
import { getTypeBadge } from '../typeBadge.js';
import { I } from '../icons.jsx';
import { filterByName, splitByMembership } from '../pantryViews.js';

// The Pantry and Best Matches are two unrelated things the spreadsheet gave one name: what you
// have, an input, and what that implies, an output. CONTEXT.md says not to carry the combined name
// forward, so the tab is the Pantry and Best Matches is what it produces.
//
// Nothing is ranked here. The order arrives from the API already, which is the whole point of moving
// the match rule into SQL — the spreadsheet held one implementation and the browser held another,
// and two implementations can disagree.
//
// Two views over that one checklist rather than one long scroll, per the approved mock: a segmented
// control, one list on screen at a time, so neither view - or Best Matches below them - fights the
// other for a phone's height. `splitByMembership` and `filterByName` are the pure split and filter
// the mock's counts and search box are built on; this component owns only which view is active and
// what has been typed.

const VIEWS = [
  { key: 'in', label: 'In Pantry' },
  { key: 'notIn', label: 'Not in Pantry' },
];

/** What a view says instead of its rows: nothing to show yet, or nothing matching the search. */
function ViewMessage({ wholeView, filteredView, search }) {
  if (wholeView.length === 0) return null; // the caller supplies the empty-view copy itself
  if (filteredView.length === 0 && search.trim()) {
    return (
      <p style={{ color: '#A39E93', fontSize: 14, padding: '16px 0' }}>
        Nothing matches "{search.trim()}".
      </p>
    );
  }
  return null;
}

/** One row: the tick that moves an Ingredient between views, its name, and the staple control. */
function ChecklistRow({ item, readOnly, onTogglePantry, onSetStaple, isLast }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: isLast ? 'none' : '1px solid #F0EBE3' }}>
      <button className={`checkbox-btn ${item.inPantry ? 'checked' : ''}`} disabled={readOnly} onClick={() => onTogglePantry(item)} aria-label={item.inPantry ? `Remove ${item.name} from your pantry` : `I have ${item.name}`} aria-pressed={item.inPantry}>
        {item.inPantry && I.check}
      </button>
      <span style={{ fontSize: 15, fontWeight: 500, textTransform: 'capitalize', flex: 1 }}>{item.name}</span>
      {/* Curating the list as things get noticed, which is the only way a staple ever gets
          marked. Nothing else in the app sets one. */}
      <button className="btn-secondary" style={{ padding: '6px 10px', color: '#7A7568' }} disabled={readOnly} onClick={() => onSetStaple(item, true)} title={`Always have ${item.name}`}>
        {I.leaf}
      </button>
    </div>
  );
}

export function PantryPage({
  recipes,
  pantryChecklist,
  staples,
  bestMatches,
  syncing,
  readOnly,
  onTogglePantry,
  onSetStaple,
}) {
  const [showStaples, setShowStaples] = useState(false);
  const [activeView, setActiveView] = useState('in');
  const [search, setSearch] = useState('');

  const recipesById = new Map(recipes.map(r => [r.id, r]));

  // The whole split, unfiltered: what decides whether a view is empty rather than merely
  // unmatched, and what Best Matches and the heading below read, since neither goes through search.
  const { inPantry, notInPantry } = splitByMembership(pantryChecklist);
  const wholeByView = { in: inPantry, notIn: notInPantry };
  // The same split with the search applied, which is what the pills count and the lists render -
  // the mock's "chick" example drops both pills' counts together, including the one not on screen.
  const filteredByView = {
    in: filterByName(inPantry, search),
    notIn: filterByName(notInPantry, search),
  };
  const haveCount = inPantry.length;
  const activeItems = filteredByView[activeView];
  const activeWhole = wholeByView[activeView];

  return (
    <div className="fade-in">
      <p style={{ color: '#7A7568', fontSize: 14, marginBottom: 16, lineHeight: 1.5 }}>
        Check off what's in your kitchen and the recipes you're closest to making appear below.
      </p>

      <div style={{ position: 'relative', marginBottom: 12 }}>
        <input
          className="input-field"
          placeholder="Search ingredients..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ background: '#F5EDE3', border: '1.5px solid #E5DED3', paddingRight: search ? 40 : 16 }}
        />
        {search && (
          <button
            className="btn-secondary"
            onClick={() => setSearch('')}
            aria-label="Clear search"
            title="Clear search"
            style={{ position: 'absolute', right: 6, top: 6, bottom: 6, padding: '0 10px', background: 'transparent', border: 'none' }}
          >
            ×
          </button>
        )}
      </div>

      {/* The segmented control: one list on screen at a time so neither view, nor Best Matches
          below, has to fight the other for a phone's height. Both pills' counts move together on
          every keystroke, so the idle pill still says what is waiting on the other side. */}
      <div style={{ display: 'flex', gap: 4, background: '#F5EDE3', borderRadius: 100, padding: 4, marginBottom: 16 }}>
        {VIEWS.map(view => (
          <button
            key={view.key}
            className={`tab-pill ${activeView === view.key ? 'active' : ''}`}
            style={{ flex: 1, height: 44 }}
            onClick={() => setActiveView(view.key)}
          >
            {view.label} ({filteredByView[view.key].length})
          </button>
        ))}
      </div>

      <div style={{ background: 'white', borderRadius: 16, padding: '4px 20px', border: '1px solid #F0EBE3', marginBottom: 24, maxHeight: 300, overflowY: 'auto' }}>
        {pantryChecklist.length === 0 ? (
          <p style={{ color: '#A39E93', fontSize: 14, padding: '16px 0' }}>
            No ingredients yet. They arrive with the recipes that call for them.
          </p>
        ) : activeWhole.length === 0 ? (
          <p style={{ color: '#A39E93', fontSize: 14, padding: '16px 0' }}>
            {activeView === 'in'
              ? 'Nothing in your Pantry yet. Check items off in Not in Pantry as you notice them.'
              : 'Everything is in your Pantry.'}
          </p>
        ) : (
          <>
            <ViewMessage wholeView={activeWhole} filteredView={activeItems} search={search} />
            {activeItems.map((item, i) => (
              <ChecklistRow
                key={item.id}
                item={item}
                readOnly={readOnly}
                onTogglePantry={onTogglePantry}
                onSetStaple={onSetStaple}
                isLast={i === activeItems.length - 1}
              />
            ))}
          </>
        )}
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 700, color: '#7A7568', letterSpacing: 0.5, marginBottom: 12 }}>
        {haveCount > 0 ? `BEST MATCHES${syncing ? ' (updating...)' : ''}` : 'CHECK OFF INGREDIENTS ABOVE'}
      </h3>

      {haveCount > 0 && bestMatches.length === 0 && !syncing && (
        <p style={{ color: '#A39E93', fontSize: 14 }}>No matches found yet.</p>
      )}

      {bestMatches.map(match => {
        const recipe = recipesById.get(match.recipeId);
        return (
          <div key={match.recipeId} className="match-card fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
              <h4 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 17 }}>{recipe?.name ?? match.recipeId}</h4>
              {recipe && <span className="badge" style={{ background: getTypeBadge(recipe.type).bg, color: getTypeBadge(recipe.type).text }}>{recipe.type}</span>}
            </div>
            {/* An empty list is the whole signal. The spreadsheet used the string "Nothing Missing"
                for this, which meant every reader had to know the magic words. */}
            {match.missing.length === 0 ? (
              <div style={{ fontSize: 13, color: '#5B7C5A', fontWeight: 600 }}>You have everything!</div>
            ) : (
              <div style={{ fontSize: 13, color: '#7A7568' }}>
                <span style={{ fontWeight: 700 }}>Missing: </span>{match.missing.join(', ')}
              </div>
            )}
          </div>
        );
      })}

      {staples.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <button className="tab-pill" onClick={() => setShowStaples(s => !s)} style={{ paddingLeft: 0 }}>
            {staples.length} staple{staples.length !== 1 ? 's' : ''} kept off the list
          </button>
          {showStaples && (
            <div style={{ background: '#F5EDE3', borderRadius: 14, padding: '4px 16px', marginTop: 8 }}>
              {staples.map((staple, i) => (
                <div key={staple.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < staples.length - 1 ? '1px solid #E5DED3' : 'none' }}>
                  <span style={{ fontSize: 14, fontWeight: 500, textTransform: 'capitalize', flex: 1 }}>{staple.name}</span>
                  <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: 13 }} disabled={readOnly} onClick={() => onSetStaple(staple, false)}>
                    Put back
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
