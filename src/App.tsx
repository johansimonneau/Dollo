import type { Session } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
import { ToastProvider } from './components/toast';
import { createLocalStore } from './data/localStore';
import { recoveryInUrl, supabase } from './data/supabase';
import { createSupabaseStore } from './data/supabaseStore';
import { BabyGate, Splash } from './BabyGate';
import { AuthScreen, NewPasswordScreen } from './screens/Auth';

export default function App() {
  const client = supabase;
  // undefined = vérification de la session en cours ; null = déconnecté.
  const [session, setSession] = useState<Session | null | undefined>(client ? undefined : null);
  // Ouverture via « mot de passe oublié » : on demande le nouveau mot de passe avant d'entrer dans l'app.
  const [recovering, setRecovering] = useState(recoveryInUrl);
  const store = useMemo(() => (client ? createSupabaseStore(client) : createLocalStore()), []);

  useEffect(() => {
    if (!client) return;
    void client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = client.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, [client]);

  if (client) {
    if (session === undefined) return <Splash />;
    if (!session) return <AuthScreen />;
    if (recovering) return <NewPasswordScreen onDone={() => setRecovering(false)} />;
  }

  return (
    <ToastProvider>
      {/* `key` : changer de compte repart d'un état vierge (aucune donnée de l'utilisateur précédent ne subsiste). */}
      <BabyGate
        key={session?.user.id ?? 'local'}
        store={store}
        email={session?.user.email ?? null}
        userId={session?.user.id ?? null}
        onSignOut={client ? () => void client.auth.signOut() : null}
      />
    </ToastProvider>
  );
}
