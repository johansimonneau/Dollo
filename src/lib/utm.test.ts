import { describe, expect, it } from 'vitest';
import { activeUtm, attributionMetadata, LAST_TOUCH_MS, mergeAttribution, parseTouch, withUtm } from './utm';

const DAY = 24 * 60 * 60 * 1000;

describe('parseTouch', () => {
  it('garde les UTM et identifiants de clic, ignore le reste', () => {
    const t = parseTouch('?app&utm_source=meta&utm_campaign=lancement&fbclid=abc&foo=bar', 1, '/', 'https://l.facebook.com/x');
    expect(t).toEqual({ params: { utm_source: 'meta', utm_campaign: 'lancement', fbclid: 'abc' }, at: 1, landing: '/', referrer: 'l.facebook.com' });
  });

  it('renvoie null sans paramètre de campagne', () => {
    expect(parseTouch('?app&utm_source=', 1, '/')).toBeNull();
    expect(parseTouch('', 1, '/')).toBeNull();
  });
});

describe('mergeAttribution', () => {
  const a = parseTouch('?utm_source=google', 0, '/')!;
  const b = parseTouch('?utm_source=meta', 10 * DAY, '/')!;

  it('garde le premier contact et remplace le dernier', () => {
    const first = mergeAttribution(null, a, 0);
    expect(first).toEqual({ first: a, last: a });
    expect(mergeAttribution(first, b, 10 * DAY)).toEqual({ first: a, last: b });
  });

  it('oublie le dernier contact après 90 jours sans campagne, jamais le premier', () => {
    const prev = { first: a, last: b };
    expect(mergeAttribution(prev, null, 10 * DAY + LAST_TOUCH_MS - 1)).toBe(prev);
    expect(mergeAttribution(prev, null, 10 * DAY + LAST_TOUCH_MS + 1)).toEqual({ first: a });
    expect(activeUtm({ first: a })).toEqual({});
  });
});

describe('withUtm', () => {
  const t = parseTouch('?utm_source=meta&utm_medium=paid&gclid=x', 0, '/')!;
  const utm = activeUtm({ first: t, last: t });

  it("ajoute seulement les UTM (pas les identifiants de clic) aux pages vues", () => {
    expect(withUtm('https://dollo.app/?app', utm)).toBe('https://dollo.app/?app=&utm_source=meta&utm_medium=paid');
  });

  it('ne mélange jamais avec une campagne déjà présente', () => {
    expect(withUtm('https://dollo.app/?utm_source=tiktok', utm)).toBe('https://dollo.app/?utm_source=tiktok');
    expect(withUtm('https://dollo.app/', {})).toBe('https://dollo.app/');
  });
});

describe('attributionMetadata', () => {
  it('aplatit premier et dernier contact pour le compte', () => {
    const t = parseTouch('?utm_source=google&gclid=g1', 0, '/', '')!;
    expect(attributionMetadata({ first: t, last: t })).toEqual({
      first_utm_source: 'google',
      first_gclid: 'g1',
      first_landing: '/',
      first_at: '1970-01-01T00:00:00.000Z',
      last_utm_source: 'google',
      last_gclid: 'g1',
      last_landing: '/',
      last_at: '1970-01-01T00:00:00.000Z',
    });
    expect(attributionMetadata(null)).toEqual({});
  });
});
