import { ageInMonths, INDICATOR_LABEL, INDICATOR_UNIT, MAX_MONTHS, REFERENCE_Z, referenceCurve, type Indicator, type Sex } from '../lib/growth';
import type { Measurement } from '../lib/types';

export const measurementValue = (m: Measurement, indicator: Indicator): number | null =>
  indicator === 'weight' ? (m.weightG != null ? m.weightG / 1000 : null) : indicator === 'length' ? (m.lengthMm != null ? m.lengthMm / 10 : null) : m.headMm != null ? m.headMm / 10 : null;

interface Props {
  indicator: Indicator;
  sex: Sex;
  birthDate: string;
  measurements: Measurement[];
  /** Âge actuel en mois, pour cadrer le graphique même sans mesure récente. */
  nowMonths: number;
}

const W = 340;
const H = 230;
const PAD = { l: 34, r: 30, t: 12, b: 26 };

/** Courbe de croissance : bandes OMS (3e–97e, 15e–85e), médiane, et les mesures de bébé reliées. */
export function GrowthChart({ indicator, sex, birthDate, measurements, nowMonths }: Props) {
  const points = measurements
    .map((m) => ({ x: ageInMonths(birthDate, m.measuredOn), y: measurementValue(m, indicator) }))
    .filter((p): p is { x: number; y: number } => p.y !== null && p.x >= 0 && p.x <= MAX_MONTHS);

  const lastX = Math.max(nowMonths, ...points.map((p) => p.x), 0);
  const xMax = Math.min(MAX_MONTHS, Math.max(3, Math.ceil(lastX + 1)));
  const p3 = referenceCurve(indicator, sex, REFERENCE_Z.p3, 0, xMax);
  const p15 = referenceCurve(indicator, sex, REFERENCE_Z.p15, 0, xMax);
  const p50 = referenceCurve(indicator, sex, REFERENCE_Z.p50, 0, xMax);
  const p85 = referenceCurve(indicator, sex, REFERENCE_Z.p85, 0, xMax);
  const p97 = referenceCurve(indicator, sex, REFERENCE_Z.p97, 0, xMax);

  const ys = [...p3.map((p) => p[1]), ...p97.map((p) => p[1]), ...points.map((p) => p.y)];
  const step = indicator === 'weight' ? 1 : 2;
  const yMin = Math.floor(Math.min(...ys) / step) * step;
  const yMax = Math.ceil(Math.max(...ys) / step) * step;

  const sx = (x: number) => PAD.l + (x / xMax) * (W - PAD.l - PAD.r);
  const sy = (y: number) => H - PAD.b - ((y - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
  const line = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join('');
  const band = (lo: [number, number][], hi: [number, number][]) => `${line(hi)}${[...lo].reverse().map(([x, y]) => `L${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join('')}Z`;

  const xStep = xMax <= 6 ? 1 : xMax <= 12 ? 2 : 3;
  const xTicks = Array.from({ length: Math.floor(xMax / xStep) + 1 }, (_, i) => i * xStep);
  const yStepTick = (yMax - yMin) / step > 8 ? step * 2 : step;
  const yTicks: number[] = [];
  for (let y = yMin; y <= yMax + 1e-9; y += yStepTick) yTicks.push(y);

  const unit = INDICATOR_UNIT[indicator];
  const label = `${INDICATOR_LABEL[indicator]} (${unit}) selon l'âge, courbes de référence OMS ${sex === 'f' ? 'fille' : 'garçon'}`;

  return (
    <svg className="growth-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <path d={band(p3, p97)} className="g-band-outer" />
      <path d={band(p15, p85)} className="g-band-inner" />
      <path d={line(p50)} className="g-median" />
      {yTicks.map((y) => (
        <g key={`y${y}`}>
          <line x1={PAD.l} x2={W - PAD.r} y1={sy(y)} y2={sy(y)} className="g-grid" />
          <text x={PAD.l - 6} y={sy(y) + 4} className="g-tick" textAnchor="end">
            {y}
          </text>
        </g>
      ))}
      {xTicks.map((x) => (
        <text key={`x${x}`} x={sx(x)} y={H - 8} className="g-tick" textAnchor="middle">
          {x === 0 ? '0' : `${x} m`}
        </text>
      ))}
      {[
        ['97e', p97],
        ['50e', p50],
        ['3e', p3],
      ].map(([name, curve]) => {
        const last = (curve as [number, number][]).at(-1)!;
        return (
          <text key={name as string} x={sx(last[0]) + 4} y={sy(last[1]) + 4} className="g-label">
            {name as string}
          </text>
        );
      })}
      {points.length > 1 && <path d={line(points.map((p) => [p.x, p.y]))} className="g-baby-line" />}
      {points.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={4.5} className="g-baby-point" />
      ))}
    </svg>
  );
}
