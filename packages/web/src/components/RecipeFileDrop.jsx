import { useRef } from 'react';
import { parseRecipeFile } from '@meal-prep/shared';

// Picking a CSV or text file and reading a Recipe out of it (story 67). What comes back fills the
// Add form for the cook to check rather than saving straight through (story 68), so nothing here
// talks to the API.

// A recipe file is a few kilobytes. Anything at this size is the wrong file, and refusing it beats
// handing it to FileReader and freezing the tab.
const MAX_UPLOAD_BYTES = 512 * 1024;

export function RecipeFileDrop({ onParsed, onError }) {
  const fileInput = useRef(null);

  const handleFile = (event) => {
    const file = event.target.files[0];
    // Cleared before anything else, so choosing the same file twice still fires a change.
    event.target.value = '';
    if (!file) return;

    onError('');
    if (file.size > MAX_UPLOAD_BYTES) {
      onError('That file is over 512 KB. A recipe file is a few kilobytes.');
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => onError('Could not read that file.');
    reader.onload = () => {
      const parsed = parseRecipeFile(String(reader.result), file.name);
      if (!parsed.name && parsed.ingredients.length === 0) {
        onError('Found no recipe in that file. Check the format, or type it in instead.');
        return;
      }
      onParsed(parsed);
    };
    reader.readAsText(file);
  };

  return (
    <div
      style={{
        border: '2px dashed #E5DED3',
        borderRadius: 16,
        padding: '40px 24px',
        textAlign: 'center',
        cursor: 'pointer',
        background: 'white',
        marginBottom: 16,
      }}
      onClick={() => fileInput.current.click()}
    >
      <input
        ref={fileInput}
        type="file"
        accept=".txt,.csv,text/plain,text/csv"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#A39E93"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ display: 'block', margin: '0 auto 12px' }}
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Tap to select a file</p>
      <p style={{ fontSize: 13, color: '#A39E93' }}>.txt or .csv recipe file</p>
    </div>
  );
}
