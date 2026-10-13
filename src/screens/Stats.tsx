import { BarChart, type Bar } from '../components/BarChart';
import { dailySeries } from '../lib/summary';
import { fmtDayLabel, fmtDuration, fmtWeekdayShort, HOUR } from '../lib/time';
import type { BabyEvent } from '../lib/types';

const DAYS = 7;

interface Props {
  events: BabyEvent[];
  now: number;
}

export function Stats({ events, now }: Props) {
  const series = dailySeries(events, DAYS, now);
  const todayKey = series[series.length - 1].key;
  // Moyennes sur les jours complets qui contiennent des données (aujourd'hui est partiel, donc exclu).
  const complete = series.slice(0, -1).filter((d) => d.summary.breastCount + d.summary.bottleCount + d.summary.diaperCount + d.summary.sleepCount > 0);
  const avg = (pick: (s: (typeof series)[number]['summary']) => number) =>
    complete.length ? complete.reduce((sum, d) => sum + pick(d.summary), 0) / complete.length : null;

  const sleepAvg = avg((s) => s.sleepMs);
  const feedAvg = avg((s) => s.breastCount + s.bottleCount);
  const diaperAvg = avg((s) => s.diaperCount);

  const base = (d: (typeof series)[number]) => ({
    key: d.key,
    label: fmtWeekdayShort(d.key),
    isToday: d.key === todayKey,
  });

  const sleepBars: Bar[] = series.map((d) => ({
    ...base(d),
    title: `${fmtDayLabel(d.key, now)} : ${fmtDuration(d.summary.sleepMs)} de sommeil`,
    valueLabel: `${Math.round(d.summary.sleepMs / HOUR)} h`,
    parts: [{ value: d.summary.sleepMs, tone: 'sleep' }],
  }));

  const feedBars: Bar[] = series.map((d) => ({
    ...base(d),
    title: `${fmtDayLabel(d.key, now)} : ${d.summary.breastCount} tétées, ${d.summary.bottleCount} biberons`,
    valueLabel: String(d.summary.breastCount + d.summary.bottleCount),
    parts: [
      { value: d.summary.breastCount, tone: 'breast' },
      { value: d.summary.bottleCount, tone: 'bottle' },
    ],
  }));

  const diaperBars: Bar[] = series.map((d) => ({
    ...base(d),
    title: `${fmtDayLabel(d.key, now)} : ${d.summary.diaperCount} couches (${d.summary.pee} pipi, ${d.summary.poop} caca)`,
    valueLabel: String(d.summary.diaperCount),
    parts: [
      { value: d.summary.pee, tone: 'pee' },
      { value: d.summary.poop, tone: 'poop' },
    ],
  }));

  const empty = series.every((d) => d.summary.breastCount + d.summary.bottleCount + d.summary.diaperCount + d.summary.sleepCount === 0);

  if (empty) {
    return (
      <div className="screen">
        <div className="empty-state">
          <p>Les statistiques apparaîtront dès les premiers événements notés.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <p className="hint">7 derniers jours. Les moyennes excluent aujourd'hui (journée en cours).</p>

      <section className="card" aria-label="Sommeil">
        <header className="card-head kind-sleep">
          <h2>Sommeil</h2>
          <p>{sleepAvg === null ? '—' : `${fmtDuration(sleepAvg)} / jour en moyenne`}</p>
        </header>
        <BarChart bars={sleepBars} caption="Heures de sommeil par jour" />
      </section>

      <section className="card" aria-label="Repas">
        <header className="card-head kind-breast">
          <h2>Repas</h2>
          <p>{feedAvg === null ? '—' : `${feedAvg.toFixed(1).replace('.', ',')} / jour en moyenne`}</p>
        </header>
        <BarChart bars={feedBars} caption="Tétées et biberons par jour" />
        <Legend items={[['breast', 'Tétées'], ['bottle', 'Biberons']]} />
      </section>

      <section className="card" aria-label="Couches">
        <header className="card-head kind-diaper">
          <h2>Couches</h2>
          <p>{diaperAvg === null ? '—' : `${diaperAvg.toFixed(1).replace('.', ',')} / jour en moyenne`}</p>
        </header>
        <BarChart bars={diaperBars} caption="Couches par jour" />
        <Legend items={[['pee', 'Pipi'], ['poop', 'Caca']]} />
      </section>
    </div>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <p className="legend">
      {items.map(([tone, label]) => (
        <span key={tone}>
          <i className={`swatch tone-${tone}`} aria-hidden="true" /> {label}
        </span>
      ))}
    </p>
  );
}
