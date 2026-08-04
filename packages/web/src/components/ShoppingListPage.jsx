import { updateCell } from '../sheets.js';
import { I } from '../icons.jsx';

export function ShoppingListPage({ shoppingList, setShoppingList, scriptUrl, toast }) {
  const toggleItem = async (item, idx) => {
    if (item.rowIndex === -1) { toast('Sync with sheet first — tap the refresh button'); return; }
    const newGotIt = !item.gotIt;
    setShoppingList(prev => prev.map((it, i) => i === idx ? { ...it, gotIt: newGotIt } : it));
    try { await updateCell('Shopping_List', `A${item.rowIndex}`, newGotIt, scriptUrl); }
    catch { toast('Failed to save'); setShoppingList(prev => prev.map((it, i) => i === idx ? { ...it, gotIt: !newGotIt } : it)); }
  };
  const remaining = shoppingList.filter(item => !item.gotIt).length;
  return (
    <div className="fade-in">
      {shoppingList.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#7A7568' }}>{remaining} item{remaining !== 1 ? 's' : ''} remaining</span>
        </div>
      )}
      {shoppingList.length === 0 ? (
        <div className="empty-state"><span style={{ fontSize: 40 }}>🛒</span><p>No shopping items yet. Select recipes from the Recipes tab!</p></div>
      ) : (
        <div style={{ background: 'white', borderRadius: 16, padding: '4px 20px', border: '1px solid #F0EBE3' }}>
          {shoppingList.map((item, i) => (
            <div key={`${item.ingredient}-${i}`} className={`shopping-item ${item.gotIt ? 'got-it' : ''}`}>
              <button className={`checkbox-btn ${item.gotIt ? 'checked' : ''}`} onClick={() => toggleItem(item, i)}>
                {item.gotIt && I.check}
              </button>
              <div style={{ flex: 1 }}>
                <span className="item-name" style={{ fontWeight: 600, fontSize: 15 }}>{item.ingredient}</span>
                {item.aisle && <span style={{ display: 'block', fontSize: 12, color: '#A39E93', marginTop: 2 }}>Aisle: {item.aisle}</span>}
              </div>
              <span style={{ color: '#7A7568', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>{item.total} {item.unit}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
