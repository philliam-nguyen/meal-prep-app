import { useEffect, useRef, useState } from 'react';
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

// The close gesture: pull the sheet down. It lives here, in the component that owns open, close
// and the slide-up, rather than in a gesture library, because there is one sheet that wants it.
//
// Every number is a fraction of the sheet's height rather than a pixel, so a short Recipe and a
// long one close at the same point of the pull. The choices, which the spec left to this ticket:
// a pull past 30% of the height closes; so does a flick, a pull faster than 0.6px/ms that has
// covered at least 15%, because a quick short pull is how a phone is told to dismiss anything.
// Anything less snaps back. A finger has to move 8px before a touch is a drag at all, which is
// roughly the slop a browser allows a tap, so a tap on a button stays a tap.
const CLOSE_FRACTION = 0.3;
const FLICK_VELOCITY = 0.6;
const FLICK_MIN_FRACTION = 0.15;
const DRAG_SLOP_PX = 8;
const SETTLE_MS = 250;

// Native listeners rather than React's onTouchMove, and the reason is the one surprise the spec
// said to expect: React attaches touchmove as a passive listener, and a passive listener's
// preventDefault is ignored. Without preventDefault, WebKit runs its own response to the same
// finger, the rubber-band at the top of the scrolled content, underneath the sheet moving with
// it. So the three listeners are attached by hand, with touchmove explicitly non-passive, and
// preventDefault is called only once a touch has become a drag: a touch that stays a tap, or that
// starts with the content scrolled down (see onStart), is left to the browser entirely.
function useDragToClose(sheetRef, onClose) {
  // A ref rather than a dependency: the parent passes a new onClose on every render, and a
  // background reload mid-drag would otherwise re-attach the listeners and lose the finger.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return undefined;
    let touch = null;

    const settle = (transform) => {
      sheet.style.transition = `transform ${SETTLE_MS}ms ease-out`;
      sheet.style.transform = transform;
    };

    const onStart = (event) => {
      // The drag takes over only with the content at the top. Scrolled down, the finger is scrolling
      // the list, and the browser keeps it; once the list is back at the top, the next pull is this.
      if (touch?.closing || event.touches.length !== 1 || sheet.scrollTop > 0) return;
      const { clientY } = event.touches[0];
      touch = { startY: clientY, lastY: clientY, lastTime: event.timeStamp, velocity: 0, dragging: false, closing: false };
    };

    const onMove = (event) => {
      if (!touch || touch.closing) return;
      const { clientY } = event.touches[0];
      const travelled = clientY - touch.startY;
      if (!touch.dragging) {
        // Upward, or not yet past the slop: not a drag. Left to the browser, which may scroll.
        if (travelled < DRAG_SLOP_PX) return;
        touch.dragging = true;
        sheet.style.transition = 'none';
        // The slide-up may still be running; while it is, its transform wins over the finger's.
        sheet.style.animation = 'none';
      }
      event.preventDefault();
      touch.velocity = (clientY - touch.lastY) / Math.max(1, event.timeStamp - touch.lastTime);
      touch.lastY = clientY;
      touch.lastTime = event.timeStamp;
      // Clamped at the rest position: the sheet follows the finger down and no further up.
      sheet.style.transform = `translateY(${Math.max(0, travelled)}px)`;
    };

    const onEnd = (event) => {
      if (!touch || touch.closing) return;
      const state = touch;
      if (!state.dragging) {
        touch = null;
        return;
      }
      // A lifted finger synthesizes a click at where it lifted. After a drag that is never what
      // was meant, and a snap-back that pressed the button under the finger would be a gesture
      // eating a tap.
      event.preventDefault();

      const height = sheet.getBoundingClientRect().height;
      const travelled = Math.max(0, state.lastY - state.startY);
      const flicked = state.velocity >= FLICK_VELOCITY && travelled >= height * FLICK_MIN_FRACTION;
      if (travelled < height * CLOSE_FRACTION && !flicked) {
        settle('');
        touch = null;
        return;
      }

      // Slide the rest of the way, then close through the same path as a tap on the overlay, so
      // the overlay, focus and state all go the one way they know how to. The timer is for a
      // transitionend that never arrives, which a sheet unmounted for another reason produces.
      state.closing = true;
      let closed = false;
      const finish = () => {
        if (closed) return;
        closed = true;
        sheet.removeEventListener('transitionend', finish);
        closeRef.current();
      };
      sheet.addEventListener('transitionend', finish);
      setTimeout(finish, SETTLE_MS + 50);
      settle('translateY(100%)');
    };

    const onCancel = () => {
      if (!touch || touch.closing) return;
      if (touch.dragging) settle('');
      touch = null;
    };

    sheet.addEventListener('touchstart', onStart, { passive: true });
    sheet.addEventListener('touchmove', onMove, { passive: false });
    sheet.addEventListener('touchend', onEnd, { passive: false });
    sheet.addEventListener('touchcancel', onCancel);
    return () => {
      sheet.removeEventListener('touchstart', onStart);
      sheet.removeEventListener('touchmove', onMove);
      sheet.removeEventListener('touchend', onEnd);
      sheet.removeEventListener('touchcancel', onCancel);
    };
  }, [sheetRef]);
}

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
  const sheetRef = useRef(null);
  useDragToClose(sheetRef, onClose);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={sheetRef}
        className="modal-content slide-up"
        role="dialog"
        aria-modal="true"
        aria-label={recipe.name}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-handle" aria-hidden="true" />
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
                {/* Disabled with the button that opens it, so read-only is a property of the whole
                    flow rather than of whichever button a reader happens to reach first. */}
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
