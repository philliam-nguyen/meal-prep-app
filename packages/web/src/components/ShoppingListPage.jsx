import { useState } from 'react';
import { formatAmounts } from '../format.js';
import { groupByAisle } from '../shoppingListViews.js';
import { getTypeBadge } from '../typeBadge.js';
import { I } from '../icons.jsx';
import { AisleField } from './AisleField.jsx';

// The list arrives derived. Nothing here groups Ingredients or adds quantities up: that ran in the
// browser and in a spreadsheet formula at the same time, which is two implementations that could
// disagree about what to buy, and it is one query in SQL now.
//
// What this page does own is the two marks that survive that derivation, because they belong to the
// Ingredient rather than to the row: Got It, and the Aisle it is filed under - and the grouping
// the cook reads the two marks through, which is arithmetic over what already arrived
// (shoppingListViews.js) rather than a fact only the server knows. The Aisle picker itself lives
// in AisleField.jsx, shared with the Settings bulk view.

/**
 * One Selected Recipe, in the area above the list: its name, its Recipe Type badge, a slot for the
 * Batch count once a Recipe is being made more than once, and the remove control. The name
 * truncates rather than wraps, which is what keeps every row the same height and the capped area's
 * height predictable (mock decision 1).
 *
 * The Batch chip only appears above 1, per the approved mock: 1 is every Recipe's Batch until the
 * cook says otherwise, and a column of "1x" chips would spend width the name needs. `recipe.batch`
 * is read defensively - a first paint restored from a cache written before Batch existed hands this
 * a Recipe with none - so a stale cache costs nothing here rather than a chip reading "undefined x".
 */
function SelectedRecipeRow({ recipe, readOnly, onRemove }) {
  const badge = getTypeBadge(recipe.type);
  return (
    <div className="selected-recipe-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #F0EBE3' }}>
      <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {recipe.name}
      </span>
      <span className="badge" style={{ background: badge.bg, color: badge.text, flexShrink: 0 }}>{recipe.type}</span>
      {recipe.batch != null && recipe.batch > 1 && (
        <span className="badge" style={{ background: '#F0EBE3', color: '#5A5548', flexShrink: 0 }}>{recipe.batch}&times;</span>
      )}
      <button
        className="checkbox-btn"
        style={{ borderRadius: 8, color: '#C26A5A' }}
        disabled={readOnly}
        aria-label={`Remove ${recipe.name}`}
        onClick={() => onRemove(recipe)}
      >
        {I.trash}
      </button>
    </div>
  );
}

/**
 * Every Selected Recipe, above the list it feeds - the "why" of the Shopping List, which used to be
 * invisible from this page (story 1). Capped and scrolling inside itself rather than growing with
 * the count, so five Selected Recipes cost the same screen space as two and the Aisle groups below
 * stay in view (mock decision 1).
 *
 * Removing one goes through the same Selected Recipe write the Recipes page uses - `onRemove` is
 * `handleToggleSelected` from App.jsx - so the optimistic update and the failure toast are the ones
 * that already exist rather than a second copy of that rule.
 */
function SelectedRecipesArea({ recipes, readOnly, onRemove }) {
  if (recipes.length === 0) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ background: 'white', borderRadius: 16, padding: '4px 20px', border: '1px solid #F0EBE3', maxHeight: 245, overflowY: 'auto' }}>
        {recipes.map(recipe => (
          <SelectedRecipeRow key={recipe.id} recipe={recipe} readOnly={readOnly} onRemove={onRemove} />
        ))}
      </div>
    </div>
  );
}


/**
 * One Shopping List entry: the tick, the name and its Aisle picker, and the summed amount.
 *
 * Covered replaces the empty box with a house glyph and the word "Covered" - the Ingredient is
 * already on the shelf at home, so there is nothing to tick yet - but the button underneath is
 * still the Got It control: buying more of something already in the Pantry is not forbidden, and a
 * tick there switches the marker to the ordinary check the moment it lands.
 */
function ShoppingItemRow({ entry, aisles, readOnly, onToggleGotIt, onSetAisle }) {
  const covered = entry.covered && !entry.gotIt;
  return (
    <div className={`shopping-item ${entry.gotIt ? 'got-it' : ''} ${covered ? 'covered' : ''}`}>
      {/* The tick lands before the write does. A cook works down an aisle a dozen entries at a
          time, and a failed write puts the entry back rather than leaving a tick that never
          saved. */}
      <button
        className={`checkbox-btn ${entry.gotIt ? 'checked' : ''} ${covered ? 'covered' : ''}`}
        disabled={readOnly}
        onClick={() => onToggleGotIt(entry)}
        aria-label={entry.gotIt ? `Unmark ${entry.name}` : `Mark ${entry.name} as got it`}
      >
        {entry.gotIt ? I.check : covered ? I.home : null}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span className="item-name" style={{ fontWeight: 600, fontSize: 15 }}>{entry.name}</span>
        {covered && <span className="covered-label">Covered</span>}
        <AisleField entry={entry} aisles={aisles} readOnly={readOnly} onSetAisle={onSetAisle} />
      </div>
      <span style={{ color: '#7A7568', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>{formatAmounts(entry.amounts)}</span>
    </div>
  );
}

/**
 * One Aisle's worth of the list: the heading on the page background and one white card underneath
 * it (mock decision 3), matching the card language recipe-card and match-card already use. The
 * heading for the group with no Aisle id says so plainly rather than showing a blank; an Aisle with
 * an empty group never reaches here at all, because groupByAisle already dropped it.
 */
function AisleGroup({ group, aisles, readOnly, onToggleGotIt, onSetAisle }) {
  // The heading text doubles as the group's accessible name: the label on offer to every heading
  // in the app already names what follows it (INGREDIENTS, INSTRUCTIONS), and grouping the card
  // under it with role="group" is what lets a test - or a screen reader - ask "what's under
  // Produce" without depending on DOM position.
  const heading = group.aisleId !== null ? group.name : 'No aisle yet';
  return (
    <div role="group" aria-label={heading} style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: '#7A7568', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' }}>
        {heading}
      </h3>
      <div style={{ background: 'white', borderRadius: 16, padding: '4px 20px', border: '1px solid #F0EBE3' }}>
        {group.entries.map(entry => (
          <ShoppingItemRow
            key={entry.ingredientId}
            entry={entry}
            aisles={aisles}
            readOnly={readOnly}
            onToggleGotIt={onToggleGotIt}
            onSetAisle={onSetAisle}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The end of a trip: every Recipe deselected and every Got It mark cleared, behind one
 * confirmation. It empties the page a cook is standing in front of, and the tap that sends it
 * happens in a car park with a phone in one hand, so it asks first. Asking inline rather than in a
 * dialog, in the position and style the control it replaces stood in.
 */
function DoneShoppingButton({ readOnly, onDoneShopping }) {
  const [asking, setAsking] = useState(false);

  // Read-only never opens the question, so there is no Yes to press that could not be honoured.
  if (!asking || readOnly) {
    return (
      <button className="btn-secondary" disabled={readOnly} onClick={() => setAsking(true)}>
        Done Shopping
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
      <span style={{ fontSize: 13, color: '#7A7568' }}>Clear the list and start fresh?</span>
      <button className="btn-primary" style={{ padding: '8px 18px', fontSize: 14 }} onClick={() => { setAsking(false); onDoneShopping(); }}>
        Yes, I'm done
      </button>
      <button className="btn-secondary" style={{ padding: '8px 18px' }} onClick={() => setAsking(false)}>
        Cancel
      </button>
    </div>
  );
}

export function ShoppingListPage({ shoppingList, recipes, aisles, readOnly, onToggleGotIt, onSetAisle, onDoneShopping, onRemoveRecipe }) {
  // Every Selected Recipe shows here whether or not it left anything on the list below it (a
  // Recipe with no Ingredients yet, say), because the area answers "what is this list built from",
  // not "what is on it" - the list is the other half of that question.
  const selectedRecipes = recipes.filter(recipe => recipe.selected);
  const groups = groupByAisle(shoppingList, aisles);
  // What is left to find in the store: an entry that is Got It or Covered needs no more attention
  // this trip, whichever of the two - or both - is why.
  const remaining = shoppingList.filter(entry => !entry.gotIt && !entry.covered).length;

  return (
    <div className="fade-in">
      <SelectedRecipesArea recipes={selectedRecipes} readOnly={readOnly} onRemove={onRemoveRecipe} />
      {shoppingList.length === 0 ? (
        <div className="empty-state fade-in">
          <span style={{ fontSize: 40 }}>🛒</span>
          <p>Nothing to buy yet. Select a recipe and its ingredients land here.</p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#7A7568' }}>{remaining} ingredient{remaining !== 1 ? 's' : ''} left to buy</span>
          </div>
          {groups.map(group => (
            <AisleGroup
              key={group.aisleId ?? 'unassigned'}
              group={group}
              aisles={aisles}
              readOnly={readOnly}
              onToggleGotIt={onToggleGotIt}
              onSetAisle={onSetAisle}
            />
          ))}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
            <DoneShoppingButton readOnly={readOnly} onDoneShopping={onDoneShopping} />
          </div>
        </>
      )}
    </div>
  );
}
