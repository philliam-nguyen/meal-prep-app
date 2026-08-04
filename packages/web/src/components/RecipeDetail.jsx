import { getTypeBadge } from '../typeBadge.js';
import { I } from '../icons.jsx';

export function RecipeDetail({ recipe, ingredients, onClose, onToggleShoppingList }) {
  const recipeIngredients = ingredients.filter(i => i.recipeId === recipe.id);
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
        {recipeIngredients.length === 0 ? (
          <p style={{ color: '#7A7568', fontSize: 14 }}>No ingredients listed yet.</p>
        ) : (
          <div style={{ background: '#F5EDE3', borderRadius: 14, padding: 16, marginBottom: 20 }}>
            {recipeIngredients.map((ing, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < recipeIngredients.length - 1 ? '1px solid #E5DED3' : 'none' }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{ing.ingredient}</span>
                <span style={{ color: '#7A7568', fontSize: 14, fontWeight: 500 }}>{ing.quantity} {ing.unit}</span>
              </div>
            ))}
          </div>
        )}
        <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => onToggleShoppingList(recipe)}>
          {I.cart} <span>{recipe.inShoppingList ? 'Remove from Shopping List' : 'Add to Shopping List'}</span>
        </button>
      </div>
    </div>
  );
}
