import { describe, expect, it } from 'vitest';
import { shouldApplyUpdate } from './updates';

describe('application des mises à jour', () => {
  it("n'applique rien tant qu'aucune nouvelle version n'est prête", () => {
    expect(shouldApplyUpdate({ ready: false, hidden: true, interacted: false })).toBe(false);
  });

  it("applique au lancement, avant toute interaction", () => {
    expect(shouldApplyUpdate({ ready: true, hidden: false, interacted: false })).toBe(true);
  });

  it("n'interrompt JAMAIS un parent en train d'utiliser l'app", () => {
    expect(shouldApplyUpdate({ ready: true, hidden: false, interacted: true })).toBe(false);
  });

  it("applique dès que l'app passe en arrière-plan", () => {
    expect(shouldApplyUpdate({ ready: true, hidden: true, interacted: true })).toBe(true);
  });
});
