export function MaterialReconciliationPage() {
  return (
    <section className="card">
      <h2>Material Reconciliation</h2>
      <p className="text-muted">
        Preview cycle counts before posting. Posting creates an explicit Cycle Count Adjustment transaction — inventory is never edited directly.
      </p>
      <p>Use the repository API or purchasing workflow to create reconciliations programmatically. UI posting forms can be extended in a future iteration.</p>
    </section>
  );
}
