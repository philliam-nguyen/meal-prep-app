import { useState } from 'react';
import { createRecipe } from '../api.js';
import { BLANK_RECIPE, RecipeForm } from './RecipeForm.jsx';
import { RecipeFileDrop } from './RecipeFileDrop.jsx';

// Capturing a Recipe on the day it gets cooked, by typing it or by uploading a file that already
// holds it (stories 27, 67 and 68). An upload fills the same fields rather than saving straight
// through, so what a parser guessed is on screen before it is a Recipe.
//
// The fields themselves are RecipeForm, which the Edit page also uses. What is left here is the
// part only adding has: choosing between typing and uploading, and starting empty again afterwards.

export function AddRecipePage({ readOnly, onRecipeAdded, toast }) {
  const [mode, setMode] = useState('manual');
  const [initial, setInitial] = useState(BLANK_RECIPE);
  const [uploadError, setUploadError] = useState('');
  const [fileReady, setFileReady] = useState(false);
  // The form starts from `initial` and owns what happens to it after that, so replacing what it
  // shows means giving it a new identity rather than reaching into its state.
  const [formKey, setFormKey] = useState(0);

  const showRecipe = (recipe) => {
    setInitial(recipe);
    setFormKey((current) => current + 1);
  };

  const reset = () => {
    showRecipe(BLANK_RECIPE);
    setUploadError('');
    setFileReady(false);
  };

  const handleParsed = (parsed) => {
    showRecipe({ ...BLANK_RECIPE, name: parsed.name, ingredients: parsed.ingredients });
    setFileReady(true);
  };

  const handleSave = async (payload) => {
    await createRecipe(payload);
    toast(`"${payload.name}" added!`);
    reset();
    onRecipeAdded();
  };

  // The one page where greying out the buttons would not be enough. A Recipe is twenty fields of
  // typing, and a form that takes them all and then cannot save is the write that evaporates, only
  // more of it. The banner above says why (ADR-0009).
  if (readOnly) {
    return (
      <div className="empty-state fade-in">
        <p>Adding a recipe needs the backend. Nothing typed here could be saved right now.</p>
      </div>
    );
  }

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

          <RecipeForm
            key={formKey}
            initial={initial}
            saveLabel="Save Recipe"
            onSave={handleSave}
            toast={toast}
            headerAction={
              fileReady && (
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
              )
            }
          />
        </>
      )}
    </div>
  );
}
