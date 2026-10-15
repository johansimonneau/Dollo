import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { COMMAND_EXAMPLES, parseCommand, type Command } from './lib/commands';
import { useVoice, voiceSupported } from './lib/useVoice';
import { DEFAULT_PREFS, type ReminderPrefs } from '../supabase/functions/_shared/reminders';
import { syncPush } from './lib/push';
import { byAppointment, doseStatus, dueDate } from './lib/vaccines';
import { dayKey, fmtDate } from './lib/time';
import type { OfflineStore, SyncState } from './data/offlineStore';
import { EventSheet, type EventData } from './components/EventSheet';
import { Icon } from './components/icons';
import { BottleSheet, DiaperSheet, MedSheet, PumpSheet, TempSheet, type MilkStorage, type RecentMed } from './components/QuickSheets';
import { MilkStock } from './components/MilkStock';
import { useToast } from './components/toast';
import { errorMessage, type Store } from './data/store';
import { DIAPER_LABEL, fmtTemp, SIDE_LABEL } from './lib/labels';
import { ongoing, suggestNextSide } from './lib/summary';
import { babyAge, fmtDuration } from './lib/time';
import { emptyEvent, type Baby, type BabyEvent, type BreastSide, type DiaperType, type MilkBag, type PumpSide } from './lib/types';
import { useEvents } from './lib/useEvents';
import { useNow } from './lib/useNow';
import { NOW, resolveWhen, type When } from './components/TimeChips';
import { Journal } from './screens/Journal';
import { Settings } from './screens/Settings';
import { StatsTabs } from './screens/StatsTabs';
import { Today } from './screens/Today';

type Tab = 'today' | 'journal' | 'stats' | 'settings';
type SheetState = { type: 'diaper' } | { type: 'bottle' } | { type: 'temp' } | { type: 'med' } | { type: 'pump' } | { type: 'milk' } | { type: 'event'; event?: BabyEvent } | null;

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
  const toast = useToast();
  const nanny = baby.role === 'nanny';
  const tabs = nanny ? TABS.filter((t) => t.id !== 'stats') : TABS;
  // Hors ligne : saisies en attente d'envoi, et saisies refusées au retour du réseau.
  const [sync, setSync] = useState<SyncState>(() => ('syncState' in store ? (store as OfflineStore).syncState() : { pending: 0, offline: false }));
  useEffect(() => {
    if (!('onSyncChange' in store)) return;
    const s = store as OfflineStore;
    setSync(s.syncState());
    const off = s.onSyncChange(setSync);
    const onDropped = (e: Event) =>
      toast.show(`${(e as CustomEvent<number>).detail} saisie(s) faite(s) hors ligne n'ont pas pu être enregistrée(s) (accès retiré ou événement supprimé entre-temps).`, {
        tone: 'error',
        durationMs: 10_000,
      });
    window.addEventListener('dollo:sync-dropped', onDropped);
    return () => {
      off();
      window.removeEventListener('dollo:sync-dropped', onDropped);
    };
  }, [store, toast]);

  // Rappels de l'utilisateur pour ce bébé (bandeaux sur « Aujourd'hui », réglages).
  const [reminderPrefs, setReminderPrefs] = useState<ReminderPrefs>(DEFAULT_PREFS);
  useEffect(() => {
    let alive = true;
    setReminderPrefs(DEFAULT_PREFS);
    store
      .getReminderPrefs(baby.id)
      .then((p) => alive && setReminderPrefs(p))
      .catch(() => {
        /* base pas encore migrée : pas de rappels */
      });
    return () => {
      alive = false;
    };
  }, [store, baby.id]);
  // L'abonnement aux notifications de cet appareil suit le compte connecté (renouvellement, changement de compte).
  useEffect(() => {
    if (store.mode === 'cloud') void syncPush(store).catch(() => undefined);
  }, [store, userId]);

  // Stock de lait tiré (tous les membres : la nounou donne souvent le lait du stock).
  const [milkBags, setMilkBags] = useState<MilkBag[]>([]);
  const [milkVersion, setMilkVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    store
      .listMilkBags(baby.id)
      .then((b) => alive && setMilkBags(b))
      .catch(() => alive && setMilkBags([])); // base pas encore migrée : pas de stock
    return () => {
      alive = false;
    };
  }, [store, baby.id, milkVersion]);
  const reloadMilk = () => setMilkVersion((v) => v + 1);

  // Vaccins (parents) : bandeau « vaccins des 2 mois à faire » sur Aujourd'hui.
  const [vaxCodes, setVaxCodes] = useState<Set<string> | null>(null);
  const [vaxVersion, setVaxVersion] = useState(0);
  useEffect(() => {
    if (nanny) return;
    let alive = true;
    store
      .listVaccinations(baby.id)
      .then((list) => alive && setVaxCodes(new Set(list.map((v) => v.code))))
      .catch(() => alive && setVaxCodes(null)); // base pas encore migrée : pas de bandeau
    return () => {
      alive = false;
    };
  }, [store, baby.id, nanny, vaxVersion]);
  const vaccinesDue = () => {
    if (!vaxCodes || !baby.birthDate) return null;
    const today = dayKey(now);
    const g = byAppointment().find((grp) => grp.doses.some((d) => doseStatus(d, baby.birthDate!, today, vaxCodes.has(d.code) ? today : undefined) === 'due'));
    return g ? `Vaccins des ${g.label} : prévus vers le ${fmtDate(dueDate(baby.birthDate, g.months))}` : null;
  };

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
        current?.side && current.side !== 'both' ? `${SIDE_LABEL[current.side]} terminé · ${SIDE_LABEL[side]} démarré` : `${SIDE_LABEL[side]} · démarré`,
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

  const saveTemp = (tempC: number, when: When, note: string | null) =>
    guard(async () => {
      const startedAt = whenOrToast(when);
      if (!startedAt) return;
      const created = await add({ ...emptyEvent(baby.id, 'temp', startedAt), tempC, note });
      closeSheet();
      toast.show(`Température enregistrée · ${fmtTemp(tempC)}`, { actionLabel: 'Annuler', onAction: () => guard(() => remove(created.id)) });
    });

  const saveMed = (medName: string, medDose: string | null, when: When, note: string | null) =>
    guard(async () => {
      const startedAt = whenOrToast(when);
      if (!startedAt) return;
      const created = await add({ ...emptyEvent(baby.id, 'med', startedAt), medName, medDose, note });
      closeSheet();
      toast.show(`Médicament enregistré · ${medName}`, { actionLabel: 'Annuler', onAction: () => guard(() => remove(created.id)) });
    });

  const savePump = (side: PumpSide, minutes: number | null, ml: number, storage: MilkStorage | null, when: When, note: string | null) =>
    guard(async () => {
      const startedAt = whenOrToast(when);
      if (!startedAt) return;
      const endedAt = minutes ? new Date(new Date(startedAt).getTime() + minutes * 60_000).toISOString() : null;
      const created = await add({ ...emptyEvent(baby.id, 'pump', startedAt), side, endedAt, amountMl: ml > 0 ? ml : null, note });
      if (storage && ml > 0) {
        await store.addMilkBag({ babyId: baby.id, pumpedAt: startedAt, volumeMl: ml, storage, storedAt: startedAt, note: null });
        reloadMilk();
      }
      closeSheet();
      toast.show(`Tirage enregistré · ${ml} ml${storage ? (storage === 'fridge' ? ' · au frigo' : ' · au congélateur') : ''}`, {
        actionLabel: storage ? undefined : 'Annuler',
        onAction: storage ? undefined : () => guard(() => remove(created.id)),
      });
    });

  const giveMilk = async (bag: MilkBag) => {
    await add({ ...emptyEvent(baby.id, 'bottle', new Date().toISOString()), amountMl: bag.volumeMl, note: 'Lait maternel du stock' });
    await store.updateMilkBag(bag.id, { usedAt: new Date().toISOString() });
    reloadMilk();
    toast.show(`Biberon de ${bag.volumeMl} ml enregistré (lait du stock). Corrigez la quantité bue si besoin.`);
  };
  const thawMilk = async (bag: MilkBag) => {
    await store.updateMilkBag(bag.id, { storage: 'thawed', storedAt: new Date().toISOString() });
    reloadMilk();
    toast.show('Décongelé : à utiliser sous 24 h (au réfrigérateur, sans recongeler).');
  };
  const discardMilk = async (bag: MilkBag) => {
    await store.updateMilkBag(bag.id, { discardedAt: new Date().toISOString() });
    reloadMilk();
    toast.show(`${bag.volumeMl} ml retirés du stock.`);
  };

  // Derniers médicaments notés (pour les raccourcis et l'avertissement « dernière prise »).
  const recentMeds: RecentMed[] = events
    .filter((e) => e.kind === 'med' && e.medName)
    .slice(0, 20)
    .map((e) => ({ name: e.medName!, dose: e.medDose ?? null, at: e.startedAt }));

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

  /** Exécute une commande (dictée ou lien d'action) avec les mêmes enregistrements que les boutons. */
  const runCommand = (c: Command) => {
    switch (c.type) {
      case 'bottle':
        return void saveBottle(c.ml ?? readLastMl(), NOW, null);
      case 'diaper':
        return void saveDiaper(c.diaperType, NOW, null);
      case 'breast':
        return void startBreast(c.side === 'next' ? (suggestNextSide(events) ?? 'left') : c.side);
      case 'stopFeed': {
        const feed = ongoing(events).find((e) => e.kind === 'breast');
        return feed ? void stop(feed) : toast.show('Aucune tétée en cours.');
      }
      case 'sleep': {
        const sleeping = ongoing(events).some((e) => e.kind === 'sleep');
        if (c.mode === 'start' && sleeping) return toast.show('Bébé dort déjà (dodo en cours).');
        if (c.mode === 'stop' && !sleeping) return toast.show("Aucun dodo en cours.");
        return void toggleSleep();
      }
      case 'temp':
        return void saveTemp(c.c, NOW, null);
      case 'med':
        return void saveMed(c.name, null, NOW, null);
    }
  };

  // Dictée : la première transcription comprise l'emporte (le téléphone en propose plusieurs).
  const onPhrases = useCallback(
    (phrases: string[]) => {
      for (const p of phrases) {
        const c = parseCommand(p);
        if (c) return runCommandRef.current(c);
      }
      toast.show(`Pas compris : « ${phrases[0] ?? ''} ». Exemples : ${COMMAND_EXAMPLES.slice(0, 4).join(', ')}…`, { tone: 'error', durationMs: 7000 });
    },
    [toast],
  );
  const runCommandRef = useRef(runCommand);
  runCommandRef.current = runCommand;
  const voice = useVoice(onPhrases, (m) => toast.show(m, { tone: 'error' }));

  // Liens d'action (Siri / Raccourcis, icône épinglée, raccourcis Android) : ?app&do=biberon 120 ou ?app&open=bottle.
  // Exécutés une seule fois, après le premier chargement (pour connaître la tétée / le dodo en cours), puis retirés de l'adresse.
  const linkHandled = useRef(false);
  useEffect(() => {
    if (loading || linkHandled.current) return;
    linkHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    const todo = params.get('do');
    const open = params.get('open');
    if (!todo && !open) return;
    params.delete('do');
    params.delete('open');
    const rest = params.toString().replace(/=(&|$)/g, '$1');
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
    if (open === 'bottle' || open === 'diaper' || open === 'temp' || open === 'med' || open === 'pump') return setSheet({ type: open });
    const c = todo ? parseCommand(todo) : null;
    if (c) runCommandRef.current(c);
    else toast.show(`Lien non compris : « ${todo} ».`, { tone: 'error' });
  }, [loading, toast]);

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

      {(sync.offline || sync.pending > 0) && (
        <div className="banner offline" role="status">
          <span>
            {sync.offline ? 'Hors connexion' : 'Envoi en cours'}
            {sync.pending > 0
              ? ` · ${sync.pending} saisie${sync.pending > 1 ? 's' : ''} en attente, envoyée${sync.pending > 1 ? 's' : ''} automatiquement au retour du réseau.`
              : ' · vous pouvez continuer à noter, tout sera envoyé au retour du réseau.'}
          </span>
        </div>
      )}

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
            reminderPrefs={reminderPrefs}
            birthDate={baby.birthDate}
            vaccinesDue={vaccinesDue()}
            milkBags={milkBags}
            actions={{
              startBreast: (s) => void startBreast(s),
              stop: (e) => void stop(e),
              toggleSleep: () => void toggleSleep(),
              openDiaper: () => setSheet({ type: 'diaper' }),
              openBottle: () => setSheet({ type: 'bottle' }),
              openTemp: () => setSheet({ type: 'temp' }),
              openMed: () => setSheet({ type: 'med' }),
              openPump: () => setSheet({ type: 'pump' }),
              openMilk: () => setSheet({ type: 'milk' }),
              voice: voiceSupported() ? { listening: voice.listening, start: voice.start, stop: voice.stop } : null,
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
        {tab === 'stats' && (
          <StatsTabs store={store} baby={baby} events={events} now={now} onBabyUpdated={onBabyUpdated} onVaccinesChanged={() => setVaxVersion((v) => v + 1)} />
        )}
        {tab === 'settings' && (
          <Settings
            nanny={nanny}
            reminderPrefs={reminderPrefs}
            onReminderPrefsChange={setReminderPrefs}
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
      {sheet?.type === 'pump' && <PumpSheet onSave={(...a) => void savePump(...a)} onClose={closeSheet} />}
      {sheet?.type === 'milk' && (
        <MilkStock bags={milkBags} now={now} onGive={giveMilk} onThaw={thawMilk} onDiscard={discardMilk} onClose={closeSheet} />
      )}
      {sheet?.type === 'temp' && <TempSheet onSave={(t, w, n) => void saveTemp(t, w, n)} onClose={closeSheet} />}
      {sheet?.type === 'med' && (
        <MedSheet
          recent={recentMeds}
          defaultName={reminderPrefs.dailyMed?.name}
          now={now}
          onSave={(n, d, w, note) => void saveMed(n, d, w, note)}
          onClose={closeSheet}
        />
      )}
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
