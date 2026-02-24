import { describe, it, expect } from 'vitest';
import { interpretResponse, type InterpretInput } from '../services/response-interpreter';

function makeInput(overrides: Partial<InterpretInput> = {}): InterpretInput {
  return {
    responseCode: null,
    responseText: null,
    respstat: null,
    avsResponse: null,
    cvvResponse: null,
    rawResponse: null,
    ...overrides,
  };
}

describe('response interpreter', () => {
  // ── PPS code lookups ──────────────────────────────────────────

  describe('PPS codes', () => {
    it('interprets PPS:00 as approved', () => {
      const result = interpretResponse(makeInput({
        responseCode: '00',
        respstat: 'A',
        rawResponse: { respproc: 'PPS' },
      }));
      expect(result.declineCategory).toBe('approved');
      expect(result.retryable).toBe(false);
      expect(result.suggestedAction).toBe('none');
      expect(result.processor).toBe('PPS');
    });

    it('interprets PPS:11 as invalid card (data_fix)', () => {
      const result = interpretResponse(makeInput({
        responseCode: '11',
        respstat: 'C',
        rawResponse: { respproc: 'PPS' },
      }));
      expect(result.declineCategory).toBe('data_fix');
      expect(result.suggestedAction).toBe('fix_and_retry');
      expect(result.retryable).toBe(true);
    });

    it('interprets PPS:16 as expired card', () => {
      const result = interpretResponse(makeInput({
        responseCode: '16',
        respstat: 'C',
        rawResponse: { respproc: 'PPS' },
      }));
      expect(result.declineCategory).toBe('data_fix');
      expect(result.suggestedAction).toBe('try_different_card');
      expect(result.retryable).toBe(false);
    });

    it('interprets PPS:21 as config error', () => {
      const result = interpretResponse(makeInput({
        responseCode: '21',
        respstat: 'C',
        rawResponse: { respproc: 'PPS' },
      }));
      expect(result.declineCategory).toBe('config_error');
      expect(result.suggestedAction).toBe('contact_support');
      expect(result.retryable).toBe(false);
    });

    it('interprets PPS:37 as CVV mismatch (data_fix)', () => {
      const result = interpretResponse(makeInput({
        responseCode: '37',
        respstat: 'C',
        rawResponse: { respproc: 'PPS' },
      }));
      expect(result.declineCategory).toBe('data_fix');
      expect(result.suggestedAction).toBe('fix_and_retry');
      expect(result.retryable).toBe(true);
    });

    it('interprets PPS:61 as network error (line down)', () => {
      const result = interpretResponse(makeInput({
        responseCode: '61',
        respstat: 'B',
        rawResponse: { respproc: 'PPS' },
      }));
      expect(result.declineCategory).toBe('network_error');
      expect(result.suggestedAction).toBe('try_again');
      expect(result.retryable).toBe(true);
    });

    it('interprets PPS:62 as network error (timeout)', () => {
      const result = interpretResponse(makeInput({
        responseCode: '62',
        respstat: 'B',
        rawResponse: { respproc: 'PPS' },
      }));
      expect(result.declineCategory).toBe('network_error');
      expect(result.retryable).toBe(true);
    });

    it('interprets PPS:98 as invalid token (data_fix)', () => {
      const result = interpretResponse(makeInput({
        responseCode: '98',
        respstat: 'C',
        rawResponse: { respproc: 'PPS' },
      }));
      expect(result.declineCategory).toBe('data_fix');
      expect(result.retryable).toBe(true);
    });

    it('interprets PPS:99 as invalid card (not retryable)', () => {
      const result = interpretResponse(makeInput({
        responseCode: '99',
        respstat: 'C',
        rawResponse: { respproc: 'PPS' },
      }));
      expect(result.declineCategory).toBe('data_fix');
      expect(result.suggestedAction).toBe('try_different_card');
      expect(result.retryable).toBe(false);
    });
  });

  // ── RPCT code lookups ─────────────────────────────────────────

  describe('RPCT codes', () => {
    it('interprets RPCT:000 as approved', () => {
      const result = interpretResponse(makeInput({
        responseCode: '000',
        respstat: 'A',
        rawResponse: { respproc: 'RPCT' },
      }));
      expect(result.declineCategory).toBe('approved');
      expect(result.retryable).toBe(false);
    });

    it('interprets RPCT:100 as hard decline (do not honor)', () => {
      const result = interpretResponse(makeInput({
        responseCode: '100',
        respstat: 'C',
        rawResponse: { respproc: 'RPCT' },
      }));
      expect(result.declineCategory).toBe('hard');
      expect(result.suggestedAction).toBe('try_different_card');
      expect(result.retryable).toBe(false);
    });

    it('interprets RPCT:116 as soft decline (insufficient funds)', () => {
      const result = interpretResponse(makeInput({
        responseCode: '116',
        respstat: 'C',
        rawResponse: { respproc: 'RPCT' },
      }));
      expect(result.declineCategory).toBe('soft');
      expect(result.suggestedAction).toBe('retry_later');
      expect(result.retryable).toBe(true);
    });

    it('interprets RPCT:208 as fraud (lost card)', () => {
      const result = interpretResponse(makeInput({
        responseCode: '208',
        respstat: 'C',
        rawResponse: { respproc: 'RPCT' },
      }));
      expect(result.declineCategory).toBe('fraud');
      expect(result.suggestedAction).toBe('contact_issuer');
      expect(result.retryable).toBe(false);
    });

    it('interprets RPCT:505 as soft decline (retry)', () => {
      const result = interpretResponse(makeInput({
        responseCode: '505',
        respstat: 'B',
        rawResponse: { respproc: 'RPCT' },
      }));
      expect(result.declineCategory).toBe('soft');
      expect(result.suggestedAction).toBe('try_again');
      expect(result.retryable).toBe(true);
    });

    it('interprets RPCT:911 as network error (issuer timeout)', () => {
      const result = interpretResponse(makeInput({
        responseCode: '911',
        respstat: 'B',
        rawResponse: { respproc: 'RPCT' },
      }));
      expect(result.declineCategory).toBe('network_error');
      expect(result.retryable).toBe(true);
    });

    it('interprets RPCT:913 as duplicate transaction', () => {
      const result = interpretResponse(makeInput({
        responseCode: '913',
        respstat: 'C',
        rawResponse: { respproc: 'RPCT' },
      }));
      expect(result.declineCategory).toBe('hard');
      expect(result.retryable).toBe(false);
    });
  });

  // ── PPS fallback (no processor in response) ───────────────────

  describe('PPS fallback', () => {
    it('falls back to PPS code when no processor is present', () => {
      const result = interpretResponse(makeInput({
        responseCode: '11',
        respstat: 'C',
        rawResponse: {},
      }));
      expect(result.declineCategory).toBe('data_fix');
      expect(result.processor).toBeNull();
    });
  });

  // ── respstat fallback (unknown codes) ─────────────────────────

  describe('respstat fallback for unknown codes', () => {
    it('respstat A → approved', () => {
      const result = interpretResponse(makeInput({
        responseCode: '999',
        respstat: 'A',
        rawResponse: { respproc: 'UNKNOWN' },
      }));
      expect(result.declineCategory).toBe('approved');
      expect(result.retryable).toBe(false);
    });

    it('respstat B → soft decline', () => {
      const result = interpretResponse(makeInput({
        responseCode: '999',
        respstat: 'B',
        rawResponse: { respproc: 'UNKNOWN' },
      }));
      expect(result.declineCategory).toBe('soft');
      expect(result.retryable).toBe(true);
      expect(result.suggestedAction).toBe('retry_later');
    });

    it('respstat C → hard decline', () => {
      const result = interpretResponse(makeInput({
        responseCode: '999',
        respstat: 'C',
        rawResponse: { respproc: 'UNKNOWN' },
      }));
      expect(result.declineCategory).toBe('hard');
      expect(result.retryable).toBe(false);
      expect(result.suggestedAction).toBe('try_different_card');
    });

    it('no respstat → network_error default', () => {
      const result = interpretResponse(makeInput({
        responseCode: '999',
        respstat: null,
        rawResponse: { respproc: 'UNKNOWN' },
      }));
      expect(result.declineCategory).toBe('network_error');
      expect(result.retryable).toBe(true);
      expect(result.suggestedAction).toBe('try_again');
    });
  });

  // ── AVS interpretation ────────────────────────────────────────

  describe('AVS interpretation', () => {
    it('interprets Y as pass', () => {
      const result = interpretResponse(makeInput({ avsResponse: 'Y' }));
      expect(result.avsResult).not.toBeNull();
      expect(result.avsResult!.pass).toBe(true);
      expect(result.avsResult!.addressMatch).toBe(true);
      expect(result.avsResult!.zipMatch).toBe(true);
    });

    it('interprets N as fail', () => {
      const result = interpretResponse(makeInput({ avsResponse: 'N' }));
      expect(result.avsResult).not.toBeNull();
      expect(result.avsResult!.pass).toBe(false);
    });

    it('interprets A as partial (address only)', () => {
      const result = interpretResponse(makeInput({ avsResponse: 'A' }));
      expect(result.avsResult).not.toBeNull();
      expect(result.avsResult!.addressMatch).toBe(true);
      expect(result.avsResult!.zipMatch).toBe(false);
      expect(result.avsResult!.pass).toBe(false);
    });

    it('interprets Z as partial (zip only)', () => {
      const result = interpretResponse(makeInput({ avsResponse: 'Z' }));
      expect(result.avsResult).not.toBeNull();
      expect(result.avsResult!.addressMatch).toBe(false);
      expect(result.avsResult!.zipMatch).toBe(true);
      expect(result.avsResult!.pass).toBe(false);
    });

    it('returns null for null avsResponse', () => {
      const result = interpretResponse(makeInput({ avsResponse: null }));
      expect(result.avsResult).toBeNull();
    });

    it('returns null for unknown AVS code', () => {
      const result = interpretResponse(makeInput({ avsResponse: 'Q' }));
      expect(result.avsResult).toBeNull();
    });
  });

  // ── CVV interpretation ────────────────────────────────────────

  describe('CVV interpretation', () => {
    it('interprets M as pass', () => {
      const result = interpretResponse(makeInput({ cvvResponse: 'M' }));
      expect(result.cvvResult).not.toBeNull();
      expect(result.cvvResult!.pass).toBe(true);
    });

    it('interprets N as fail', () => {
      const result = interpretResponse(makeInput({ cvvResponse: 'N' }));
      expect(result.cvvResult).not.toBeNull();
      expect(result.cvvResult!.pass).toBe(false);
    });

    it('returns null for null cvvResponse', () => {
      const result = interpretResponse(makeInput({ cvvResponse: null }));
      expect(result.cvvResult).toBeNull();
    });
  });

  // ── Edge cases ────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles null/empty input gracefully', () => {
      const result = interpretResponse(makeInput());
      expect(result.declineCategory).toBe('network_error');
      expect(result.retryable).toBe(true);
      expect(result.avsResult).toBeNull();
      expect(result.cvvResult).toBeNull();
      expect(result.processor).toBeNull();
      expect(result.visaDeclineCategory).toBeNull();
      expect(result.mcAdviceCode).toBeNull();
    });

    it('handles whitespace in response code', () => {
      const result = interpretResponse(makeInput({
        responseCode: ' 00 ',
        respstat: 'A',
        rawResponse: { respproc: 'PPS' },
      }));
      expect(result.declineCategory).toBe('approved');
    });

    it('handles empty string response code', () => {
      const result = interpretResponse(makeInput({
        responseCode: '',
        respstat: 'C',
        rawResponse: { respproc: 'PPS' },
      }));
      // Empty code falls through to respstat fallback
      expect(result.declineCategory).toBe('hard');
    });

    it('extracts respstat from rawResponse when not provided directly', () => {
      const result = interpretResponse(makeInput({
        responseCode: '999',
        respstat: null,
        rawResponse: { respproc: 'UNKNOWN', respstat: 'B' },
      }));
      expect(result.declineCategory).toBe('soft');
    });
  });

  // ── Visa decline category extraction ──────────────────────────

  describe('Visa decline category extraction', () => {
    it('extracts numeric declineCategory from rawResponse', () => {
      const result = interpretResponse(makeInput({
        rawResponse: { declineCategory: 1 },
      }));
      expect(result.visaDeclineCategory).toBe(1);
    });

    it('extracts string declineCategory from rawResponse', () => {
      const result = interpretResponse(makeInput({
        rawResponse: { declineCategory: '2' },
      }));
      expect(result.visaDeclineCategory).toBe(2);
    });

    it('returns null for missing declineCategory', () => {
      const result = interpretResponse(makeInput({
        rawResponse: {},
      }));
      expect(result.visaDeclineCategory).toBeNull();
    });
  });

  // ── MC advice code extraction ─────────────────────────────────

  describe('MC advice code extraction', () => {
    it('extracts merchAdviceCode from rawResponse', () => {
      const result = interpretResponse(makeInput({
        rawResponse: { merchAdviceCode: '03' },
      }));
      expect(result.mcAdviceCode).toBe('03');
    });

    it('extracts lowercase key variant', () => {
      const result = interpretResponse(makeInput({
        rawResponse: { merchadvicecode: '06' },
      }));
      expect(result.mcAdviceCode).toBe('06');
    });

    it('returns null for missing advice code', () => {
      const result = interpretResponse(makeInput({
        rawResponse: {},
      }));
      expect(result.mcAdviceCode).toBeNull();
    });
  });

  // ── Operator message ──────────────────────────────────────────

  describe('operator message', () => {
    it('includes category label', () => {
      const result = interpretResponse(makeInput({
        responseCode: '11',
        respstat: 'C',
        rawResponse: { respproc: 'PPS' },
      }));
      expect(result.operatorMessage).toContain('[Data Issue]');
    });

    it('includes processor:code', () => {
      const result = interpretResponse(makeInput({
        responseCode: '116',
        responseText: 'Not sufficient funds',
        rawResponse: { respproc: 'RPCT' },
      }));
      expect(result.operatorMessage).toContain('Code: RPCT:116');
      expect(result.operatorMessage).toContain('Not sufficient funds');
    });

    it('includes AVS failure details', () => {
      const result = interpretResponse(makeInput({
        responseCode: '00',
        respstat: 'A',
        avsResponse: 'N',
        rawResponse: { respproc: 'PPS' },
      }));
      expect(result.operatorMessage).toContain('AVS:');
    });

    it('includes CVV failure details', () => {
      const result = interpretResponse(makeInput({
        responseCode: '00',
        respstat: 'A',
        cvvResponse: 'N',
        rawResponse: { respproc: 'PPS' },
      }));
      expect(result.operatorMessage).toContain('CVV:');
    });
  });

  // ── User message safety ───────────────────────────────────────

  describe('user message safety', () => {
    it('never contains raw codes for PPS declines', () => {
      const codes = ['11', '16', '21', '37', '61', '98', '99'];
      for (const code of codes) {
        const result = interpretResponse(makeInput({
          responseCode: code,
          respstat: 'C',
          rawResponse: { respproc: 'PPS' },
        }));
        expect(result.userMessage).not.toContain('PPS');
        expect(result.userMessage).not.toContain(`code ${code}`);
      }
    });

    it('never contains system internals for RPCT declines', () => {
      const codes = ['100', '116', '208', '505', '913'];
      for (const code of codes) {
        const result = interpretResponse(makeInput({
          responseCode: code,
          respstat: 'C',
          rawResponse: { respproc: 'RPCT' },
        }));
        expect(result.userMessage).not.toContain('RPCT');
        expect(result.userMessage).not.toContain('respstat');
        expect(result.userMessage).not.toContain('CardPointe');
      }
    });
  });
});
