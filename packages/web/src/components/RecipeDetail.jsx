import { useState } from 'react';
import { formatAmount } from '../format.js';
import { getTypeBadge } from '../typeBadge.js';
import { I } from '../icons.jsx';

// Editing and deleting are offered here rather than from the browse list, because this is the only
// place the cook can see what they are about to change.
//
// A Protected Recipe offers neither. The server refuses both whatever this shows, so hiding them is
// what keeps a visitor from meeting a refusal rather than what enforces it. The Homelab Variant
// never sets the flag, so nothing here is hidden there (ADR-0002).
//
// Read-only is the other reason a button here does nothing, and it greys out rather than hides: the
// backend is offline, the Recipe Card link still works, and a visitor who came to see what the app
// does should still see what it offers (ADR-0009).

const dangerButtonStyle = {
  flex: 1,
  justifyContent: 'center',
  background: '#F7E9E6',
  color: '#C26A5A',
  border: 'none',
};

export function RecipeDetail({ recipe, readOnly, onClose, onToggleSelected, onEdit, onDelete }) {
  const { ingredients } = recipe;
  // Deleting is the one thing here nothing undoes, so it asks. In place rather than through the
  // browser's confirm dialog, which a phone renders as a modal on top of a modal.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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
        <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={readOnly} onClick={() => onToggleSelected(recipe)}>
          {I.cart} <span>{recipe.selected ? 'Remove from Shopping List' : 'Add to Shopping List'}</span>
        </button>

        {!recipe.protected && (
          confirmingDelete ? (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 14, color: '#7A7568', marginBottom: 10, textAlign: 'center' }}>
                Delete {recipe.name}? This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setConfirmingDelete(false)}>
                  Keep It
                </button>
                {/* Disabled here too, because the API can go quiet between opening this and
                    answering the question it asks. */}
                <button className="btn-secondary" style={dangerButtonStyle} disabled={readOnly} onClick={() => onDelete(recipe)}>
                  {I.trash} <span>Delete</span>
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }} disabled={readOnly} onClick={() => onEdit(recipe)}>
                {I.edit} <span>Edit</span>
              </button>
              <button className="btn-secondary" style={dangerButtonStyle} disabled={readOnly} onClick={() => setConfirmingDelete(true)}>
                {I.trash} <span>Delete</span>
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
