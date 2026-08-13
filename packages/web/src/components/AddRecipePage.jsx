import { useState } from 'react';
import { RECIPE_TYPES } from '@meal-prep/shared';
import { createRecipe } from '../api.js';
import { findProblems, ingredientRow, rowsNamingIngredient, toRecipePayload } from '../recipeForm.js';
import { RecipeFileDrop } from './RecipeFileDrop.jsx';
import { I } from '../icons.jsx';

// Capturing a Recipe on the day it gets cooked, by typing it or by uploading a file that already
// holds it (stories 27, 67 and 68). An upload fills these same fields rather than saving straight
// through, so what a parser guessed is on screen before it is a Recipe.
//
// Validation runs against the schema module the API enforces, so this form refuses what the server
// would refuse and says which field is wrong before anything is sent.

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

export function AddRecipePage({ onRecipeAdded, toast }) {
  const [mode, setMode] = useState('manual');
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [cardUrl, setCardUrl] = useState('');
  const [rows, setRows] = useState([ingredientRow()]);
  const [problems, setProblems] = useState({});
  const [uploadError, setUploadError] = useState('');
  const [fileReady, setFileReady] = useState(false);
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

  const reset = () => {
    setName('');
    setType('');
    setCardUrl('');
    setRows([ingredientRow()]);
    setProblems({});
    setUploadError('');
    setFileReady(false);
  };

  const handleParsed = (parsed) => {
    setName(parsed.name);
    setRows(
      parsed.ingredients.length > 0 ? parsed.ingredients.map(ingredientRow) : [ingredientRow()],
    );
    setProblems({});
    setFileReady(true);
  };

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
      await createRecipe(payload);
      toast(`"${payload.name}" added!`);
      reset();
      onRecipeAdded();
    } catch (error) {
      toast(error.message);
    }
    setSaving(false);
  };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        <button
          className={`tab-pill ${mode === 'manual' ? 'active' : ''}`}
          onClick={() => {
            setMode('manual');
            reset();
          }}
        >
          Manual
        </button>
        <button
          className={`tab-pill ${mode === 'upload' ? 'active' : ''}`}
          onClick={() => {
            setMode('upload');
            reset();
          }}
        >
          Upload File
        </button>
      </div>

      {mode === 'upload' && !fileReady && (
        <RecipeFileDrop onParsed={handleParsed} onError={setUploadError} />
      )}

      {uploadError && (
        <p style={{ color: '#C26A5A', fontSize: 14, marginBottom: 12 }}>{uploadError}</p>
      )}

      {(mode === 'manual' || fileReady) && (
        <>
          {fileReady && (
            <p style={{ fontSize: 13, color: '#7A7568', marginBottom: 12 }}>
              Read from your file. Check it over before saving.
            </p>
          )}

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
              {fileReady && (
                <button
                  onClick={reset}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#5B7C5A',
                    fontFamily: "'Nunito', sans-serif",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Choose different file
                </button>
              )}
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

          <button
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: 14 }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Recipe'}
          </button>
        </>
      )}
    </div>
  );
}
