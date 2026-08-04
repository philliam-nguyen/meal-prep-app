import { useState } from 'react';
import { updateCell } from '../sheets.js';
import { I } from '../icons.jsx';

export function IngredientsMatchPage({ pantryItems, setPantryItems, bestMatches, scriptUrl, toast, onRefreshMatch }) {
  const [refreshing, setRefreshing] = useState(false);
  const toggleIngredient = async (item, idx) => {
    const newHaveIt = !item.haveIt;
    setPantryItems(prev => prev.map((it, i) => i === idx ? { ...it, haveIt: newHaveIt } : it));
    try {
      await updateCell('Ingredients Match', `A${item.rowIndex}`, newHaveIt, scriptUrl);
      setRefreshing(true);
      await onRefreshMatch();
    } catch { toast('Failed to save'); setPantryItems(prev => prev.map((it, i) => i === idx ? { ...it, haveIt: !newHaveIt } : it)); }
    setRefreshing(false);
  };
  const haveCount = pantryItems.filter(i => i.haveIt).length;
  return (
    <div className="fade-in">
      <p style={{ color: '#7A7568', fontSize: 14, marginBottom: 16, lineHeight: 1.5 }}>Check off ingredients you have and the sheet will find the best recipe matches.</p>
      <div style={{ background: 'white', borderRadius: 16, padding: '4px 20px', border: '1px solid #F0EBE3', marginBottom: 24, maxHeight: 300, overflowY: 'auto' }}>
        {pantryItems.length === 0 && <p style={{ color: '#A39E93', fontSize: 14, padding: '16px 0' }}>No ingredients found.</p>}
        {pantryItems.map((item, i) => (
          <div key={`${item.ingredient}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i < pantryItems.length - 1 ? '1px solid #F0EBE3' : 'none' }}>
            <button className={`checkbox-btn ${item.haveIt ? 'checked' : ''}`} onClick={() => toggleIngredient(item, i)}>
              {item.haveIt && I.check}
            </button>
            <span style={{ fontSize: 15, fontWeight: 500, textTransform: 'capitalize' }}>{item.ingredient}</span>
          </div>
        ))}
      </div>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: '#7A7568', letterSpacing: 0.5, marginBottom: 12 }}>
        {haveCount > 0 ? `BEST MATCHES${refreshing ? ' (updating...)' : ''}` : 'SELECT INGREDIENTS ABOVE'}
      </h3>
      {haveCount > 0 && bestMatches.length === 0 && !refreshing && (
        <p style={{ color: '#A39E93', fontSize: 14 }}>No matches found yet.</p>
      )}
      {bestMatches.map((m, i) => (
        <div key={i} className="match-card fade-in">
          <h4 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 17, marginBottom: 6 }}>{m.recipeName || m.recipeId}</h4>
          {m.missing === 'Nothing Missing'
            ? <div style={{ fontSize: 13, color: '#5B7C5A', fontWeight: 600 }}>You have everything!</div>
            : m.missing && <div style={{ fontSize: 13, color: '#7A7568' }}><span style={{ fontWeight: 700 }}>Missing: </span>{m.missing}</div>
          }
        </div>
      ))}
    </div>
  );
}
