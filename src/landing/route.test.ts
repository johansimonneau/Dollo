import { describe, expect, it } from 'vitest';
import { detectPlatform } from './install';
import { wantsLanding, type RouteEnv } from './route';

const fresh: RouteEnv = { pathname: '/', search: '', hash: '', standalone: false, hasLocalData: false, hasSession: false };
const env = (over: Partial<RouteEnv>): RouteEnv => ({ ...fresh, ...over });

describe('wantsLanding', () => {
  it("montre la page de présentation à un nouveau visiteur sur l'adresse racine", () => {
    expect(wantsLanding(fresh)).toBe(true);
  });

  it("ouvre l'app directement pour tout usage existant", () => {
    expect(wantsLanding(env({ standalone: true }))).toBe(false); // app installée
    expect(wantsLanding(env({ hasLocalData: true }))).toBe(false); // déjà des données
    expect(wantsLanding(env({ hasSession: true }))).toBe(false); // déjà connecté
    expect(wantsLanding(env({ search: '?app' }))).toBe(false); // bouton « Ouvrir l'app »
    expect(wantsLanding(env({ pathname: '/autre' }))).toBe(false);
  });

  it("ne gêne jamais le retour d'un lien de connexion ou d'une erreur d'authentification", () => {
    expect(wantsLanding(env({ hash: '#access_token=abc&refresh_token=def&type=signup' }))).toBe(false);
    expect(wantsLanding(env({ hash: '#error=access_denied&error_code=otp_expired&error_description=x' }))).toBe(false);
    expect(wantsLanding(env({ search: '?code=pkce-code' }))).toBe(false);
    expect(wantsLanding(env({ search: '?error=server_error' }))).toBe(false);
  });

  it("`?landing` force la page, même pour quelqu'un qui a déjà l'app", () => {
    expect(wantsLanding(env({ search: '?landing', hasSession: true, standalone: true }))).toBe(true);
  });
});

describe('detectPlatform', () => {
  it('reconnaît iPhone, iPad, Android et ordinateur', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1')).toBe('ios');
    expect(detectPlatform('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('ios');
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36')).toBe('android');
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36')).toBe('desktop');
  });

  it("distingue un iPad récent (qui se déclare Mac) d'un vrai Mac", () => {
    const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';
    expect(detectPlatform(mac, 5)).toBe('ios');
    expect(detectPlatform(mac, 0)).toBe('desktop');
  });
});
