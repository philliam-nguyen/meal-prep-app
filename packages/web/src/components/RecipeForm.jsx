import { useState } from 'react';
import { RECIPE_TYPES } from '@meal-prep/shared';
import { findProblems, ingredientRow, rowsNamingIngredient, toRecipePayload } from '../recipeForm.js';
import { I } from '../icons.jsx';

// The fields of a Recipe, used to type a new one and to correct an existing one. One component
// rather than two, because the two forms differ only in what they start with and what the save
// button does: a rule enforced in an Add form a cook could then edit their way past would be no
// rule at all.
//
// Validation runs against the schema module the API enforces, so this refuses what the server
// would refuse and says which field is wrong before anything is sent.
//
// It holds its own state and starts from `initial`, so a caller changing what the form should show
// remounts it with a new `key` rather than pushing values in. That is what keeps a half-typed
// correction from being overwritten by a background reload landing mid-edit.

const FieldError = ({ children }) =>
  children ? (
    <p style={{ color: '#C26A5A', fontSize: 12, fontWeight: 600, marginTop: 5 }}>{children}</p>
  ) : null;

const labelStyle = {
  fontSize: 13,
  fontWeight: 600,
  color: '#7A7568',
  display: 'block',
  marginBottom: 5,
};

const cardStyle = {
  background: 'white',
  borderRadius: 16,
  padding: 20,
  border: '1px solid #F0EBE3',
  marginBottom: 16,
};

/** The form's starting state for a Recipe that does not exist yet. */
export const BLANK_RECIPE = { name: '', type: '', cardUrl: '', ingredients: [] };

export function RecipeForm({ initial, saveLabel, onSave, onCancel, headerAction, toast }) {
  const [name, setName] = useState(initial.name);
  const [type, setType] = useState(initial.type);
  const [cardUrl, setCardUrl] = useState(initial.cardUrl ?? '');
  const [rows, setRows] = useState(
    initial.ingredients.length > 0 ? initial.ingredients.map(ingredientRow) : [ingredientRow()],
  );
  const [problems, setProblems] = useState({});
  const [saving, setSaving] = useState(false);

  // Errors come back indexed against the payload, which skips blank rows, so a row's position on
  // screen is not its position in the request whenever a blank one sits above it.
  const rowsToSend = rowsNamingIngredient(rows);
  const problemForRow = (rowId, field) => {
    const index = rowsToSend.findIndex((row) => row.id === rowId);
    return index === -1 ? '' : problems[`/ingredients/${index}/${field}`];
  };

  const addRow = () => setRows((current) => [...current, ingredientRow()]);
  const removeRow = (rowId) => setRows((current) => current.filter((row) => row.id !== rowId));
  const updateRow = (rowId, field, value) =>
    setRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)),
    );

  const handleSave = async () => {
    const payload = toRecipePayload({ name, type, cardUrl, rows });
    const found = findProblems(payload);
    setProblems(found);
    if (Object.keys(found).length > 0) {
      toast('Check the highlighted fields.');
      return;
    }

    setSaving(true);
    try {
      await onSave(payload);
    } catch (error) {
      toast(error.message);
    }
    setSaving(false);
  };

  return (
    <>
      <div style={cardStyle}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#7A7568', letterSpacing: 0.5 }}>
            RECIPE INFO
          </h3>
          {headerAction}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Recipe Name *</label>
          <input
            className="input-field"
            placeholder="e.g., Chicken Teriyaki Bowl"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <FieldError>{problems['/name']}</FieldError>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Type *</label>
          <select
            className="select-field"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="">Select type...</option>
            {RECIPE_TYPES.map((recipeType) => (
              <option key={recipeType} value={recipeType}>
                {recipeType}
              </option>
            ))}
          </select>
          <FieldError>{problems['/type']}</FieldError>
        </div>

        <div>
          <label style={labelStyle}>Recipe Card (optional)</label>
          <input
            className="input-field"
            placeholder="https://..."
            value={cardUrl}
            onChange={(event) => setCardUrl(event.target.value)}
          />
          <FieldError>{problems['/cardUrl']}</FieldError>
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <h3
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#7A7568',
            letterSpacing: 0.5,
            marginBottom: 14,
          }}
        >
          INGREDIENTS
        </h3>

        {rows.map((row) => (
          <div key={row.id} style={{ marginBottom: 10 }}>
            <div className="ingredient-row" style={{ marginBottom: 0 }}>
              <input
                className="input-field"
                placeholder="Ingredient"
                value={row.name}
                onChange={(event) => updateRow(row.id, 'name', event.target.value)}
              />
              <input
                className="input-field qty-input"
                placeholder="Qty"
                inputMode="decimal"
                value={row.quantity}
                onChange={(event) => updateRow(row.id, 'quantity', event.target.value)}
              />
              <input
                className="input-field unit-input"
                placeholder="Unit"
                value={row.unit}
                onChange={(event) => updateRow(row.id, 'unit', event.target.value)}
              />
              {rows.length > 1 && (
                <button
                  onClick={() => removeRow(row.id)}
                  aria-label={`Remove ${row.name || 'ingredient'}`}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#C26A5A',
                    cursor: 'pointer',
                    padding: 4,
                  }}
                >
                  {I.trash}
                </button>
              )}
            </div>
            <FieldError>
              {problemForRow(row.id, 'name') ||
                problemForRow(row.id, 'quantity') ||
                problemForRow(row.id, 'unit')}
            </FieldError>
          </div>
        ))}

        <button className="btn-secondary" onClick={addRow} style={{ marginTop: 8 }}>
          {I.plus} Add Ingredient
        </button>
        <FieldError>{problems['/ingredients']}</FieldError>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        {onCancel && (
          <button
            className="btn-secondary"
            style={{ flex: 1, justifyContent: 'center', padding: 14 }}
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
        )}
        <button
          className="btn-primary"
          style={{ flex: 2, justifyContent: 'center', padding: 14 }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : saveLabel}
        </button>
      </div>
    </>
  );
}
