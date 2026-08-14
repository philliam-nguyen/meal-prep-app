import { formatAmount } from '../format.js';
import { getTypeBadge } from '../typeBadge.js';
import { I } from '../icons.jsx';

export function RecipeDetail({ recipe, onClose, onToggleSelected }) {
  const { ingredients } = recipe;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content slide-up" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, marginBottom: 6 }}>{recipe.name}</h2>
            <span className="badge" style={{ background: getTypeBadge(recipe.type).bg, color: getTypeBadge(recipe.type).text }}>{recipe.type}</span>
          </div>
          {recipe.cardUrl && (
            <a href={recipe.cardUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#5B7C5A', fontWeight: 600, fontSize: 14, textDecoration: 'none', padding: '8px 14px', background: '#E8F0E7', borderRadius: 10 }}>
              Recipe {I.external}
            </a>
          )}
        </div>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#7A7568', letterSpacing: 0.5, marginBottom: 12 }}>INGREDIENTS</h3>
        {ingredients.length === 0 ? (
          <p style={{ color: '#7A7568', fontSize: 14 }}>No ingredients listed yet.</p>
        ) : (
          <div style={{ background: '#F5EDE3', borderRadius: 14, padding: 16, marginBottom: 20 }}>
            {ingredients.map((ing, i) => (
              <div key={ing.ingredientId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < ingredients.length - 1 ? '1px solid #E5DED3' : 'none' }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{ing.name}</span>
                <span style={{ color: '#7A7568', fontSize: 14, fontWeight: 500 }}>{formatAmount(ing)}</span>
              </div>
            ))}
          </div>
        )}
        <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => onToggleSelected(recipe)}>
          {I.cart} <span>{recipe.selected ? 'Remove from Shopping List' : 'Add to Shopping List'}</span>
        </button>
      </div>
    </div>
  );
}
