import { describe, expect, it } from 'vitest';
import { describeCommand, parseCommand } from './commands';

describe('commandes (dictée / liens)', () => {
  it.each([
    ['Biberon 120', { type: 'bottle', ml: 120 }],
    ['biberon de 90 ml', { type: 'bottle', ml: 90 }],
    ['il a bu 150 ml', { type: 'bottle', ml: 150 }],
    ['biberon', { type: 'bottle', ml: null }],
    ['Couche pipi', { type: 'diaper', diaperType: 'pee' }],
    ['caca', { type: 'diaper', diaperType: 'poop' }],
    ['couche pipi et caca', { type: 'diaper', diaperType: 'both' }],
    ['couche les deux', { type: 'diaper', diaperType: 'both' }],
    ['changé', { type: 'diaper', diaperType: 'pee' }],
    ['sein gauche', { type: 'breast', side: 'left' }],
    ['tétée côté droit', { type: 'breast', side: 'right' }],
    ['tétée', { type: 'breast', side: 'next' }],
    ['fin de tétée', { type: 'stopFeed' }],
    ['dodo', { type: 'sleep', mode: 'start' }],
    ['elle dort', { type: 'sleep', mode: 'start' }],
    ['réveil', { type: 'sleep', mode: 'stop' }],
    ['il est réveillé', { type: 'sleep', mode: 'stop' }],
    ['température 38,2', { type: 'temp', c: 38.2 }],
    ['fièvre 38 5', { type: 'temp', c: 38.5 }],
    ['37 degrés 8', { type: 'temp', c: 37.8 }],
    ['38.4', { type: 'temp', c: 38.4 }],
    ['vitamine D', { type: 'med', name: 'Vitamine D' }],
    ['Doliprane', { type: 'med', name: 'Doliprane' }],
    ['médicament smecta', { type: 'med', name: 'Smecta' }],
  ])('« %s »', (text, expected) => {
    expect(parseCommand(text)).toEqual(expected);
  });

  it('ignore ce qui n’est pas une commande', () => {
    expect(parseCommand('')).toBeNull();
    expect(parseCommand('bonjour')).toBeNull();
    expect(parseCommand('biberon 9999')).toEqual({ type: 'bottle', ml: null }); // quantité absurde : non retenue
  });

  it('confirmation lisible', () => {
    expect(describeCommand({ type: 'bottle', ml: 120 })).toBe('Biberon 120 ml');
    expect(describeCommand({ type: 'temp', c: 38.2 })).toBe('Température 38,2 °C');
  });
});
