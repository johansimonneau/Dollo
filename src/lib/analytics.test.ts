import { afterEach, describe, expect, it, vi } from 'vitest';
import { setSender, trackConversion } from './analytics';

describe('trackConversion', () => {
  afterEach(() => setSender(() => {}));

  it("envoie le nom de l'étape et ses propriétés", () => {
    const sent = vi.fn();
    setSender(sent);
    trackConversion({ name: 'checkout_started', plan: 'yearly' });
    trackConversion({ name: 'baby_created', first: true });
    expect(sent).toHaveBeenNthCalledWith(1, 'checkout_started', { plan: 'yearly' });
    expect(sent).toHaveBeenNthCalledWith(2, 'baby_created', { first: true });
  });

  it('sans propriété : rien de plus que le nom', () => {
    const sent = vi.fn();
    setSender(sent);
    trackConversion({ name: 'sign_up' });
    expect(sent).toHaveBeenCalledWith('sign_up', undefined);
  });

  it("ne casse jamais l'app si l'envoi échoue", () => {
    setSender(() => {
      throw new Error('bloqué');
    });
    expect(() => trackConversion({ name: 'purchase' })).not.toThrow();
  });
});
