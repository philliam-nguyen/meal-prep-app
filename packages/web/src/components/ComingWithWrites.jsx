// Every write still points at the spreadsheet the database is replacing, and the Shopping List and
// Best Matches are derivations that have not moved into SQL yet. The pages that depend on either
// say so plainly rather than rendering controls that cannot save.

export function ComingWithWrites({ children }) {
  return (
    <div className="empty-state fade-in">
      <p>{children}</p>
      <p style={{ fontSize: 13, color: '#A39E93' }}>Browsing your recipes came first.</p>
    </div>
  );
}
