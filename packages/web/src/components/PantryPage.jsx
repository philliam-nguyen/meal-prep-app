import { useState } from 'react';
import { getTypeBadge } from '../typeBadge.js';
import { I } from '../icons.jsx';

// The Pantry and Best Matches are two unrelated things the spreadsheet gave one name: what you
// have, an input, and what that implies, an output. CONTEXT.md says not to carry the combined name
// forward, so the tab is the Pantry and Best Matches is what it produces.
//
// Nothing is ranked here. The order arrives from the API already, which is the whole point of moving
// the match rule into SQL — the spreadsheet held one implementation and the browser held another,
// and two implementations can disagree.

export function PantryPage({
  recipes,
  pantryChecklist,
  staples,
  bestMatches,
  syncing,
  onTogglePantry,
  onSetStaple,
}) {
  const [showStaples, setShowStaples] = useState(false);

  const recipesById = new Map(recipes.map(r => [r.id, r]));
  const haveCount = pantryChecklist.filter(i => i.inPantry).length;

  return (
    <div className="fade-in">
      <p style={{ color: '#7A7568', fontSize: 14, marginBottom: 16, lineHeight: 1.5 }}>
        Check off what's in your kitchen and the recipes you're closest to making appear below.
      </p>

      <div style={{ background: 'white', borderRadius: 16, padding: '4px 20px', border: '1px solid #F0EBE3', marginBottom: 24, maxHeight: 300, overflowY: 'auto' }}>
        {pantryChecklist.length === 0 && (
          <p style={{ color: '#A39E93', fontSize: 14, padding: '16px 0' }}>
            No ingredients yet. They arrive with the recipes that call for them.
          </p>
        )}
        {pantryChecklist.map((item, i) => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i < pantryChecklist.length - 1 ? '1px solid #F0EBE3' : 'none' }}>
            <button className={`checkbox-btn ${item.inPantry ? 'checked' : ''}`} onClick={() => onTogglePantry(item)} aria-label={`I have ${item.name}`} aria-pressed={item.inPantry}>
              {item.inPantry && I.check}
            </button>
            <span style={{ fontSize: 15, fontWeight: 500, textTransform: 'capitalize', flex: 1 }}>{item.name}</span>
            {/* Curating the list as things get noticed, which is the only way a staple ever gets
                marked. Nothing else in the app sets one. */}
            <button className="btn-secondary" style={{ padding: '6px 10px', color: '#7A7568' }} onClick={() => onSetStaple(item, true)} title={`Always have ${item.name}`}>
              {I.leaf}
            </button>
          </div>
        ))}
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
                  <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => onSetStaple(staple, false)}>
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
