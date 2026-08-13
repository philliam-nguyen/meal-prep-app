import { useState } from 'react';
import { RECIPE_TYPES } from '@meal-prep/shared';
import { getTypeBadge } from '../typeBadge.js';
import { I } from '../icons.jsx';
import { RecipeDetail } from './RecipeDetail.jsx';

// Search and Recipe Type filtering run here rather than at the API, because the whole collection
// already arrived in the one request the first paint made. A keystroke costs no round trip.

const ALL = 'All';

/** Only the Recipe Types actually present, ordered by the fixed set rather than by insertion. */
function typesPresent(recipes) {
  const present = new Set(recipes.map(r => r.type).filter(Boolean));
  const known = RECIPE_TYPES.filter(t => present.has(t));
  const unknown = [...present].filter(t => !RECIPE_TYPES.includes(t)).sort();
  return [ALL, ...known, ...unknown];
}

export function RecipesPage({ recipes }) {
  const [filter, setFilter] = useState(ALL);
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState(null);

  const types = typesPresent(recipes);
  const search = searchTerm.trim().toLowerCase();
  const filtered = recipes.filter(r => {
    const matchesType = filter === ALL || r.type === filter;
    const matchesSearch = !search || r.name.toLowerCase().includes(search);
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
        <div className="empty-state">
          <span style={{ fontSize: 40 }}>🍳</span>
          <p>{recipes.length === 0 ? 'No recipes yet.' : 'No recipes match that.'}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filtered.map((r, i) => (
            <div key={r.id} className={`recipe-card fade-in stagger-${(i % 4) + 1}`} onClick={() => setSelected(r)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, marginBottom: 6 }}>{r.name}</h3>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span className="badge" style={{ background: getTypeBadge(r.type).bg, color: getTypeBadge(r.type).text }}>{r.type}</span>
                    {r.selected && <span className="badge" style={{ background: '#E8F0E7', color: '#3D5A3C' }}>In List</span>}
                  </div>
                </div>
                <span style={{ color: '#A39E93' }}>{I.chevron}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {selected && <RecipeDetail recipe={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
