import { useEffect, useRef, useState } from 'react';
import { BATCH_MAX, BATCH_MIN } from '@meal-prep/shared';
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
// The thresholds are fractions of the sheet's height rather than pixels, so a short Recipe and a
// long one close at the same point of the pull. The choices, which the spec left to this ticket:
// a pull past 30% of the height closes; so does a flick, a pull faster than 0.6px/ms that has
// covered at least 15%, because a quick short pull is how a phone is told to dismiss anything.
// A flick is read off the last move, so a finger that stops and rests before lifting has stopped
// flicking. Anything less snaps back. The one pixel constant is the slop: a finger has to move
// 8px before a touch is a drag at all, roughly what a browser allows a tap, so a tap on a button
// stays a tap.
const CLOSE_FRACTION = 0.3;
const FLICK_VELOCITY = 0.6;
const FLICK_MIN_FRACTION = 0.15;
const FLICK_STALE_MS = 100;
const DRAG_SLOP_PX = 8;
const SNAP_BACK_MS = 250;
// The close is the slide-up in reverse, on the same curve as `slideUp` in styles.css but in half the
// time, and the dim behind the sheet fades with it. On a phone, a sheet that has gone while the
// dim is still there for even a moment reads as the app hanging on the way out.
const CLOSE_MS = 200;
const CLOSE_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';
const AT_REST = 'translateY(0)';

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
    let drag = null;

    const snapBack = () => {
      sheet.style.transition = `transform ${SNAP_BACK_MS}ms ease-out`;
      sheet.style.transform = AT_REST;
    };

    const onStart = (event) => {
      // The drag takes over only with the content at the top. Scrolled down, the finger is scrolling
      // the list, and the browser keeps it; once the list is back at the top, the next pull is this.
      if (drag?.closing || event.touches.length !== 1 || sheet.scrollTop > 0) return;
      const { clientY } = event.touches[0];
      drag = { startY: clientY, lastY: clientY, lastTime: event.timeStamp, velocity: 0, dragging: false, closing: false };
    };

    const onMove = (event) => {
      if (!drag || drag.closing) return;
      const { clientY } = event.touches[0];
      const travelled = clientY - drag.startY;
      if (!drag.dragging) {
        // Upward, or not yet past the slop: not a drag. Left to the browser, which may scroll.
        if (travelled < DRAG_SLOP_PX) return;
        // Checked again here, not only at touchstart: a finger that went up first has scrolled
        // the list in the meantime, and the browser owns a touch it has begun scrolling with
        // (the event is no longer cancelable). Either way this touch is the list's, not the sheet's.
        if (sheet.scrollTop > 0 || !event.cancelable) {
          drag = null;
          return;
        }
        drag.dragging = true;
        sheet.style.transition = 'none';
        // The slide-up may still be running; while it is, its transform wins over the finger's.
        sheet.style.animation = 'none';
      }
      event.preventDefault();
      drag.velocity = (clientY - drag.lastY) / Math.max(1, event.timeStamp - drag.lastTime);
      drag.lastY = clientY;
      drag.lastTime = event.timeStamp;
      // Clamped at the rest position: the sheet follows the finger down and no further up.
      sheet.style.transform = `translateY(${Math.max(0, travelled)}px)`;
    };

    const onEnd = (event) => {
      if (!drag || drag.closing) return;
      const state = drag;
      if (!state.dragging) {
        drag = null;
        return;
      }
      // A lifted finger synthesizes a click at where it lifted. After a drag that is never what
      // was meant, and a snap-back that pressed the button under the finger would be a gesture
      // eating a tap.
      event.preventDefault();

      const height = sheet.getBoundingClientRect().height;
      const travelled = Math.max(0, state.lastY - state.startY);
      const stillMoving = event.timeStamp - state.lastTime < FLICK_STALE_MS;
      const flicked =
        stillMoving && state.velocity >= FLICK_VELOCITY && travelled >= height * FLICK_MIN_FRACTION;
      if (travelled < height * CLOSE_FRACTION && !flicked) {
        snapBack();
        drag = null;
        return;
      }

      // Slide the rest of the way, then close through the same path as a tap on the overlay, so
      // the overlay, focus and state all go the one way they know how to. The timer is for a
      // transitionend that never arrives, which a sheet unmounted for another reason produces.
      state.closing = true;
      let closed = false;
      const finish = (transition) => {
        // Only the sheet's own transform ending: a child's transition bubbles up here too.
        if (transition && (transition.target !== sheet || transition.propertyName !== 'transform')) return;
        if (closed) return;
        closed = true;
        sheet.removeEventListener('transitionend', finish);
        closeRef.current();
      };
      sheet.addEventListener('transitionend', finish);
      setTimeout(finish, CLOSE_MS + 50);
      sheet.style.transition = `transform ${CLOSE_MS}ms ${CLOSE_EASING}, opacity ${CLOSE_MS}ms ${CLOSE_EASING}`;
      sheet.style.transform = 'translateY(100%)';
      sheet.style.opacity = '0';
      // The overlay is the parent, and it is what a person sees as the darkened page.
      const overlay = sheet.parentElement;
      if (overlay) {
        overlay.style.transition = `opacity ${CLOSE_MS}ms ${CLOSE_EASING}`;
        overlay.style.opacity = '0';
      }
    };

    const onCancel = () => {
      if (!drag || drag.closing) return;
      if (drag.dragging) snapBack();
      drag = null;
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

/**
 * The Batch: how many times the Recipe is being made, from 1 to 9. Bounded by the same numbers the
 * API refuses, imported rather than written here, so the button that stops going up and the request
 * that would be refused agree.
 *
 * A stepper rather than a number box, because this is set on a phone with one thumb while the other
 * hand holds a pan, and because a box that can hold "12" would have to explain why it cannot.
 */
function BatchStepper({ batch, readOnly, onChange }) {
  const step = (to) => (
    <button
      className="batch-step"
      type="button"
      disabled={readOnly || to < BATCH_MIN || to > BATCH_MAX}
      // Named for what it does to the shop rather than for the arithmetic: "increase" says nothing
      // to a cook who has not seen the number.
      aria-label={to > batch ? 'Make one more batch' : 'Make one fewer batch'}
      onClick={() => onChange(to)}
    >
      {to > batch ? '+' : '\u2212'}
    </button>
  );

  return (
    <div className="batch-stepper" role="group" aria-label="Batch">
      {step(batch - 1)}
      {/* Announced on change rather than silently, because the two buttons around it say what they
          do and not what happened. */}
      <span className="batch-count" role="status">{`${batch}\u00d7`}</span>
      {step(batch + 1)}
    </div>
  );
}

const dangerButtonStyle = {
  flex: 1,
  justifyContent: 'center',
  background: '#F7E9E6',
  color: '#C26A5A',
  border: 'none',
};

export function RecipeDetail({ recipe, readOnly, onClose, onToggleSelected, onSetBatch, onEdit, onDelete }) {
  const { ingredients } = recipe;
  // Absent only for a Recipe read from a cache written before Steps existed, the same case
  // `storedBatch` guards against below.
  const steps = recipe.steps ?? [];
  // Deleting is the one thing here nothing undoes, so it asks. In place rather than through the
  // browser's confirm dialog, which a phone renders as a modal on top of a modal.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Made once unless the Recipe says otherwise. The fallback is for the cache: a first paint
  // restored from one written before Batch existed hands this component a Recipe with no Batch on
  // it, and a stepper reading "undefined" for the moment before the reload lands is worse than one
  // reading the number every such Recipe means.
  const storedBatch = recipe.batch ?? BATCH_MIN;
  // The Batch of a Recipe that is not on the Shopping List yet, which nothing has stored anywhere:
  // it is what Add will send. Once the Recipe is selected the stored Batch is the only truth, so
  // this stops being read - which is what makes a failed write revert on screen, since the revert
  // happens in the Recipe rather than here.
  const [draftBatch, setDraftBatch] = useState(storedBatch);
  const batch = recipe.selected ? storedBatch : draftBatch;
  // Selected, and the write goes now: the Shopping List is wrong until it lands, and a cook who
  // stepped from two to three has already said what they meant. Not selected, and there is nothing
  // to write to yet, so the number waits for Add.
  const changeBatch = (next) => (recipe.selected ? onSetBatch(recipe, next) : setDraftBatch(next));
  // Removing takes the Batch back to 1 here as well as on the server, which resets it in the same
  // statement that deselects. The sheet usually closes on this, so it is what a cook sees when they
  // open the Recipe again rather than a moment later.
  const toggleSelected = () => {
    if (recipe.selected) setDraftBatch(BATCH_MIN);
    onToggleSelected(recipe, batch);
  };
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
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, marginBottom: 6 }}>{recipe.name}</h2>
          <span className="badge" style={{ background: getTypeBadge(recipe.type).bg, color: getTypeBadge(recipe.type).text }}>{recipe.type}</span>
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
        {/* The Card sits on this heading rather than the title block: this is where it is the
            fallback anyway, and one place for it beats it appearing twice. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#7A7568', letterSpacing: 0.5 }}>INSTRUCTIONS</h3>
          {recipe.cardUrl && (
            <a href={recipe.cardUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#5B7C5A', fontWeight: 600, fontSize: 14, textDecoration: 'none', padding: '8px 14px', background: '#E8F0E7', borderRadius: 10 }}>
              Recipe {I.external}
            </a>
          )}
        </div>
        {steps.length > 0 ? (
          <ol role="list" style={{ background: '#F5EDE3', borderRadius: 14, padding: 16, marginBottom: 20, listStyle: 'none' }}>
            {steps.map((step, i) => (
              <li
                key={i}
                role="listitem"
                style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < steps.length - 1 ? '1px solid #E5DED3' : 'none' }}
              >
                <span style={{ fontWeight: 700, color: '#5B7C5A', flexShrink: 0 }}>{i + 1}</span>
                <span style={{ fontSize: 15 }}>{step}</span>
              </li>
            ))}
          </ol>
        ) : recipe.cardUrl ? (
          <p style={{ color: '#7A7568', fontSize: 14, marginBottom: 20 }}>No Steps yet. Cook from the Recipe Card above.</p>
        ) : (
          <p style={{ color: '#7A7568', fontSize: 14, marginBottom: 20 }}>No instructions yet.</p>
        )}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <BatchStepper batch={batch} readOnly={readOnly} onChange={changeBatch} />
        </div>
        <button
          className="btn-primary"
          style={{ width: '100%', justifyContent: 'center' }}
          disabled={readOnly}
          onClick={toggleSelected}
        >
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
