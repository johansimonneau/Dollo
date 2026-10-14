import type { ReactNode, SVGProps } from 'react';
import type { EventKind } from '../lib/types';

function Svg({ children, size = 24, ...rest }: SVGProps<SVGSVGElement> & { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

type P = { size?: number };

export const Icon = {
  /** Température : un thermomètre. */
  Thermo: (p: P) => (
    <Svg {...p}>
      <path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z" />
      <path d="M12 9v7" />
    </Svg>
  ),
  /** Tire-lait : une goutte. */
  Drop: (p: P) => (
    <Svg {...p}>
      <path d="M12 3.5c3 3.6 6 7 6 10.5a6 6 0 0 1-12 0c0-3.5 3-6.9 6-10.5z" />
    </Svg>
  ),
  /** Médicament : une gélule. */
  Pill: (p: P) => (
    <Svg {...p}>
      <rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)" />
      <path d="m8.5 8.5 7 7" />
    </Svg>
  ),
  /** Tétée : un cœur (soin, lien). */
  Breast: (p: P) => (
    <Svg {...p}>
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
    </Svg>
  ),
  Bottle: (p: P) => (
    <Svg {...p}>
      <path d="M10 2.5h4v2h-4z" />
      <path d="M9 4.5h6l1 3.2V19a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V7.7z" />
      <path d="M8 12h3M8 15.5h3" />
    </Svg>
  ),
  Diaper: (p: P) => (
    <Svg {...p}>
      <path d="M3 6h18v5c0 4-3 7.2-6 8l-3-3-3 3c-3-.8-6-4-6-8z" />
      <path d="M3 11h4M17 11h4" />
    </Svg>
  ),
  Moon: (p: P) => (
    <Svg {...p}>
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    </Svg>
  ),
  Sun: (p: P) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Svg>
  ),
  Home: (p: P) => (
    <Svg {...p}>
      <path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </Svg>
  ),
  List: (p: P) => (
    <Svg {...p}>
      <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </Svg>
  ),
  Chart: (p: P) => (
    <Svg {...p}>
      <path d="M5 20v-9M12 20V4M19 20v-6" />
    </Svg>
  ),
  Settings: (p: P) => (
    <Svg {...p}>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </Svg>
  ),
  Plus: (p: P) => (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  Close: (p: P) => (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  ),
  Check: (p: P) => (
    <Svg {...p}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  ),
  ChevronLeft: (p: P) => (
    <Svg {...p}>
      <path d="M15 5l-7 7 7 7" />
    </Svg>
  ),
  ChevronRight: (p: P) => (
    <Svg {...p}>
      <path d="M9 5l7 7-7 7" />
    </Svg>
  ),
  Copy: (p: P) => (
    <Svg {...p}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h8" />
    </Svg>
  ),
  Stop: (p: P) => (
    <Svg {...p}>
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
    </Svg>
  ),
};

/** Icône de chaque type d'événement. */
export const KIND_ICON: Record<EventKind, (p: P) => ReturnType<typeof Icon.Breast>> = {
  breast: Icon.Breast,
  bottle: Icon.Bottle,
  diaper: Icon.Diaper,
  sleep: Icon.Moon,
  temp: Icon.Thermo,
  med: Icon.Pill,
  pump: Icon.Drop,
};
