import { useState, type FormEvent } from 'react';
import { InviteByEmail } from '../components/InviteByEmail';
import { useToast } from '../components/toast';
import { errorMessage, type Store } from '../data/store';
import { eventsToCsv } from '../lib/labels';
import { babyAge, dayKey } from '../lib/time';
import type { Baby, BabyEvent } from '../lib/types';

interface Props {
  store: Store;
  baby: Baby;
  events: BabyEvent[];
  email: string | null;
  now: number;
  onBabyUpdated: (baby: Baby) => void;
  onAddBaby: () => void;
  onSignOut: (() => void) | null;
}

/** AB12CD34EF → AB12C-D34EF, plus lisible à dicter. */
const prettyCode = (code: string) => (code.length === 10 ? `${code.slice(0, 5)}-${code.slice(5)}` : code);

export function Settings({ store, baby, events, email, now, onBabyUpdated, onAddBaby, onSignOut }: Props) {
  const toast = useToast();
  const [name, setName] = useState(baby.name);
  const [birthDate, setBirthDate] = useState(baby.birthDate ?? '');
  const [busy, setBusy] = useState(false);

  const dirty = name.trim() !== baby.name || (birthDate || null) !== baby.birthDate;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.show('Le prénom ne peut pas être vide.', { tone: 'error' });
    setBusy(true);
    try {
      onBabyUpdated(await store.updateBaby(baby.id, { name: name.trim(), birthDate: birthDate || null }));
      toast.show('Profil mis à jour.');
    } catch (err) {
      toast.show(errorMessage(err), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    if (!baby.inviteCode) return;
    try {
      await navigator.clipboard.writeText(prettyCode(baby.inviteCode));
      toast.show("Code copié. Envoyez-le à l'autre parent.");
    } catch {
      toast.show(`Code : ${prettyCode(baby.inviteCode)}`);
    }
  };

  const renewCode = async () => {
    if (!window.confirm("Générer un nouveau code ? L'ancien code ne fonctionnera plus (les parents déjà connectés gardent leur accès).")) return;
    try {
      const code = await store.regenerateInviteCode(baby.id);
      onBabyUpdated({ ...baby, inviteCode: code });
      toast.show('Nouveau code généré.');
    } catch (err) {
      toast.show(errorMessage(err), { tone: 'error' });
    }
  };

  const exportCsv = () => {
    const blob = new Blob([eventsToCsv(events)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug =
      baby.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Léa → Lea, Zoé → Zoe
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'bebe';
    a.download = `dollo-${slug}-${dayKey(now)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const age = babyAge(baby.birthDate, now);

  return (
    <div className="screen">
      <section className="card pad" aria-label="Profil de bébé">
        <h2 className="section-title flush">Bébé{age ? ` · ${age}` : ''}</h2>
        <form onSubmit={save}>
          <label className="field">
            <span className="label">Prénom</span>
            <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">Date de naissance</span>
            <input className="input" type="date" value={birthDate} max={dayKey(now)} onChange={(e) => setBirthDate(e.target.value)} />
          </label>
          <button type="submit" className="btn primary" disabled={!dirty || busy}>
            Enregistrer
          </button>
        </form>
        <button type="button" className="link-btn left" onClick={onAddBaby}>
          + Ajouter un autre bébé
        </button>
      </section>

      <section className="card pad" aria-label="Partage entre parents">
        <h2 className="section-title flush">Partager avec l'autre parent</h2>
        {store.mode === 'cloud' ? (
          <>
            <InviteByEmail store={store} baby={baby} now={now} />
            {baby.inviteCode && (
              <>
                <p className="hint alt-share">
                  Ou, sans e-mail : l'autre parent crée son compte, choisit « Rejoindre » et saisit ce code.
                </p>
                <p className="invite-code" aria-label="Code d'invitation">
                  {prettyCode(baby.inviteCode)}
                </p>
                <div className="row-actions">
                  <button type="button" className="btn" onClick={copyCode}>
                    Copier le code
                  </button>
                  <button type="button" className="btn ghost" onClick={renewCode}>
                    Renouveler
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          <p className="hint">
            Mode local : les données restent sur cet appareil. Le partage entre parents s'active avec la synchronisation en ligne (compte
            Supabase configuré).
          </p>
        )}
      </section>

      <section className="card pad" aria-label="Données">
        <h2 className="section-title flush">Données</h2>
        <p className="hint">Exportez le journal (45 derniers jours) pour le montrer au pédiatre ou l'ouvrir dans Excel.</p>
        <button type="button" className="btn" onClick={exportCsv} disabled={events.length === 0}>
          Exporter en CSV
        </button>
      </section>

      <section className="card pad" aria-label="Installer l'application">
        <h2 className="section-title flush">Installer sur l'écran d'accueil</h2>
        <p className="hint">
          <strong>iPhone</strong> : Safari → bouton Partager → « Sur l'écran d'accueil ». <strong>Android</strong> : menu ⋮ de Chrome →
          « Installer l'application ». Dollo s'ouvre alors en plein écran, comme une vraie app.
        </p>
      </section>

      {onSignOut && (
        <section className="card pad" aria-label="Compte">
          <h2 className="section-title flush">Compte</h2>
          {email && <p className="hint">Connecté en tant que {email}</p>}
          <button type="button" className="btn ghost danger" onClick={onSignOut}>
            Se déconnecter
          </button>
        </section>
      )}
    </div>
  );
}
