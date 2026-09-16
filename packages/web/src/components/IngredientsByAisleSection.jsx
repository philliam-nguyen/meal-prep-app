import { useState } from 'react';
import { filterIngredients } from '../ingredientFiling.js';
import { AisleField } from './AisleField.jsx';

// The bulk view: every Ingredient the app knows, Staples included, each with the same Aisle picker
// the Shopping List uses. The initial sort of a whole kitchen happens in one sitting here, rather
// than one shopping trip at a time on the Shopping List page itself.
//
// Search and the unassigned filter are pure functions over the `ingredients` state already carries
// (ingredientFiling.js), run again on every keystroke and every flip of the switch - no request of
// their own. Setting an Aisle is the one write this section makes, and it is the same write and the
// same optimistic update the Shopping List's picker makes, through the same AisleField component.

/** One row: the Ingredient's name, a note when it is a Staple, and its Aisle picker. */
function IngredientRow({ ingredient, aisles, readOnly, onSetAisle, isLast }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: isLast ? 'none' : '1px solid #F0EBE3' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{ingredient.name}</span>
        {/* Staples never appear on the Pantry checklist, but they still need a home in the store, so
            this is the one place a Staple's Aisle can be corrected. */}
        {ingredient.staple && (
          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: '#A39E93', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Staple
          </span>
        )}
        <AisleField entry={ingredient} aisles={aisles} readOnly={readOnly} onSetAisle={onSetAisle} />
      </div>
    </div>
  );
}

export function IngredientsByAisleSection({ ingredients, aisles, readOnly, onSetIngredientAisle }) {
  const [search, setSearch] = useState('');
  const [unassigned, setUnassigned] = useState(false);

  const filtered = filterIngredients(ingredients, { search, unassigned });

  return (
    <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #F0EBE3', marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: '#7A7568', letterSpacing: 0.5, marginBottom: 14 }}>
        INGREDIENTS BY AISLE
      </h3>
      <p style={{ fontSize: 13, color: '#7A7568', marginBottom: 12, lineHeight: 1.6 }}>
        Every Ingredient the app knows. Sort your whole kitchen here in one sitting.
      </p>
      <input
        className="input-field"
        style={{ width: '100%', padding: '10px 14px', fontSize: 14, marginBottom: 10 }}
        placeholder="Search ingredients..."
        value={search}
        disabled={ingredients.length === 0}
        onChange={event => setSearch(event.target.value)}
      />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#7A7568', marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={unassigned}
          disabled={ingredients.length === 0}
          onChange={event => setUnassigned(event.target.checked)}
        />
        Unassigned only
      </label>
      {ingredients.length === 0 ? (
        <p style={{ fontSize: 13, color: '#A39E93' }}>No ingredients yet. They arrive with the recipes that call for them.</p>
      ) : filtered.length === 0 ? (
        <p style={{ fontSize: 13, color: '#A39E93' }}>Nothing matches.</p>
      ) : (
        <div>
          {filtered.map((ingredient, index) => (
            <IngredientRow
              key={ingredient.id}
              ingredient={ingredient}
              aisles={aisles}
              readOnly={readOnly}
              onSetAisle={onSetIngredientAisle}
              isLast={index === filtered.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
