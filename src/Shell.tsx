import { useEffect, useState, type JSX } from 'react';
import { EventSheet, type EventData } from './components/EventSheet';
import { Icon } from './components/icons';
import { BottleSheet, DiaperSheet } from './components/QuickSheets';
import { useToast } from './components/toast';
import { errorMessage, type Store } from './data/store';
import { DIAPER_LABEL, SIDE_LABEL } from './lib/labels';
import { ongoing } from './lib/summary';
import { babyAge, fmtDuration } from './lib/time';
import { emptyEvent, type Baby, type BabyEvent, type BreastSide, type DiaperType } from './lib/types';
import { useEvents } from './lib/useEvents';
import { useNow } from './lib/useNow';
import { resolveWhen, type When } from './components/TimeChips';
import { Journal } from './screens/Journal';
import { Settings } from './screens/Settings';
import { Stats } from './screens/Stats';
import { Today } from './screens/Today';

type Tab = 'today' | 'journal' | 'stats' | 'settings';
type SheetState = { type: 'diaper' } | { type: 'bottle' } | { type: 'event'; event?: BabyEvent } | null;

const TABS: { id: Tab; label: string; icon: (p: { size?: number }) => JSX.Element }[] = [
  { id: 'today', label: "Aujourd'hui", icon: Icon.Home },
  { id: 'journal', label: 'Journal', icon: Icon.List },
  { id: 'stats', label: 'Stats', icon: Icon.Chart },
  { id: 'settings', label: 'Réglages', icon: Icon.Settings },
];

const LAST_ML_KEY = 'dollo:lastMl';
const readLastMl = (): number => {
  try {
    const v = Number(localStorage.getItem(LAST_ML_KEY));
    return v > 0 && v <= 500 ? v : 90;
  } catch {
    return 90;
  }
};

interface Props {
  store: Store;
  babies: Baby[];
  baby: Baby;
  email: string | null;
  userId: string | null;
  onSelectBaby: (id: string) => void;
  onBabyUpdated: (baby: Baby) => void;
  onAddBaby: () => void;
  onSignOut: (() => void) | null;
}

/** Ce que voit la nounou : les dernières 48 h (la base n'en renvoie pas plus). */
const NANNY_DAYS = 2;

export function Shell({ store, babies, baby, email, userId, onSelectBaby, onBabyUpdated, onAddBaby, onSignOut }: Props) {
  const nanny = baby.role === 'nanny';
  const tabs = nanny ? TABS.filter((t) => t.id !== 'stats') : TABS;
  // Côté parents : repérer ce qu'a noté la nounou (la liste des membres n'est lisible que par les parents).
  const [nannyIds, setNannyIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (nanny || store.mode !== 'cloud') return;
    let alive = true;
    store
      .listMembers(baby.id)
      .then((members) => alive && setNannyIds(new Set(members.filter((m) => m.role === 'nanny').map((m) => m.userId))))
      .catch(() => {
        /* base pas encore migrée : pas de mention « nounou » */
      });
    return () => {
      alive = false;
    };
  }, [store, baby.id, nanny]);
  const toast = useToast();
  const { events, loading, error, reload, add, update, remove } = useEvents(store, baby.id);
  const [tab, setTab] = useState<Tab>('today');
  const [sheet, setSheet] = useState<SheetState>(null);

  const running = ongoing(events).length > 0;
  const now = useNow(running ? 1000 : 15_000);
  const age = babyAge(baby.birthDate, now);
  const closeSheet = () => setSheet(null);

  /** Toute action utilisateur passe par ici : une erreur réseau devient un message clair, jamais un écran blanc. */
  const guard = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      toast.show(errorMessage(e), { tone: 'error' });
    }
  };

  const startBreast = (side: BreastSide) =>
    guard(async () => {
      const t = new Date().toISOString();
      const current = ongoing(events).find((e) => e.kind === 'breast');
      // Changer de sein = terminer le précédent et démarrer l'autre en un seul tap.
      if (current) await update(current.id, { endedAt: t });
      const created = await add({ ...emptyEvent(baby.id, 'breast', t), side });
      toast.show(
        current?.side ? `${SIDE_LABEL[current.side]} terminé · ${SIDE_LABEL[side]} démarré` : `${SIDE_LABEL[side]} · démarré`,
        {
          actionLabel: 'Annuler',
          onAction: () =>
            guard(async () => {
              await remove(created.id);
              if (current) await update(current.id, { endedAt: null });
            }),
        },
      );
    });

  const stop = (e: BabyEvent) =>
    guard(async () => {
      const t = new Date();
      await update(e.id, { endedAt: t.toISOString() });
      const spent = fmtDuration(t.getTime() - new Date(e.startedAt).getTime());
      toast.show(e.kind === 'sleep' ? `Réveil · a dormi ${spent}` : `Tétée terminée · ${spent}`, {
        actionLabel: 'Annuler',
        onAction: () => guard(async () => void (await update(e.id, { endedAt: null }))),
      });
    });

  const toggleSleep = () => {
    const sleeping = ongoing(events).find((e) => e.kind === 'sleep');
    if (sleeping) return stop(sleeping);
    return guard(async () => {
      const created = await add(emptyEvent(baby.id, 'sleep', new Date().toISOString()));
      toast.show('Dodo · démarré', { actionLabel: 'Annuler', onAction: () => guard(() => remove(created.id)) });
    });
  };

  const whenOrToast = (when: When): string | null => {
    const iso = resolveWhen(when);
    if (!iso) {
      toast.show("Heure invalide.", { tone: 'error' });
      return null;
    }
    if (new Date(iso).getTime() > Date.now() + 5 * 60_000) {
      toast.show("L'heure est dans le futur.", { tone: 'error' });
      return null;
    }
    return iso;
  };

  const saveDiaper = (type: DiaperType, when: When, note: string | null) =>
    guard(async () => {
      const startedAt = whenOrToast(when);
      if (!startedAt) return;
      const created = await add({ ...emptyEvent(baby.id, 'diaper', startedAt), diaperType: type, note });
      closeSheet();
      toast.show(`Couche enregistrée · ${DIAPER_LABEL[type]}`, { actionLabel: 'Annuler', onAction: () => guard(() => remove(created.id)) });
    });

  const saveBottle = (ml: number, when: When, note: string | null) =>
    guard(async () => {
      const startedAt = whenOrToast(when);
      if (!startedAt) return;
      const created = await add({ ...emptyEvent(baby.id, 'bottle', startedAt), amountMl: ml, note });
      try {
        localStorage.setItem(LAST_ML_KEY, String(ml));
      } catch {
        /* la mémorisation de la dernière quantité est un confort, pas une nécessité */
      }
      closeSheet();
      toast.show(`Biberon enregistré · ${ml} ml`, { actionLabel: 'Annuler', onAction: () => guard(() => remove(created.id)) });
    });

  const saveEvent = async (data: EventData) => {
    const editing = sheet?.type === 'event' ? sheet.event : undefined;
    if (editing) await update(editing.id, data);
    else await add({ babyId: baby.id, ...data });
    closeSheet();
    toast.show('Enregistré.');
  };

  const deleteEvent = async () => {
    const editing = sheet?.type === 'event' ? sheet.event : undefined;
    if (!editing) return;
    await remove(editing.id);
    closeSheet();
    const { id: _id, ...copy } = editing;
    toast.show('Événement supprimé.', { actionLabel: 'Annuler', onAction: () => guard(async () => void (await add(copy))) });
  };

  const edit = (event: BabyEvent) => {
    // La base l'interdit de toute façon : on l'explique plutôt que d'afficher une erreur à l'enregistrement.
    if (nanny && event.createdBy && event.createdBy !== userId) {
      toast.show('Seuls les parents peuvent modifier cet événement. Vous pouvez arrêter un dodo ou une tétée en cours.');
      return;
    }
    setSheet({ type: 'event', event });
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-main">
          {babies.length > 1 ? (
            <select className="baby-select" aria-label="Choisir le bébé" value={baby.id} onChange={(e) => onSelectBaby(e.target.value)}>
              {babies.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          ) : (
            <h1 className="baby-name">{baby.name}</h1>
          )}
          {age && <p className="baby-age">{age}</p>}
        </div>
        {nanny && <span className="mode-chip">Nounou</span>}
        {store.mode === 'local' && (
          <span className="mode-chip" title="Les données restent sur cet appareil. Configurez Supabase pour synchroniser et partager.">
            Mode local
          </span>
        )}
      </header>

      {error && (
        <div className="banner" role="alert">
          <span>Synchronisation impossible : {error}</span>
          <button type="button" className="link-btn" onClick={() => void reload()}>
            Réessayer
          </button>
        </div>
      )}

      <main className="content" aria-busy={loading}>
        {tab === 'today' && (
          <Today
            events={events}
            now={now}
            actions={{
              startBreast: (s) => void startBreast(s),
              stop: (e) => void stop(e),
              toggleSleep: () => void toggleSleep(),
              openDiaper: () => setSheet({ type: 'diaper' }),
              openBottle: () => setSheet({ type: 'bottle' }),
              edit,
            }}
          />
        )}
        {tab === 'journal' && (
          <Journal
            events={events}
            now={now}
            onEdit={edit}
            onAdd={() => setSheet({ type: 'event' })}
            historyDays={nanny ? NANNY_DAYS : undefined}
            nannyIds={nannyIds}
          />
        )}
        {tab === 'stats' && <Stats events={events} now={now} />}
        {tab === 'settings' && (
          <Settings
            nanny={nanny}
            store={store}
            baby={baby}
            events={events}
            email={email}
            now={now}
            onBabyUpdated={onBabyUpdated}
            onAddBaby={onAddBaby}
            onSignOut={onSignOut}
          />
        )}
      </main>

      <nav className="tabbar" aria-label="Navigation principale">
        {tabs.map(({ id, label, icon: I }) => (
          <button key={id} type="button" className="tab" aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
            <I size={24} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {sheet?.type === 'diaper' && <DiaperSheet onSave={(t, w, n) => void saveDiaper(t, w, n)} onClose={closeSheet} />}
      {sheet?.type === 'bottle' && <BottleSheet defaultMl={readLastMl()} onSave={(ml, w, n) => void saveBottle(ml, w, n)} onClose={closeSheet} />}
      {sheet?.type === 'event' && (
        <EventSheet
          key={sheet.event?.id ?? 'new'}
          event={sheet.event}
          onSave={saveEvent}
          onDelete={sheet.event ? deleteEvent : undefined}
          onClose={closeSheet}
        />
      )}
    </div>
  );
}
