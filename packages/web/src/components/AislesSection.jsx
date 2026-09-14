import { useState } from 'react';
import { AISLE_MAX } from '@meal-prep/shared';
import { I } from '../icons.jsx';

// The store's sections, in the order the cook walks them. Settings is where they live because they
// are set up once and then read everywhere: this is not a thing anyone edits mid-shop.
//
// Nothing here computes a position. Moving a section produces the whole ordered list of ids and
// sends that, which is the only shape the API takes, so there is no number the browser and the
// server could disagree about. Up and down rather than drag, because a walk is a handful of
// sections and a drag on a phone is a gesture that fights the page scroll.

const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 0',
  borderTop: '1px solid #F0EBE3',
};

const iconButtonStyle = { padding: '6px 10px', fontSize: 13 };

/**
 * One section of the walk: its name, the two buttons that move it, and the two that change it. The
 * name is a label until it is tapped and a box after, the way the Shopping List's Aisle line works,
 * because correcting a name and reading one are the same row to a cook.
 */
function AisleRow({ aisle, first, last, readOnly, onRename, onMove, onRemove }) {
  // The draft doubles as the mode: null is the label, a string is the open box. One piece of state
  // rather than two, so there is no arrangement where the box is open holding nothing.
  const [draft, setDraft] = useState(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  // Closing the box before handing the value over is what keeps Escape from committing the edit it
  // is abandoning: the input is gone, so the blur that would have saved it has nothing to fire on.
  const commit = () => {
    setDraft(null);
    onRename(aisle, draft);
  };

  if (confirmingRemove && !readOnly) {
    return (
      <div style={rowStyle}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#7A7568' }}>
          Remove {aisle.name}?
        </span>
        <button
          className="btn-secondary"
          style={{ ...iconButtonStyle, color: '#A8524A' }}
          onClick={() => {
            setConfirmingRemove(false);
            onRemove(aisle);
          }}
        >
          Remove
        </button>
        <button
          className="btn-secondary"
          style={iconButtonStyle}
          onClick={() => setConfirmingRemove(false)}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div style={rowStyle}>
      {draft === null || readOnly ? (
        <span data-aisle-name style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600 }}>
          {aisle.name}
        </span>
      ) : (
        <input
          className="input-field"
          style={{ flex: 1, minWidth: 0, padding: '6px 10px', fontSize: 14 }}
          value={draft}
          maxLength={AISLE_MAX}
          aria-label={`New name for ${aisle.name}`}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
            if (event.key === 'Escape') setDraft(null);
          }}
        />
      )}
      {/* Disabled at the ends of the walk as well as in degraded mode, because the API takes the
          whole list and a move with nowhere to go has no list to send. */}
      <button
        className="btn-secondary"
        style={iconButtonStyle}
        disabled={readOnly || first}
        aria-label={`Move ${aisle.name} up`}
        onClick={() => onMove(aisle, -1)}
      >
        ↑
      </button>
      <button
        className="btn-secondary"
        style={iconButtonStyle}
        disabled={readOnly || last}
        aria-label={`Move ${aisle.name} down`}
        onClick={() => onMove(aisle, 1)}
      >
        ↓
      </button>
      <button
        className="btn-secondary"
        style={iconButtonStyle}
        disabled={readOnly}
        aria-label={`Rename ${aisle.name}`}
        onClick={() => setDraft(aisle.name)}
      >
        {I.edit}
      </button>
      <button
        className="btn-secondary"
        style={iconButtonStyle}
        disabled={readOnly}
        aria-label={`Remove ${aisle.name}`}
        onClick={() => setConfirmingRemove(true)}
      >
        {I.trash}
      </button>
    </div>
  );
}

/** The box a new section is typed into. It always adds to the end; the arrows place it after that. */
function AddAisle({ readOnly, onAdd }) {
  const [name, setName] = useState('');

  // An empty box does not fire a request, which is an affordance rather than a rule: what an Aisle
  // name may be is the server's to say, and it still refuses a name that is nothing but spaces.
  const add = () => {
    if (!name.trim()) return;
    setName('');
    onAdd(name);
  };

  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
      <input
        className="input-field"
        style={{ flex: 1, padding: '10px 14px', fontSize: 14 }}
        value={name}
        placeholder="Add an aisle"
        maxLength={AISLE_MAX}
        disabled={readOnly}
        aria-label="Add an aisle"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') add();
        }}
      />
      {/* Labelled rather than left to its text, because the nav bar carries an Add of its own and
          two controls answering to one name is a page nobody can describe. */}
      <button
        className="btn-secondary"
        aria-label="Add aisle"
        disabled={readOnly || !name.trim()}
        onClick={add}
      >
        {I.plus} Add
      </button>
    </div>
  );
}

export function AislesSection({
  aisles,
  readOnly,
  onAddAisle,
  onRenameAisle,
  onMoveAisle,
  onRemoveAisle,
}) {
  return (
    <div
      style={{
        background: 'white',
        borderRadius: 16,
        padding: 20,
        border: '1px solid #F0EBE3',
        marginBottom: 16,
      }}
    >
      <h3
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: '#7A7568',
          letterSpacing: 0.5,
          marginBottom: 14,
        }}
      >
        AISLES
      </h3>
      <p style={{ fontSize: 13, color: '#7A7568', marginBottom: 4, lineHeight: 1.6 }}>
        The sections of your store, in the order you walk them.
      </p>
      {aisles.length === 0 ? (
        <p style={{ fontSize: 13, color: '#A39E93', marginTop: 12 }}>No aisles yet.</p>
      ) : (
        <div style={{ marginTop: 12 }}>
          {aisles.map((aisle, index) => (
            <AisleRow
              key={aisle.id}
              aisle={aisle}
              first={index === 0}
              last={index === aisles.length - 1}
              readOnly={readOnly}
              onRename={onRenameAisle}
              onMove={onMoveAisle}
              onRemove={onRemoveAisle}
            />
          ))}
        </div>
      )}
      <AddAisle readOnly={readOnly} onAdd={onAddAisle} />
    </div>
  );
}
