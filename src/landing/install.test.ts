import { describe, expect, it } from 'vitest';
import { chromeIntentUrl, detectPlatform, isIosSafari } from './install';

const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
const INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

describe('installation', () => {
  it('reconnaît iPhone et Android', () => {
    expect(detectPlatform(SAFARI)).toBe('ios');
    expect(detectPlatform(ANDROID)).toBe('android');
  });

  it("ne considère comme Safari que le vrai Safari (pas Chrome iOS ni Instagram)", () => {
    expect(isIosSafari(SAFARI)).toBe(true);
    expect(isIosSafari(CHROME_IOS)).toBe(false);
    expect(isIosSafari(INSTAGRAM)).toBe(false);
  });

  it('construit le lien qui rouvre la page dans Chrome', () => {
    expect(chromeIntentUrl('https://dollo.app/?landing')).toBe('intent://dollo.app/?landing#Intent;scheme=https;package=com.android.chrome;end');
  });
});
