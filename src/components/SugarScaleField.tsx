import { useEffect, useRef, useState } from 'react';
import {
  brixFromFermentationReading,
  fermentationReadingError,
  formatFermentationReading,
  type FermentationSugarScale,
} from '../lib/fermentation';

/**
 * Brix or specific gravity entry. The parent always stores Brix.
 * Switching scales formats that stored Brix instead of re-parsing the text.
 */
export function SugarScaleField({
  label,
  brix,
  onBrix,
  onError,
  requirePositive = false,
  required = false,
  hint,
  inputId,
}: {
  label: string;
  brix: number | null;
  onBrix: (brix: number | null) => void;
  onError?: (error: string | null) => void;
  /** Start readings must convert to a Brix above zero. */
  requirePositive?: boolean;
  required?: boolean;
  hint?: string;
  inputId?: string;
}) {
  const [scale, setScale] = useState<FermentationSugarScale>('brix');
  const [text, setText] = useState(() => (brix == null ? '' : formatFermentationReading('brix', brix)));
  const focused = useRef(false);

  useEffect(() => {
    if (focused.current) return;
    setText(brix == null ? '' : formatFermentationReading(scale, brix));
  }, [brix, scale]);

  const error = fermentationReadingError(scale, text, { requirePositive });
  const savedBrix = brixFromFermentationReading(scale, text);
  const conversion = savedBrix == null
    ? ''
    : scale === 'gravity'
      ? `Saves as ${savedBrix.toFixed(1)}° Brix.`
      : `Specific gravity ${formatFermentationReading('gravity', savedBrix)}.`;

  const switchScale = (next: FermentationSugarScale) => {
    if (next === scale) return;
    setScale(next);
    setText(brix == null ? '' : formatFermentationReading(next, brix));
    onError?.(fermentationReadingError(next, brix == null ? '' : formatFermentationReading(next, brix), { requirePositive }));
  };

  return (
    <div className="form-group sugar-scale-field">
      <label htmlFor={inputId}>{label}{required ? ' *' : ''}</label>
      <input
        id={inputId}
        value={text}
        inputMode="decimal"
        placeholder={scale === 'gravity' ? '1.050' : '12.0'}
        aria-invalid={error ? true : undefined}
        required={required}
        onFocus={() => { focused.current = true; }}
        onBlur={() => {
          focused.current = false;
          if (brix != null && error == null) setText(formatFermentationReading(scale, brix));
        }}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          const nextError = fermentationReadingError(scale, next, { requirePositive });
          onError?.(nextError);
          if (!next.trim() || nextError) onBrix(null);
          else onBrix(brixFromFermentationReading(scale, next));
        }}
      />
      <div className="measure-mode-buttons sugar-scale-buttons">
        <button
          type="button"
          className={`btn btn-sm ${scale === 'brix' ? 'btn-primary' : 'btn-secondary'}`}
          aria-pressed={scale === 'brix'}
          onClick={() => switchScale('brix')}
        >
          Brix
        </button>
        <button
          type="button"
          className={`btn btn-sm ${scale === 'gravity' ? 'btn-primary' : 'btn-secondary'}`}
          aria-pressed={scale === 'gravity'}
          onClick={() => switchScale('gravity')}
        >
          Gravity
        </button>
      </div>
      {(error || conversion || hint) && (
        <p className="field-hint" style={error ? { color: 'var(--danger, #dc2626)' } : undefined}>
          {error || conversion}
          {hint ? `${error || conversion ? ' ' : ''}${hint}` : ''}
        </p>
      )}
    </div>
  );
}
