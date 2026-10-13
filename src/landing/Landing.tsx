import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../components/icons';
import { detectPlatform, useInstall, type Platform } from './install';
import './landing.css';

const APP_URL = '/?app';

type Kind = 'breast' | 'bottle' | 'diaper' | 'sleep';

const PAINS: { kind: Kind; icon: (p: { size?: number }) => ReactNode; before: string; after: string }[] = [
  {
    kind: 'breast',
    icon: Icon.Breast,
    before: '« C’était quel sein, déjà ? »',
    after: 'Dollo propose le prochain sein, lance le chrono et change de côté en un tap.',
  },
  {
    kind: 'bottle',
    icon: Icon.Bottle,
    before: '« Il a bu combien, vraiment ? »',
    after: 'Tu notes ce que bébé a réellement bu, pas ce que tu avais préparé. Total du jour inclus.',
  },
  {
    kind: 'diaper',
    icon: Icon.Diaper,
    before: '« T’as déjà changé sa couche ? »',
    after: 'L’autre parent voit tout en direct. Plus de doublons, plus d’oublis, plus de SMS à 3 h du matin.',
  },
  {
    kind: 'sleep',
    icon: Icon.List,
    before: '« Mes notes sont dans 4 applis et sur un Post-it. »',
    after: 'Un seul journal, filtrable : « montre-moi tous les biberons », et c’est fait.',
  },
  {
    kind: 'breast',
    icon: Icon.Chart,
    before: '« Le pédiatre : combien de couches par jour ? »',
    after: 'Stats sur 7 jours et export CSV, prêts pour la consultation.',
  },
  {
    kind: 'bottle',
    icon: Icon.Moon,
    before: '« 3 h du matin, l’écran m’aveugle. »',
    after: 'Mode sombre automatique, gros boutons, tout se fait d’une main. Et « Annuler » sur chaque action.',
  },
];

const STEPS = [
  { title: 'Installe en 10 secondes', text: 'Pas de store, pas de mise à jour à subir. Un lien, un tap : l’icône est sur ton écran d’accueil.' },
  { title: 'Note en un tap', text: 'Sein gauche, sein droit, biberon, couche, dodo. Tu as oublié ? Règle l’heure après coup.' },
  { title: 'Partage avec l’autre parent', text: 'Invite-le par e-mail : il voit la journée en direct, et vous arrêtez de vous demander qui a fait quoi.' },
];

const SHOTS = [
  { src: '/landing/today.jpg', title: 'En un tap', text: 'Chrono de tétée, sein suivant suggéré, tout au pouce.', alt: 'Écran Aujourd’hui : chrono de tétée en cours et boutons Sein gauche, Sein droit, Biberon, Couche, Dodo' },
  { src: '/landing/journal.jpg', title: 'Retrouve tout', text: 'Filtre par type, total du jour, quantités bues.', alt: 'Journal filtré sur les biberons, regroupés par jour avec le total de millilitres bus' },
  { src: '/landing/stats.jpg', title: 'Les tendances', text: 'Sommeil, repas, couches : 7 jours d’un coup d’œil.', alt: 'Statistiques sur 7 jours : heures de sommeil, tétées et biberons, couches' },
  { src: '/landing/night.jpg', title: 'Pensé pour la nuit', text: 'Mode sombre automatique. Pas d’éblouissement.', alt: 'Écran Aujourd’hui en mode sombre' },
];

const SOON = [
  { title: 'La nounou voit la journée. Pas votre vie privée.', text: 'Un accès limité à la journée de bébé : elle note, vous suivez, mais elle ne voit rien de vos données.' },
  { title: 'Mode hors-ligne', text: 'Pour les maternités et les chambres sans réseau.' },
  { title: 'Rappels', text: 'Un coup de pouce avant la prochaine tétée ou sieste.' },
  { title: 'Courbes de croissance', text: 'Poids, taille, périmètre crânien : tout au même endroit.' },
];

const FAQ = [
  {
    q: 'C’est vraiment une app, sans passer par l’App Store ?',
    a: 'Oui. Dollo est une web app installable : elle s’ajoute à l’écran d’accueil, s’ouvre en plein écran et se met à jour toute seule. Elle arrivera aussi sur les stores plus tard.',
  },
  { q: 'Et mes données ?', a: 'Elles sont hébergées en Europe. Chaque bébé n’est visible que par ses parents, et tu peux exporter le journal en CSV à tout moment.' },
  { q: 'Ça marche sur iPhone et sur Android ?', a: 'Oui, et sur ordinateur aussi. L’installation diffère un peu selon l’appareil : le pas-à-pas est juste au-dessus.' },
  { q: 'Et sans réseau ?', a: 'L’écran s’ouvre, mais enregistrer sans réseau n’est pas encore possible : c’est en cours. On préfère te le dire plutôt que te laisser le découvrir à 3 h du matin.' },
  { q: 'Dollo remplace un avis médical ?', a: 'Non. Dollo t’aide à noter et à retrouver l’information. Pour toute question de santé, demande à ton pédiatre.' },
];

const TABS: { id: Platform; label: string }[] = [
  { id: 'ios', label: 'iPhone' },
  { id: 'android', label: 'Android' },
  { id: 'desktop', label: 'Ordinateur' },
];

function Phone({ src, alt, eager = false, tilt = false }: { src: string; alt: string; eager?: boolean; tilt?: boolean }) {
  return (
    <div className={`lp-phone${tilt ? ' tilt' : ''}`}>
      <img
        src={src}
        alt={alt}
        width={390}
        height={780}
        // Chargement direct : les captures du carrousel sont hors écran et un cadre vide au glissement serait pire (≈ 80 Ko chacune).
        loading="eager"
        decoding="async"
        {...(eager ? { fetchPriority: 'high' as const } : {})}
      />
    </div>
  );
}

export default function Landing() {
  const { canPrompt, installed, install } = useInstall();
  const [tab, setTab] = useState<Platform>('ios');
  const [copied, setCopied] = useState(false);
  const [sticky, setSticky] = useState(false);
  const heroCta = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTab(detectPlatform(navigator.userAgent, navigator.maxTouchPoints));
  }, []);

  // La barre d'installation collée en bas (mobile) n'apparaît qu'une fois les boutons du haut sortis de l'écran.
  useEffect(() => {
    const el = heroCta.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(([entry]) => setSticky(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const goInstall = async () => {
    if (canPrompt) {
      await install();
      return;
    }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('installer')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  const shareLink = async () => {
    const url = window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Dollo', text: 'Le journal de bébé pour parents épuisés.', url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* partage annulé ou presse-papiers refusé : rien à faire */
    }
  };

  return (
    <div className="lp">
      <header className="lp-wrap lp-nav">
        <a className="lp-logo" href="/?landing" aria-label="Dollo, accueil">
          <img src="/favicon.svg" alt="" width={32} height={32} />
          Dollo
        </a>
        <a className="lp-link" href={APP_URL}>
          Ouvrir l’app
        </a>
      </header>

      <main>
        {/* ─────────── Hero ─────────── */}
        <section className="lp-hero">
          <div className="lp-wrap lp-hero-grid">
            <div className="lp-hero-copy">
              <p className="lp-eyebrow">Pensé pour les 3 h du matin</p>
              <h1>
                Tétées, couches, siestes. <span className="lp-grad">En un tap.</span>
              </h1>
              <p className="lp-lead">
                Le journal de bébé pour parents épuisés. Tu notes d’une main, l’autre parent voit tout en direct. Fini les Post-it et les « t’as donné
                quoi, à quelle heure ? ».
              </p>
              <div className="lp-cta" ref={heroCta}>
                {installed ? (
                  <a className="lp-btn primary" href={APP_URL}>
                    Ouvrir Dollo
                  </a>
                ) : (
                  <button type="button" className="lp-btn primary" onClick={() => void goInstall()}>
                    <Icon.Plus size={22} /> Installer Dollo
                  </button>
                )}
                <a className="lp-btn ghost" href={APP_URL}>
                  Essayer dans le navigateur
                </a>
              </div>
              <ul className="lp-trust" aria-label="En bref">
                <li>Sans App Store</li>
                <li>Installation en quelques secondes</li>
                <li>Données hébergées en Europe</li>
              </ul>
            </div>
            <Phone src="/landing/today.jpg" alt="L’écran Aujourd’hui de Dollo : chrono de tétée en cours et boutons d’enregistrement" eager tilt />
          </div>
        </section>

        {/* ─────────── Les galères ─────────── */}
        <section className="lp-section">
          <div className="lp-wrap">
            <p className="lp-kicker">Le problème</p>
            <h2>
              Les premières semaines, c’est une vingtaine d’événements par jour. <span className="lp-grad">Ton cerveau n’est pas un tableur.</span>
            </h2>
            <ul className="lp-pains">
              {PAINS.map((p) => (
                <li key={p.before} className={`lp-pain kind-${p.kind}`}>
                  <span className="lp-pain-icon" aria-hidden="true">
                    {p.icon({ size: 24 })}
                  </span>
                  <p className="lp-before">{p.before}</p>
                  <p className="lp-after">{p.after}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ─────────── Comment ça marche ─────────── */}
        <section className="lp-section lp-alt">
          <div className="lp-wrap">
            <p className="lp-kicker">Comment ça marche</p>
            <h2>Trois étapes. Zéro tutoriel.</h2>
            <ol className="lp-steps">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <span className="lp-step-n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ─────────── Captures ─────────── */}
        <section className="lp-section">
          <div className="lp-wrap">
            <p className="lp-kicker">Vu de l’intérieur</p>
            <h2>De vraies captures. Pas de maquette.</h2>
            <ul className="lp-shots">
              {SHOTS.map((s) => (
                <li key={s.src}>
                  <Phone src={s.src} alt={s.alt} />
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ─────────── Chiffres ─────────── */}
        <section className="lp-section lp-alt">
          <div className="lp-wrap">
            <p className="lp-kicker">Ordres de grandeur</p>
            <h2>Un nouveau-né, c’est beaucoup à retenir.</h2>
            <ul className="lp-stats">
              <li>
                <strong>8 à 12</strong>
                <span>tétées par 24 h chez un nouveau-né allaité</span>
              </li>
              <li>
                <strong>14 à 17 h</strong>
                <span>de sommeil par 24 h, en plusieurs fois</span>
              </li>
              <li>
                <strong>≈ 20</strong>
                <span>événements à retenir chaque jour (tétées, couches, siestes)</span>
              </li>
            </ul>
            <p className="lp-note">Ordres de grandeur courants, variables d’un bébé à l’autre. Dollo ne remplace pas un avis médical.</p>
          </div>
        </section>

        {/* ─────────── Installer ─────────── */}
        <section className="lp-section lp-install" id="installer" aria-labelledby="installer-title">
          <div className="lp-wrap lp-install-card">
            <p className="lp-kicker">Télécharger</p>
            <h2 id="installer-title">Sur ton écran d’accueil, sans passer par un store.</h2>
            <p className="lp-lead small">
              Dollo s’installe directement depuis ton navigateur : même app, même icône, mises à jour automatiques.
            </p>

            {canPrompt && !installed && (
              <button type="button" className="lp-btn primary big" onClick={() => void install()}>
                <Icon.Plus size={22} /> Installer maintenant
              </button>
            )}
            {installed && (
              <a className="lp-btn primary big" href={APP_URL}>
                <Icon.Check size={22} /> Installée : ouvrir Dollo
              </a>
            )}

            <div className="lp-tabs" role="tablist" aria-label="Choisir ton appareil">
              {TABS.map((t) => (
                <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>

            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="lp-panel">
              {tab === 'ios' && (
                <ol className="lp-how">
                  <li>
                    <b>Ouvre cette page dans Safari.</b> Sur iPhone et iPad, l’installation passe par Safari.
                  </li>
                  <li>
                    Touche le bouton <b>Partager</b> (le carré avec la flèche vers le haut), en bas de l’écran.
                  </li>
                  <li>
                    Choisis <b>« Sur l’écran d’accueil »</b>, puis <b>« Ajouter »</b>.
                  </li>
                </ol>
              )}
              {tab === 'android' && (
                <ol className="lp-how">
                  <li>
                    Ouvre cette page dans <b>Chrome</b>.
                  </li>
                  <li>
                    Touche <b>« Installer Dollo »</b> ci-dessus, ou le menu <b>⋮</b> puis <b>« Installer l’application »</b> (parfois « Ajouter à l’écran d’accueil »).
                  </li>
                  <li>Confirme : l’icône Dollo apparaît sur ton écran d’accueil.</li>
                </ol>
              )}
              {tab === 'desktop' && (
                <ol className="lp-how">
                  <li>
                    Dans <b>Chrome</b> ou <b>Edge</b>, clique sur l’icône d’installation à droite de la barre d’adresse (ou sur « Installer Dollo » ci-dessus).
                  </li>
                  <li>
                    Dollo s’ouvre dans sa propre fenêtre. Mais c’est surtout <b>sur ton téléphone</b> qu’elle sert : envoie-toi le lien.
                  </li>
                </ol>
              )}
            </div>

            <div className="lp-share">
              <button type="button" className="lp-btn ghost" onClick={() => void shareLink()}>
                {copied ? 'Lien copié ✓' : 'Envoyer le lien sur mon téléphone'}
              </button>
              <a className="lp-link" href={APP_URL}>
                ou essayer directement dans le navigateur
              </a>
            </div>
          </div>
        </section>

        {/* ─────────── Bientôt ─────────── */}
        <section className="lp-section">
          <div className="lp-wrap">
            <p className="lp-kicker">Bientôt</p>
            <h2>La suite, déjà en préparation.</h2>
            <ul className="lp-soon">
              {SOON.map((s) => (
                <li key={s.title}>
                  <span className="lp-tag">Bientôt</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ul>
            <p className="lp-note">App Store et Google Play viendront aussi. D’ici là, l’installation directe est la même app.</p>
          </div>
        </section>

        {/* ─────────── FAQ ─────────── */}
        <section className="lp-section lp-alt">
          <div className="lp-wrap lp-faq">
            <p className="lp-kicker">Questions</p>
            <h2>On répond avant que tu demandes.</h2>
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ─────────── Appel final ─────────── */}
        <section className="lp-final">
          <div className="lp-wrap">
            <h2>Le prochain réveil de 3 h arrive. Autant être prêt.</h2>
            <div className="lp-cta center">
              {installed ? (
                <a className="lp-btn light" href={APP_URL}>
                  Ouvrir Dollo
                </a>
              ) : (
                <button type="button" className="lp-btn light" onClick={() => void goInstall()}>
                  <Icon.Plus size={22} /> Installer Dollo
                </button>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap">
          <p>Dollo · Données hébergées en Europe · Ne remplace pas un avis médical</p>
          <a className="lp-link" href={APP_URL}>
            Ouvrir l’app
          </a>
        </div>
      </footer>

      {sticky && !installed && (
        <div className="lp-sticky">
          <button type="button" className="lp-btn primary" onClick={() => void goInstall()}>
            <Icon.Plus size={20} /> Installer Dollo
          </button>
          <a className="lp-btn ghost" href={APP_URL}>
            Ouvrir
          </a>
        </div>
      )}
    </div>
  );
}
