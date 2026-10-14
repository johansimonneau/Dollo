/** Messages d'erreur Supabase Auth traduits en français, sans jargon. */
export function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou mot de passe incorrect.';
  if (m.includes('email not confirmed')) return "Adresse pas encore confirmée : cliquez sur le lien reçu par e-mail.";
  if (m.includes('already registered') || m.includes('already been registered')) return 'Un compte existe déjà avec cet e-mail : utilisez « Se connecter ».';
  if (m.includes('password should be at least') || m.includes('weak password')) return 'Mot de passe trop court (8 caractères minimum).';
  if (m.includes('token has expired') || m.includes('otp_expired') || m.includes('invalid or has expired')) {
    return 'Code invalide ou expiré. Demandez-en un nouveau.';
  }
  if (m.includes('only request this after')) return 'Patientez environ une minute avant de redemander un code.';
  if (m.includes('email rate limit') || m.includes('rate limit') || m.includes('too many')) {
    return "Trop d'e-mails envoyés pour le moment. Réessayez dans quelques minutes.";
  }
  if (m.includes('invalid format') || m.includes('unable to validate email')) return 'Adresse e-mail invalide.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Connexion impossible. Vérifiez votre réseau.';
  return message;
}
