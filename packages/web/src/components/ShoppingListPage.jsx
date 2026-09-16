import { useState } from 'react';
import { formatAmounts } from '../format.js';
import { I } from '../icons.jsx';
import { AisleField } from './AisleField.jsx';

// The list arrives derived. Nothing here groups Ingredients or adds quantities up: that ran in the
// browser and in a spreadsheet formula at the same time, which is two implementations that could
// disagree about what to buy, and it is one query in SQL now.
//
// What this page does own is the two marks that survive that derivation, because they belong to the
// Ingredient rather than to the row: Got It, and the Aisle it is filed under. The Aisle picker
// itself lives in AisleField.jsx now, shared with the Settings bulk view.

/**
 * The end of a trip: every Recipe deselected and every Got It mark cleared, behind one
 * confirmation. It empties the page a cook is standing in front of, and the tap that sends it
 * happens in a car park with a phone in one hand, so it asks first. Asking inline rather than in a
 * dialog, in the position and style the control it replaces stood in.
 */
function DoneShoppingButton({ readOnly, onDoneShopping }) {
  const [asking, setAsking] = useState(false);

  // Read-only never opens the question, so there is no Yes to press that could not be honoured.
  if (!asking || readOnly) {
    return (
      <button className="btn-secondary" disabled={readOnly} onClick={() => setAsking(true)}>
        Done Shopping
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
      <span style={{ fontSize: 13, color: '#7A7568' }}>Clear the list and start fresh?</span>
      <button className="btn-primary" style={{ padding: '8px 18px', fontSize: 14 }} onClick={() => { setAsking(false); onDoneShopping(); }}>
        Yes, I'm done
      </button>
      <button className="btn-secondary" style={{ padding: '8px 18px' }} onClick={() => setAsking(false)}>
        Cancel
      </button>
    </div>
  );
}

export function ShoppingListPage({ shoppingList, aisles, readOnly, onToggleGotIt, onSetAisle, onDoneShopping }) {
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
              disabled={readOnly}
              onClick={() => onToggleGotIt(entry)}
              aria-label={entry.gotIt ? `Unmark ${entry.name}` : `Mark ${entry.name} as got it`}
            >
              {entry.gotIt && I.check}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="item-name" style={{ fontWeight: 600, fontSize: 15 }}>{entry.name}</span>
              <AisleField entry={entry} aisles={aisles} readOnly={readOnly} onSetAisle={onSetAisle} />
            </div>
            <span style={{ color: '#7A7568', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>{formatAmounts(entry.amounts)}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
        <DoneShoppingButton readOnly={readOnly} onDoneShopping={onDoneShopping} />
      </div>
    </div>
  );
}
