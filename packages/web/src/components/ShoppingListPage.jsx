import { useState } from 'react';
import { AISLE_MAX } from '@meal-prep/shared';
import { formatAmounts } from '../format.js';
import { I } from '../icons.jsx';

// The list arrives derived. Nothing here groups Ingredients or adds quantities up: that ran in the
// browser and in a spreadsheet formula at the same time, which is two implementations that could
// disagree about what to buy, and it is one query in SQL now.
//
// What this page does own is the two marks that survive that derivation, because they belong to the
// Ingredient rather than to the row: Got It, and the Aisle it is found in.

/**
 * The Aisle line under an Ingredient's name: a label until it is tapped, a box after. The same
 * control sets an Aisle for the first time and corrects one that is wrong, because to a cook
 * standing in the wrong aisle those are the same act.
 */
function AisleField({ entry, onSetAisle }) {
  // The draft doubles as the mode: null is the label, a string is the open box. One piece of state
  // rather than two, so there is no arrangement where the box is open holding nothing.
  const [draft, setDraft] = useState(null);

  if (draft === null) {
    return (
      <button
        onClick={() => setDraft(entry.aisle ?? '')}
        style={{ display: 'block', background: 'none', border: 'none', padding: '2px 0 0', fontSize: 12, color: '#A39E93', cursor: 'pointer', fontFamily: 'inherit' }}
      >
        {entry.aisle ? `Aisle: ${entry.aisle}` : 'Set aisle'}
      </button>
    );
  }

  // Closing the box before handing the value over is what keeps Escape from committing the edit it
  // is abandoning: the input is gone, so the blur that would have saved it has nothing to fire on.
  const commit = () => { setDraft(null); onSetAisle(entry, draft); };

  return (
    <input
      className="input-field"
      style={{ padding: '4px 8px', fontSize: 12, marginTop: 4, maxWidth: 200 }}
      value={draft}
      placeholder="Which aisle?"
      maxLength={AISLE_MAX}
      autoFocus
      onChange={event => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={event => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') setDraft(null);
      }}
    />
  );
}

/**
 * The one action that clears every Got It mark, behind one confirmation. Nothing else clears them -
 * adding a forgotten Recipe mid-trip leaves the ticks already earned in the store - which is what
 * makes this the button that can undo a whole shop and worth asking about.
 */
function ClearGotItButton({ onClearGotIt }) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button className="btn-secondary" onClick={() => setAsking(true)}>
        Clear all Got It marks
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
      <span style={{ fontSize: 13, color: '#7A7568' }}>Clear every mark?</span>
      <button className="btn-primary" style={{ padding: '8px 18px', fontSize: 14 }} onClick={() => { setAsking(false); onClearGotIt(); }}>
        Yes, clear them
      </button>
      <button className="btn-secondary" style={{ padding: '8px 18px' }} onClick={() => setAsking(false)}>
        Cancel
      </button>
    </div>
  );
}

export function ShoppingListPage({ shoppingList, onToggleGotIt, onSetAisle, onClearGotIt }) {
  if (shoppingList.length === 0) {
    return (
      <div className="empty-state fade-in">
        <span style={{ fontSize: 40 }}>🛒</span>
        <p>Nothing to buy yet. Select a recipe and its ingredients land here.</p>
      </div>
    );
  }

  const remaining = shoppingList.filter(entry => !entry.gotIt).length;

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#7A7568' }}>{remaining} ingredient{remaining !== 1 ? 's' : ''} left to buy</span>
      </div>
      <div style={{ background: 'white', borderRadius: 16, padding: '4px 20px', border: '1px solid #F0EBE3' }}>
        {shoppingList.map(entry => (
          <div key={entry.ingredientId} className={`shopping-item ${entry.gotIt ? 'got-it' : ''}`}>
            {/* The tick lands before the write does. A cook works down an aisle a dozen entries at a
                time, and a failed write puts the entry back rather than leaving a tick that never
                saved. */}
            <button
              className={`checkbox-btn ${entry.gotIt ? 'checked' : ''}`}
              onClick={() => onToggleGotIt(entry)}
              aria-label={entry.gotIt ? `Unmark ${entry.name}` : `Mark ${entry.name} as got it`}
            >
              {entry.gotIt && I.check}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="item-name" style={{ fontWeight: 600, fontSize: 15 }}>{entry.name}</span>
              <AisleField entry={entry} onSetAisle={onSetAisle} />
            </div>
            <span style={{ color: '#7A7568', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>{formatAmounts(entry.amounts)}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
        <ClearGotItButton onClearGotIt={onClearGotIt} />
      </div>
    </div>
  );
}
