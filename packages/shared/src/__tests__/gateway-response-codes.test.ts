import { describe, it, expect } from 'vitest';
import {
  GATEWAY_RESPONSE_CODES,
  AVS_RESPONSE_CODES,
  CVV_RESPONSE_CODES,
  VISA_DECLINE_CATEGORIES,
  MC_ADVICE_CODES,
  getResponseCodeMap,
  getAvsMap,
  getCvvMap,
  DECLINE_CATEGORY_LABELS,
  SUGGESTED_ACTION_LABELS,
  type DeclineCategory,
  type SuggestedAction,
} from '../constants/gateway-response-codes';

const VALID_CATEGORIES: DeclineCategory[] = [
  'approved', 'hard', 'soft', 'data_fix', 'config_error', 'fraud', 'network_error',
];

const VALID_ACTIONS: SuggestedAction[] = [
  'none', 'try_different_card', 'retry_later', 'fix_and_retry',
  'contact_issuer', 'try_again', 'contact_support',
];

describe('gateway response codes registry', () => {
  describe('registry integrity', () => {
    it('has no duplicate PROCESSOR:CODE keys', () => {
      const keys = GATEWAY_RESPONSE_CODES.map((rc) => `${rc.processor}:${rc.code}`);
      const unique = new Set(keys);
      expect(unique.size).toBe(keys.length);
    });

    it('has at least 50 entries', () => {
      expect(GATEWAY_RESPONSE_CODES.length).toBeGreaterThanOrEqual(50);
    });

    it('every entry has a non-empty userMessage under 200 chars', () => {
      for (const rc of GATEWAY_RESPONSE_CODES) {
        expect(rc.userMessage.length, `${rc.processor}:${rc.code} userMessage empty`).toBeGreaterThan(0);
        expect(rc.userMessage.length, `${rc.processor}:${rc.code} userMessage too long`).toBeLessThanOrEqual(200);
      }
    });

    it('every entry has a valid declineCategory', () => {
      for (const rc of GATEWAY_RESPONSE_CODES) {
        expect(VALID_CATEGORIES, `${rc.processor}:${rc.code} invalid category: ${rc.declineCategory}`)
          .toContain(rc.declineCategory);
      }
    });

    it('every entry has a valid suggestedAction', () => {
      for (const rc of GATEWAY_RESPONSE_CODES) {
        expect(VALID_ACTIONS, `${rc.processor}:${rc.code} invalid action: ${rc.suggestedAction}`)
          .toContain(rc.suggestedAction);
      }
    });

    it('every entry has a valid respstat (A, B, or C)', () => {
      for (const rc of GATEWAY_RESPONSE_CODES) {
        expect(['A', 'B', 'C'], `${rc.processor}:${rc.code} invalid respstat: ${rc.respstat}`)
          .toContain(rc.respstat);
      }
    });

    it('approved entries have respstat A', () => {
      const approved = GATEWAY_RESPONSE_CODES.filter((rc) => rc.declineCategory === 'approved');
      for (const rc of approved) {
        expect(rc.respstat, `${rc.processor}:${rc.code} approved but respstat is ${rc.respstat}`).toBe('A');
      }
    });

    it('approved entries are not retryable', () => {
      const approved = GATEWAY_RESPONSE_CODES.filter((rc) => rc.declineCategory === 'approved');
      for (const rc of approved) {
        expect(rc.retryable, `${rc.processor}:${rc.code} approved but retryable=true`).toBe(false);
      }
    });

    it('no userMessage contains raw response codes or system internals', () => {
      const forbidden = ['respstat', 'respproc', 'RPCT', 'PPS', 'CardPointe', 'Fiserv'];
      for (const rc of GATEWAY_RESPONSE_CODES) {
        for (const word of forbidden) {
          expect(rc.userMessage.toLowerCase(), `${rc.processor}:${rc.code} userMessage contains "${word}"`)
            .not.toContain(word.toLowerCase());
        }
      }
    });
  });

  describe('lookup maps', () => {
    it('getResponseCodeMap builds correctly', () => {
      const map = getResponseCodeMap();
      expect(map.size).toBe(GATEWAY_RESPONSE_CODES.length);
    });

    it('can look up PPS:00 as approved', () => {
      const map = getResponseCodeMap();
      const entry = map.get('PPS:00');
      expect(entry).toBeDefined();
      expect(entry!.declineCategory).toBe('approved');
      expect(entry!.respstat).toBe('A');
    });

    it('can look up RPCT:116 as insufficient funds', () => {
      const map = getResponseCodeMap();
      const entry = map.get('RPCT:116');
      expect(entry).toBeDefined();
      expect(entry!.declineCategory).toBe('soft');
      expect(entry!.retryable).toBe(true);
    });

    it('returns undefined for unknown keys', () => {
      const map = getResponseCodeMap();
      expect(map.get('UNKNOWN:999')).toBeUndefined();
    });
  });

  describe('AVS response codes', () => {
    it('has no duplicate codes', () => {
      const codes = AVS_RESPONSE_CODES.map((a) => a.code);
      const unique = new Set(codes);
      expect(unique.size).toBe(codes.length);
    });

    it('getAvsMap builds correctly', () => {
      const map = getAvsMap();
      expect(map.size).toBe(AVS_RESPONSE_CODES.length);
    });

    it('Y = full match, pass', () => {
      const map = getAvsMap();
      const y = map.get('Y');
      expect(y).toBeDefined();
      expect(y!.addressMatch).toBe(true);
      expect(y!.zipMatch).toBe(true);
      expect(y!.pass).toBe(true);
    });

    it('N = no match, fail', () => {
      const map = getAvsMap();
      const n = map.get('N');
      expect(n).toBeDefined();
      expect(n!.addressMatch).toBe(false);
      expect(n!.zipMatch).toBe(false);
      expect(n!.pass).toBe(false);
    });

    it('A = address match only, fail', () => {
      const map = getAvsMap();
      const a = map.get('A');
      expect(a).toBeDefined();
      expect(a!.addressMatch).toBe(true);
      expect(a!.zipMatch).toBe(false);
      expect(a!.pass).toBe(false);
    });
  });

  describe('CVV response codes', () => {
    it('has no duplicate codes', () => {
      const codes = CVV_RESPONSE_CODES.map((c) => c.code);
      const unique = new Set(codes);
      expect(unique.size).toBe(codes.length);
    });

    it('getCvvMap builds correctly', () => {
      const map = getCvvMap();
      expect(map.size).toBe(CVV_RESPONSE_CODES.length);
    });

    it('M = match, pass', () => {
      const map = getCvvMap();
      const m = map.get('M');
      expect(m).toBeDefined();
      expect(m!.pass).toBe(true);
    });

    it('N = no match, fail', () => {
      const map = getCvvMap();
      const n = map.get('N');
      expect(n).toBeDefined();
      expect(n!.pass).toBe(false);
    });
  });

  describe('Visa decline categories', () => {
    it('has categories 1, 2, and 3', () => {
      expect(VISA_DECLINE_CATEGORIES[1]).toBeDefined();
      expect(VISA_DECLINE_CATEGORIES[2]).toBeDefined();
      expect(VISA_DECLINE_CATEGORIES[3]).toBeDefined();
    });

    it('category 1 is never retry', () => {
      expect(VISA_DECLINE_CATEGORIES[1].maxRetries).toBe(0);
    });

    it('categories 2 and 3 allow up to 15 retries in 30 days', () => {
      expect(VISA_DECLINE_CATEGORIES[2].maxRetries).toBe(15);
      expect(VISA_DECLINE_CATEGORIES[2].windowDays).toBe(30);
      expect(VISA_DECLINE_CATEGORIES[3].maxRetries).toBe(15);
      expect(VISA_DECLINE_CATEGORIES[3].windowDays).toBe(30);
    });
  });

  describe('Mastercard advice codes', () => {
    it('has at least 15 entries', () => {
      expect(MC_ADVICE_CODES.length).toBeGreaterThanOrEqual(15);
    });

    it('non-retryable codes include account closed and fraud', () => {
      const nonRetryable = MC_ADVICE_CODES.filter((c) => !c.retryable);
      const descriptions = nonRetryable.map((c) => c.description.toLowerCase());
      expect(descriptions.some((d) => d.includes('closed'))).toBe(true);
      expect(descriptions.some((d) => d.includes('fraud'))).toBe(true);
    });

    it('has no duplicate codes', () => {
      const codes = MC_ADVICE_CODES.map((c) => c.code);
      const unique = new Set(codes);
      expect(unique.size).toBe(codes.length);
    });
  });

  describe('display labels', () => {
    it('has a label for every DeclineCategory', () => {
      for (const cat of VALID_CATEGORIES) {
        expect(DECLINE_CATEGORY_LABELS[cat], `Missing label for ${cat}`).toBeDefined();
        expect(DECLINE_CATEGORY_LABELS[cat].length).toBeGreaterThan(0);
      }
    });

    it('has a label for every SuggestedAction', () => {
      for (const action of VALID_ACTIONS) {
        expect(SUGGESTED_ACTION_LABELS[action], `Missing label for ${action}`).toBeDefined();
      }
    });
  });
});
