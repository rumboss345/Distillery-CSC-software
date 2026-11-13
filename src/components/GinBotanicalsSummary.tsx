import { botanicalHasMeasure, formatGinBotanicalLineCompact } from '../lib/gin-botanicals';
import type { GinBotanicalInput } from '../types';

const OPEN_BY_DEFAULT_MAX = 4;

export function GinBotanicalsSummary({
  lines,
  className,
}: {
  lines: GinBotanicalInput[];
  className?: string;
}) {
  const active = lines.filter(botanicalHasMeasure);
  if (active.length === 0) return null;

  const title = active.length === 1 ? '1 botanical' : `${active.length} botanicals`;
  const openByDefault = active.length <= OPEN_BY_DEFAULT_MAX;

  return (
    <details className={['gin-botanicals-summary', className].filter(Boolean).join(' ')} open={openByDefault}>
      <summary className="gin-botanicals-summary-toggle">{title}</summary>
      <ul className="gin-botanicals-summary-list">
        {active.map((line, index) => (
          <li key={`${line.name}-${index}`}>{formatGinBotanicalLineCompact(line)}</li>
        ))}
      </ul>
    </details>
  );
}
