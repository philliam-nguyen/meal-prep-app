// The Aisle picker: a native select listing every managed Aisle plus a clear option, standing in
// for the free-text box this replaced now that an Ingredient's Aisle is a reference rather than a
// spelling a cook typed. A native select rather than anything fancier, because a cook standing in
// the aisle wants one tap and a list, not a box to type into.
//
// Shared by the Shopping List entry and the Settings bulk view, which is the one way to file an
// Ingredient the spec asks for rather than two controls that could drift apart. `entry` is either
// shape - a Shopping List entry or an Ingredient from the bulk view - since both carry a `name` and
// an `aisleId` and that is all this reads.
//
// The selected option is the label: closed, it reads the Aisle's name, or "Set aisle" where there
// is none. Setting one for the first time and correcting one that is wrong are the same act through
// the same control, the way the free-text box worked before it - the clear option is always on
// offer, not only for an already-unassigned entry.
//
// The dashed underline is the mock's "this still needs sorting" mark (mock decision 4): it reads
// off whether the entry itself has an Aisle, not which group it happens to render in, so it marks
// an unfiled Ingredient the same way in the Shopping List and the Settings bulk view.

export function AisleField({ entry, aisles, readOnly, onSetAisle }) {
  const unassigned = entry.aisleId == null;
  return (
    <select
      className="aisle-picker"
      style={{
        display: 'block', marginTop: 4, padding: '2px 20px 2px 0', fontSize: 12, color: '#A39E93',
        background: 'none', border: 'none', borderBottom: unassigned ? '1px dashed #C9C2B4' : 'none',
        fontFamily: 'inherit', cursor: readOnly ? 'not-allowed' : 'pointer',
      }}
      value={entry.aisleId ?? ''}
      disabled={readOnly}
      aria-label={`Aisle for ${entry.name}`}
      onChange={event => onSetAisle(entry, event.target.value || null)}
    >
      <option value="">Set aisle</option>
      {aisles.map(aisle => (
        <option key={aisle.id} value={aisle.id}>{aisle.name}</option>
      ))}
    </select>
  );
}
