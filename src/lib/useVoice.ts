import { useCallback, useRef, useState } from 'react';

interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

const ctor = (): RecognitionCtor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const voiceSupported = () => ctor() !== null;

/**
 * Dictée en français (reconnaissance vocale du téléphone : Chrome Android, Safari iOS).
 * `onPhrases` reçoit les transcriptions possibles, de la plus probable à la moins probable.
 */
export function useVoice(onPhrases: (phrases: string[]) => void, onError: (message: string) => void) {
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);

  const start = useCallback(() => {
    const C = ctor();
    if (!C) return onError("La dictée n'est pas disponible dans ce navigateur.");
    const r = new C();
    r.lang = 'fr-FR';
    r.interimResults = false;
    r.maxAlternatives = 4;
    r.continuous = false;
    r.onresult = (e) => {
      const alts = e.results[0];
      const phrases: string[] = [];
      for (let i = 0; i < alts.length; i++) phrases.push(alts[i].transcript);
      onPhrases(phrases);
    };
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      onError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Micro refusé : autorisez-le pour Dollo dans les réglages du téléphone.' : 'Dictée interrompue. Réessayez.');
    };
    r.onend = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  }, [onPhrases, onError]);

  const stop = useCallback(() => {
    rec.current?.abort();
    setListening(false);
  }, []);

  return { listening, start, stop };
}
