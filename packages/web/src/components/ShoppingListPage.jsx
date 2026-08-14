import { formatAmounts } from '../format.js';
import { I } from '../icons.jsx';

// The list arrives derived. Nothing here groups Ingredients or adds quantities up: that ran in the
// browser and in a spreadsheet formula at the same time, which is two implementations that could
// disagree about what to buy, and it is one query in SQL now.

export function ShoppingListPage({ shoppingList }) {
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
            {/* Ticking an entry is a write of its own and arrives with Got It. Disabled rather than
                live, so nothing here looks like it saved. */}
            <button className={`checkbox-btn ${entry.gotIt ? 'checked' : ''}`} disabled>
              {entry.gotIt && I.check}
            </button>
            <div style={{ flex: 1 }}>
              <span className="item-name" style={{ fontWeight: 600, fontSize: 15 }}>{entry.name}</span>
              {entry.aisle && <span style={{ display: 'block', fontSize: 12, color: '#A39E93', marginTop: 2 }}>Aisle: {entry.aisle}</span>}
            </div>
            <span style={{ color: '#7A7568', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>{formatAmounts(entry.amounts)}</span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: '#A39E93', textAlign: 'center', marginTop: 12 }}>
        Ticking things off returns with Got It.
      </p>
    </div>
  );
}
