import { useRef, useState } from 'react';
import { RECIPE_TYPES } from '@meal-prep/shared';
import { appendToSheet } from '../sheets.js';
import { parseCsvFile, parseTextFile } from '../recipeFiles.js';
import { I } from '../icons.jsx';

export function AddRecipePage({ scriptUrl, onRecipeAdded, toast, recipes }) {
  const [mode, setMode] = useState('manual');
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [cardUrl, setCardUrl] = useState('');
  const [ingredientRows, setIngredientRows] = useState([{ ingredient: '', quantity: '', unit: '' }]);
  const [saving, setSaving] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [fileReady, setFileReady] = useState(false);
  const fileRef = useRef(null);
  const addRow = () => setIngredientRows(prev => [...prev, { ingredient: '', quantity: '', unit: '' }]);
  const removeRow = idx => setIngredientRows(prev => prev.filter((_, i) => i !== idx));
  const updateRow = (idx, field, value) => { setIngredientRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r)); };
  const nextId = () => {
    const nums = recipes.map(r => parseInt(r.id.replace(/\D/g, ''), 10)).filter(n => !isNaN(n));
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return `R${String(next).padStart(3, '0')}`;
  };

  const handleFileChange = e => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadError('');
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const parsed = file.name.toLowerCase().endsWith('.csv')
          ? parseCsvFile(evt.target.result, file.name)
          : parseTextFile(evt.target.result);
        setName(parsed.name);
        setIngredientRows(parsed.ingredients.length > 0 ? parsed.ingredients : [{ ingredient: '', quantity: '', unit: '' }]);
        setFileReady(true);
      } catch { setUploadError('Could not parse file. Please check the format.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const resetUpload = () => {
    setName(''); setType(''); setCardUrl('');
    setIngredientRows([{ ingredient: '', quantity: '', unit: '' }]);
    setFileReady(false); setUploadError('');
  };

  const handleSave = async () => {
    if (!name.trim()) return toast('Please enter a recipe name');
    if (!type.trim()) return toast('Please select a type');
    if (!scriptUrl) return toast('Add your Apps Script URL in Settings to enable saving.');
    setSaving(true);
    try {
      const id = nextId();
      await appendToSheet('Recipes', [[id, name, type, cardUrl, '']], scriptUrl);
      const ingRows = ingredientRows.filter(r => r.ingredient.trim()).map(r => [id, r.ingredient, r.quantity, r.unit]);
      if (ingRows.length > 0) await appendToSheet('Ingredients', ingRows, scriptUrl);
      toast(`"${name}" added!`);
      setName(''); setType(''); setCardUrl('');
      setIngredientRows([{ ingredient: '', quantity: '', unit: '' }]);
      setFileReady(false);
      onRecipeAdded();
    } catch (err) { toast('Error saving — ' + (err.message || 'check your Script URL in Settings.')); }
    setSaving(false);
  };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        <button className={`tab-pill ${mode === 'manual' ? 'active' : ''}`} onClick={() => { setMode('manual'); resetUpload(); }}>Manual</button>
        <button className={`tab-pill ${mode === 'upload' ? 'active' : ''}`} onClick={() => { setMode('upload'); resetUpload(); }}>Upload File</button>
      </div>

      {mode === 'upload' && !fileReady && (
        <div style={{ border: '2px dashed #E5DED3', borderRadius: 16, padding: '40px 24px', textAlign: 'center', cursor: 'pointer', background: 'white', marginBottom: 16 }} onClick={() => fileRef.current.click()}>
          <input ref={fileRef} type="file" accept=".txt,.csv,text/plain,text/csv" style={{ display: 'none' }} onChange={handleFileChange} />
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#A39E93" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', margin: '0 auto 12px' }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Tap to select a file</p>
          <p style={{ fontSize: 13, color: '#A39E93' }}>.txt or .csv recipe file</p>
        </div>
      )}

      {uploadError && <p style={{ color: '#C26A5A', fontSize: 14, marginBottom: 12 }}>{uploadError}</p>}

      {(mode === 'manual' || fileReady) && (
        <>
          <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #F0EBE3', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#7A7568', letterSpacing: 0.5 }}>RECIPE INFO</h3>
              {fileReady && <button onClick={resetUpload} style={{ background: 'none', border: 'none', color: '#5B7C5A', fontFamily: "'Nunito', sans-serif", fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Choose different file</button>}
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#7A7568', display: 'block', marginBottom: 5 }}>Recipe Name *</label>
              <input className="input-field" placeholder="e.g., Chicken Teriyaki Bowl" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#7A7568', display: 'block', marginBottom: 5 }}>Type *</label>
              <select className="select-field" value={type} onChange={e => setType(e.target.value)}>
                <option value="">Select type...</option>
                {RECIPE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {mode === 'manual' && (
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#7A7568', display: 'block', marginBottom: 5 }}>Recipe Link (optional)</label>
                <input className="input-field" placeholder="https://..." value={cardUrl} onChange={e => setCardUrl(e.target.value)} />
              </div>
            )}
          </div>
          <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #F0EBE3', marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#7A7568', letterSpacing: 0.5, marginBottom: 14 }}>INGREDIENTS</h3>
            {ingredientRows.map((row, i) => (
              <div key={i} className="ingredient-row">
                <input className="input-field" placeholder="Ingredient" value={row.ingredient} onChange={e => updateRow(i, 'ingredient', e.target.value)} />
                <input className="input-field qty-input" placeholder="Qty" value={row.quantity} onChange={e => updateRow(i, 'quantity', e.target.value)} />
                <input className="input-field unit-input" placeholder="Unit" value={row.unit} onChange={e => updateRow(i, 'unit', e.target.value)} />
                {ingredientRows.length > 1 && <button onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', color: '#C26A5A', cursor: 'pointer', padding: 4 }}>{I.trash}</button>}
              </div>
            ))}
            <button className="btn-secondary" onClick={addRow} style={{ marginTop: 8 }}>{I.plus} Add Ingredient</button>
          </div>
          <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 14 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Recipe'}
          </button>
        </>
      )}
    </div>
  );
}
