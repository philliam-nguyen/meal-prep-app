import { useState } from 'react';
import { getTypeBadge } from '../typeBadge.js';
import { I } from '../icons.jsx';
import { RecipeDetail } from './RecipeDetail.jsx';

export function RecipesPage({ recipes, ingredients, onToggleShoppingList }) {
  const [filter, setFilter] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState(null);
  const types = ['All', ...new Set(recipes.map(r => r.type).filter(Boolean))];
  const filtered = recipes.filter(r => {
    const matchesType = filter === 'All' || r.type === filter;
    const matchesSearch = !searchTerm || r.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesType && matchesSearch;
  });
  return (
    <div className="fade-in">
      <div style={{ marginBottom: 20 }}>
        <input className="input-field" placeholder="Search recipes..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ background: '#F5EDE3', border: '1.5px solid #E5DED3' }} />
      </div>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 16, scrollbarWidth: 'none' }}>
        {types.map(t => <button key={t} className={`tab-pill ${filter === t ? 'active' : ''}`} onClick={() => setFilter(t)}>{t}</button>)}
      </div>
      {filtered.length === 0 ? (
        <div className="empty-state"><span style={{ fontSize: 40 }}>🍳</span><p>No recipes found.</p></div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filtered.map((r, i) => (
            <div key={r.id} className={`recipe-card fade-in stagger-${(i % 4) + 1}`} onClick={() => setSelected(r)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, marginBottom: 6 }}>{r.name}</h3>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span className="badge" style={{ background: getTypeBadge(r.type).bg, color: getTypeBadge(r.type).text }}>{r.type}</span>
                    {r.inShoppingList && <span className="badge" style={{ background: '#E8F0E7', color: '#3D5A3C' }}>In List</span>}
                  </div>
                </div>
                <span style={{ color: '#A39E93' }}>{I.chevron}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {selected && <RecipeDetail recipe={selected} ingredients={ingredients} onClose={() => setSelected(null)} onToggleShoppingList={r => { onToggleShoppingList(r); setSelected(null); }} />}
    </div>
  );
}
