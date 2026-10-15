import { useState } from 'react';
import { describeCommand, parseCommand } from '../lib/commands';
import { detectPlatform } from '../landing/install';
import { useToast } from './toast';

const LINKS = ['biberon 120', 'biberon 150', 'couche pipi', 'couche caca', 'tétée', 'sommeil', 'vitamine D'];

/** Réglages → « Mains libres » : dictée, liens d'action pour Siri / Google, raccourcis de l'icône. */
export function HandsFree() {
  const toast = useToast();
  const [custom, setCustom] = useState('biberon 90');
  const platform = typeof navigator === 'undefined' ? 'desktop' : detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
  const linkFor = (text: string) => `${window.location.origin}/?app&do=${encodeURIComponent(text)}`;
  const parsed = parseCommand(custom);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(linkFor(text));
      toast.show(`Lien « ${text} » copié.`);
    } catch {
      toast.show(linkFor(text), { durationMs: 10_000 });
    }
  };

  return (
    <section className="card pad" aria-label="Mains libres">
      <h2 className="section-title flush">Mains libres</h2>
      <p className="hint">
        <strong>Dicter</strong> (écran Aujourd'hui, bouton micro) : « biberon 120 », « couche pipi », « dodo », « réveil », « température 38,2 »,
        « vitamine D »…
      </p>
      {platform === 'ios' ? (
        <p className="hint">
          <strong>Avec Siri</strong> : app Raccourcis → « + » → « Ouvrir des URL » → collez un lien ci-dessous → nommez le raccourci (ex.
          « Biberon 120 »). Ensuite : « Dis Siri, biberon 120 ».
        </p>
      ) : (
        <p className="hint">
          <strong>Appui long sur l'icône Dollo</strong> : Biberon, Couche, Tétée, Dodo. <strong>Avec l'Assistant Google</strong> : créez une routine qui
          ouvre un lien ci-dessous, ou ouvrez le lien dans Chrome puis « Ajouter à l'écran d'accueil » pour avoir un bouton direct.
        </p>
      )}
      <ul className="link-list">
        {LINKS.map((l) => (
          <li key={l}>
            <span>{describeCommand(parseCommand(l)!)}</span>
            <button type="button" className="link-btn" onClick={() => void copy(l)}>
              Copier le lien
            </button>
          </li>
        ))}
      </ul>
      <label className="field">
        <span className="label">Autre action</span>
        <input className="input" value={custom} onChange={(e) => setCustom(e.target.value)} />
        <span className="hint">{parsed ? `Compris : ${describeCommand(parsed)}` : 'Pas compris : essayez « biberon 90 », « couche caca »…'}</span>
      </label>
      <button type="button" className="btn" disabled={!parsed} onClick={() => void copy(custom.trim())}>
        Copier ce lien
      </button>
    </section>
  );
}
