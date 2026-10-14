import { useEffect, useState } from 'react';
import { chromeIntentUrl, detectPlatform, isIosSafari, type Platform } from './install';

const APP_URL = '/?app';

const AppleLogo = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M16.37 12.77c-.02-2.25 1.84-3.33 1.92-3.38-1.05-1.53-2.68-1.74-3.26-1.76-1.39-.14-2.71.82-3.42.82-.7 0-1.79-.8-2.94-.78-1.51.02-2.91.88-3.69 2.24-1.57 2.73-.4 6.77 1.13 8.98.75 1.08 1.64 2.3 2.81 2.25 1.13-.05 1.55-.73 2.92-.73 1.36 0 1.75.73 2.94.71 1.21-.02 1.98-1.1 2.72-2.19.86-1.25 1.21-2.47 1.23-2.53-.03-.01-2.36-.9-2.36-3.63zM14.14 6.16c.62-.76 1.04-1.8.93-2.85-.9.04-1.99.6-2.63 1.35-.58.66-1.08 1.73-.95 2.75 1 .08 2.03-.51 2.65-1.25z" />
  </svg>
);

const AndroidLogo = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M17.6 9.48 19.44 6.3a.38.38 0 0 0-.66-.38l-1.87 3.23A11.4 11.4 0 0 0 12 8.12c-1.75 0-3.4.38-4.9 1.03L5.22 5.92a.38.38 0 0 0-.66.38L6.4 9.48C3.2 11.22 1.03 14.47.68 18.25h22.64c-.35-3.78-2.52-7.03-5.72-8.77zM6.97 15.33a.95.95 0 1 1 0-1.9.95.95 0 0 1 0 1.9zm10.06 0a.95.95 0 1 1 0-1.9.95.95 0 0 1 0 1.9z" />
  </svg>
);

/** Icône « Partager » d'iOS (carré, flèche vers le haut), pour que le geste soit reconnaissable. */
const ShareGlyph = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v12M8 7l4-4 4 4" />
    <path d="M7 10H5v11h14V10h-2" />
  </svg>
);

const AddGlyph = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <path d="M12 8v8M8 12h8" />
  </svg>
);

interface Env {
  platform: Platform;
  iosSafari: boolean;
}

function readEnv(): Env {
  if (typeof navigator === 'undefined') return { platform: 'desktop', iosSafari: false };
  return { platform: detectPlatform(navigator.userAgent, navigator.maxTouchPoints), iosSafari: isIosSafari(navigator.userAgent) };
}

interface Props {
  canPrompt: boolean;
  installed: boolean;
  install: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  /** Couleur des boutons sur fond coloré (appel final). */
  light?: boolean;
  /** Barre collée : un seul bouton, celui de l'appareil détecté. */
  compact?: boolean;
}

/**
 * Deux boutons, iPhone et Android. Android : installation native en un tap quand Chrome la propose.
 * iPhone : Apple n'autorise pas l'installation automatique hors App Store, on montre le geste en 3 étapes.
 */
export function InstallButtons({ canPrompt, installed, install, light, compact }: Props) {
  const [env, setEnv] = useState<Env>({ platform: 'desktop', iosSafari: false });
  const [open, setOpen] = useState<'ios' | 'android' | null>(null);
  useEffect(() => setEnv(readEnv()), []);

  if (installed) {
    return (
      <a className={`lp-btn ${light ? 'light' : 'primary'}`} href={APP_URL}>
        Ouvrir Dollo
      </a>
    );
  }

  const android = async () => {
    if (canPrompt && (await install()) !== 'unavailable') return;
    setOpen('android');
  };

  const ios = (
    <button key="ios" type="button" className={`lp-btn store ${light ? 'light' : env.platform === 'ios' ? 'primary' : 'dark'}`} onClick={() => setOpen('ios')}>
      <AppleLogo />
      <span>
        <small>Installer sur</small>
        iPhone
      </span>
    </button>
  );
  const droid = (
    <button key="android" type="button" className={`lp-btn store ${light ? 'light' : env.platform === 'android' ? 'primary' : 'dark'}`} onClick={() => void android()}>
      <AndroidLogo />
      <span>
        <small>Installer sur</small>
        Android
      </span>
    </button>
  );
  // L'appareil détecté en premier ; la barre collée n'en garde qu'un.
  const buttons = env.platform === 'android' ? [droid, ios] : [ios, droid];
  const shown = compact && env.platform !== 'desktop' ? buttons.slice(0, 1) : buttons;

  return (
    <>
      {shown}
      {open && <InstallSheet kind={open} env={env} onClose={() => setOpen(null)} />}
    </>
  );
}

function InstallSheet({ kind, env, onClose }: { kind: 'ios' | 'android'; env: Env; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? `${window.location.origin}/?landing` : '';
  const elsewhere = kind === 'ios' ? env.platform !== 'ios' : env.platform !== 'android';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Dollo', url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      }
    } catch {
      /* partage annulé */
    }
  };

  return (
    <div className="lp-modal" role="presentation" onClick={onClose}>
      <div className="lp-modal-card" role="dialog" aria-modal="true" aria-labelledby="install-title" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="lp-modal-close" aria-label="Fermer" onClick={onClose}>
          ×
        </button>
        <h2 id="install-title">{kind === 'ios' ? 'Installer sur iPhone' : 'Installer sur Android'}</h2>

        {elsewhere ? (
          <>
            <p className="lp-lead small">
              Ouvre cette page sur ton {kind === 'ios' ? 'iPhone (dans Safari)' : 'téléphone Android (dans Chrome)'} : l’installation se fait depuis le
              téléphone.
            </p>
            <button type="button" className="lp-btn primary" onClick={() => void copy()}>
              {copied ? 'Lien copié ✓' : 'Envoyer le lien sur mon téléphone'}
            </button>
          </>
        ) : kind === 'ios' ? (
          <>
            {!env.iosSafari && (
              <p className="lp-warn">
                <b>Ouvre d’abord cette page dans Safari</b> : copie le lien, puis colle-le dans Safari.{' '}
                <button type="button" className="lp-link" onClick={() => void navigator.clipboard?.writeText(url).then(() => setCopied(true))}>
                  {copied ? 'Lien copié ✓' : 'Copier le lien'}
                </button>
              </p>
            )}
            <ol className="lp-steps-big">
              <li>
                <span className="lp-step-icon">
                  <ShareGlyph />
                </span>
                <span>
                  Touche <b>Partager</b>, en bas de l’écran
                </span>
              </li>
              <li>
                <span className="lp-step-icon">
                  <AddGlyph />
                </span>
                <span>
                  Choisis <b>« Sur l’écran d’accueil »</b> (fais défiler si besoin)
                </span>
              </li>
              <li>
                <span className="lp-step-icon">
                  <b>OK</b>
                </span>
                <span>
                  Touche <b>« Ajouter »</b> : l’icône Dollo est sur ton écran
                </span>
              </li>
            </ol>
            <p className="lp-note">Apple n’autorise pas l’installation automatique hors App Store : ces 3 gestes la remplacent.</p>
          </>
        ) : (
          <>
            <p className="lp-lead small">Ton navigateur ne propose pas l’installation directe. Deux façons de faire :</p>
            <a className="lp-btn primary" href={chromeIntentUrl(url)}>
              Ouvrir dans Chrome
            </a>
            <ol className="lp-steps-big">
              <li>
                <span className="lp-step-icon">
                  <b>⋮</b>
                </span>
                <span>
                  Dans Chrome, touche le menu <b>⋮</b> en haut à droite
                </span>
              </li>
              <li>
                <span className="lp-step-icon">
                  <AddGlyph />
                </span>
                <span>
                  Choisis <b>« Installer l’application »</b> (ou « Ajouter à l’écran d’accueil »)
                </span>
              </li>
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
