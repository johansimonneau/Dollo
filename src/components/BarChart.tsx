export interface Bar {
  key: string;
  /** Initiale du jour. */
  label: string;
  /** Texte lu par les lecteurs d'écran et affiché au survol. */
  title: string;
  /** Valeur affichée au-dessus de la barre. */
  valueLabel: string;
  parts: { value: number; tone: 'sleep' | 'breast' | 'bottle' | 'pee' | 'poop' }[];
  isToday?: boolean;
}

export function BarChart({ bars, caption }: { bars: Bar[]; caption: string }) {
  const totals = bars.map((b) => b.parts.reduce((sum, p) => sum + p.value, 0));
  const max = Math.max(1, ...totals);
  return (
    <ul className="bars" aria-label={caption}>
      {bars.map((b, i) => (
        <li key={b.key} className={`bar-col${b.isToday ? ' is-today' : ''}`} title={b.title} aria-label={b.title}>
          <span className="bar-value" aria-hidden="true">
            {totals[i] > 0 ? b.valueLabel : ''}
          </span>
          <span className="bar-track" aria-hidden="true">
            <span className="bar-stack" style={{ height: `${(totals[i] / max) * 100}%` }}>
              {b.parts
                .filter((p) => p.value > 0)
                .map((p) => (
                  <span key={p.tone} className={`bar-part tone-${p.tone}`} style={{ flexGrow: p.value }} />
                ))}
            </span>
          </span>
          <span className="bar-label" aria-hidden="true">
            {b.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
