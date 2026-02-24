// ── Hoisted mocks ──────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const state = {
    providerRow: null as any,
    locationCreds: null as any,
    tenantCreds: null as any,
    decryptedCredentials: { site: 'fts-uat', username: 'testuser', password: 'testpass' },
  };

  const decryptCredentials = vi.fn();

  return { state, decryptCredentials };
});

// ── vi.mock declarations ───────────────────────────────────────────
vi.mock('@oppsera/db', () => {
  const buildChain = (resolveWith: () => any) => ({
    where: vi.fn().mockReturnValue({
      limit: vi.fn(() => {
        const rows = resolveWith();
        return rows != null ? [rows] : [];
      }),
    }),
  });

  const mockTx = {
    select: vi.fn((_fields?: any) => {
      return mockTx;
    }),
    from: vi.fn((table: any) => {
      if (table === 'paymentProviders') {
        return buildChain(() => mocks.state.providerRow);
      }
      if (table === 'paymentProviderCredentials') {
        // Determine if this is a location-specific or tenant-wide query
        // The location query runs first (when locationId is provided)
        // We use the selectFields to detect the call pattern, but since both
        // credential queries use the same select fields, we track via state.
        const chain = {
          where: vi.fn((_condition: any) => {
            return {
              limit: vi.fn(() => {
                // Check if condition args include a locationId eq (not isNull)
                // In practice, we just return location creds first, then tenant creds
                const hasLocationCred = mocks.state.locationCreds;
                if (hasLocationCred) {
                  const result = [mocks.state.locationCreds];
                  // Clear so the next call (tenant-wide) returns its own value
                  mocks.state.locationCreds = null;
                  return result;
                }
                return mocks.state.tenantCreds ? [mocks.state.tenantCreds] : [];
              }),
            };
          }),
        };
        return chain;
      }
      return buildChain(() => null);
    }),
  };

  return {
    withTenant: vi.fn((_tenantId: string, fn: (...args: any[]) => any) => fn(mockTx)),
    paymentProviders: 'paymentProviders',
    paymentProviderCredentials: 'paymentProviderCredentials',
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ type: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  isNull: vi.fn((col: unknown) => ({ type: 'isNull', col })),
}));

vi.mock('../helpers/credentials', () => ({
  decryptCredentials: mocks.decryptCredentials,
}));

vi.mock('@oppsera/shared', () => ({}));

// ── Import under test (after mocks) ────────────────────────────────
import { getTokenizerConfig } from '../queries/get-tokenizer-config';

// ── Tests ──────────────────────────────────────────────────────────

describe('getTokenizerConfig', () => {
  beforeEach(() => {
    mocks.decryptCredentials.mockReset();

    // Default state: active CardPointe provider with tenant-wide credentials
    mocks.state.providerRow = {
      id: 'provider-1',
      tenantId: 'tenant-1',
      code: 'cardpointe',
      isActive: true,
      config: null,
    };
    mocks.state.locationCreds = null;
    mocks.state.tenantCreds = {
      credentialsEncrypted: 'encrypted-blob',
      isSandbox: true,
    };
    mocks.state.decryptedCredentials = {
      site: 'fts-uat',
      username: 'testuser',
      password: 'testpass',
    };

    mocks.decryptCredentials.mockImplementation(() => mocks.state.decryptedCredentials);
  });

  // ── 1. Basic config return ──────────────────────────────────────

  describe('basic config return', () => {
    it('should return providerCode from the active provider', async () => {
      const result = await getTokenizerConfig('tenant-1');
      expect(result).not.toBeNull();
      expect(result!.providerCode).toBe('cardpointe');
    });

    it('should return isSandbox from credentials row', async () => {
      mocks.state.tenantCreds = { credentialsEncrypted: 'blob', isSandbox: true };
      const result = await getTokenizerConfig('tenant-1');
      expect(result!.isSandbox).toBe(true);
    });

    it('should return isSandbox false for production credentials', async () => {
      mocks.state.tenantCreds = { credentialsEncrypted: 'blob', isSandbox: false };
      const result = await getTokenizerConfig('tenant-1');
      expect(result!.isSandbox).toBe(false);
    });

    it('should return iframe.site from decrypted credentials', async () => {
      const result = await getTokenizerConfig('tenant-1');
      expect(result!.iframe).toBeDefined();
      expect(result!.iframe!.site).toBe('fts-uat');
    });

    it('should return correct iframeUrl based on site name', async () => {
      const result = await getTokenizerConfig('tenant-1');
      expect(result!.iframe!.iframeUrl).toBe(
        'https://fts-uat.cardconnect.com/itoke/ajax-tokenizer.html',
      );
    });

    it('should build iframeUrl from a production site name', async () => {
      mocks.state.decryptedCredentials = { site: 'fts', username: 'u', password: 'p' };
      const result = await getTokenizerConfig('tenant-1');
      expect(result!.iframe!.iframeUrl).toBe(
        'https://fts.cardconnect.com/itoke/ajax-tokenizer.html',
      );
    });

    it('should call decryptCredentials with the encrypted blob', async () => {
      mocks.state.tenantCreds = { credentialsEncrypted: 'my-encrypted-blob', isSandbox: false };
      await getTokenizerConfig('tenant-1');
      expect(mocks.decryptCredentials).toHaveBeenCalledWith('my-encrypted-blob');
    });
  });

  // ── 2. Wallet flags from JSONB ──────────────────────────────────

  describe('wallet flags from JSONB config', () => {
    it('should include wallets when enableApplePay is true', async () => {
      mocks.state.providerRow = {
        ...mocks.state.providerRow,
        config: { enableApplePay: true, enableGooglePay: false },
      };
      const result = await getTokenizerConfig('tenant-1');
      expect(result!.wallets).toBeDefined();
      expect(result!.wallets!.applePay).toBe(true);
      expect(result!.wallets!.googlePay).toBe(false);
    });

    it('should include wallets when enableGooglePay is true', async () => {
      mocks.state.providerRow = {
        ...mocks.state.providerRow,
        config: {
          enableApplePay: false,
          enableGooglePay: true,
          googlePayMerchantId: 'GOOG-123',
          googlePayGatewayId: 'GW-456',
        },
      };
      const result = await getTokenizerConfig('tenant-1');
      expect(result!.wallets).toBeDefined();
      expect(result!.wallets!.googlePay).toBe(true);
      expect(result!.wallets!.googlePayMerchantId).toBe('GOOG-123');
      expect(result!.wallets!.googlePayGatewayId).toBe('GW-456');
    });

    it('should include wallets when both Apple Pay and Google Pay are enabled', async () => {
      mocks.state.providerRow = {
        ...mocks.state.providerRow,
        config: { enableApplePay: true, enableGooglePay: true },
      };
      const result = await getTokenizerConfig('tenant-1');
      expect(result!.wallets!.applePay).toBe(true);
      expect(result!.wallets!.googlePay).toBe(true);
    });

    it('should not include wallets when both flags are false', async () => {
      mocks.state.providerRow = {
        ...mocks.state.providerRow,
        config: { enableApplePay: false, enableGooglePay: false },
      };
      const result = await getTokenizerConfig('tenant-1');
      expect(result!.wallets).toBeUndefined();
    });

    it('should not include googlePayMerchantId when googlePay is false', async () => {
      mocks.state.providerRow = {
        ...mocks.state.providerRow,
        config: {
          enableApplePay: true,
          enableGooglePay: false,
          googlePayMerchantId: 'GOOG-123',
        },
      };
      const result = await getTokenizerConfig('tenant-1');
      expect(result!.wallets!.googlePayMerchantId).toBeUndefined();
    });
  });

  // ── 3. Fallback when no JSONB config ────────────────────────────

  describe('fallback when no JSONB config', () => {
    it('should default wallet flags to false when config is null', async () => {
      mocks.state.providerRow = { ...mocks.state.providerRow, config: null };
      const result = await getTokenizerConfig('tenant-1');
      // Both flags false → wallets block not included
      expect(result!.wallets).toBeUndefined();
    });

    it('should default wallet flags to false when config is empty object', async () => {
      mocks.state.providerRow = { ...mocks.state.providerRow, config: {} };
      const result = await getTokenizerConfig('tenant-1');
      expect(result!.wallets).toBeUndefined();
    });

    it('should default wallet flags to false when config has non-boolean values', async () => {
      mocks.state.providerRow = {
        ...mocks.state.providerRow,
        config: { enableApplePay: 'yes', enableGooglePay: 1 },
      };
      const result = await getTokenizerConfig('tenant-1');
      // strict === true check means non-boolean truthy values are treated as false
      expect(result!.wallets).toBeUndefined();
    });

    it('should still return iframe config when config is null', async () => {
      mocks.state.providerRow = { ...mocks.state.providerRow, config: null };
      const result = await getTokenizerConfig('tenant-1');
      expect(result).not.toBeNull();
      expect(result!.iframe).toBeDefined();
      expect(result!.iframe!.site).toBe('fts-uat');
      expect(result!.providerCode).toBe('cardpointe');
    });
  });

  // ── 4. No active provider ──────────────────────────────────────

  describe('no active provider', () => {
    it('should return null when no active provider found', async () => {
      mocks.state.providerRow = null;
      const result = await getTokenizerConfig('tenant-1');
      expect(result).toBeNull();
    });

    it('should return null when provider code is not cardpointe', async () => {
      mocks.state.providerRow = {
        ...mocks.state.providerRow,
        code: 'stripe',
      };
      const result = await getTokenizerConfig('tenant-1');
      expect(result).toBeNull();
    });
  });

  // ── 5. No credentials ─────────────────────────────────────────

  describe('no credentials', () => {
    it('should return null when no credentials found (no location, no tenant-wide)', async () => {
      mocks.state.tenantCreds = null;
      mocks.state.locationCreds = null;
      const result = await getTokenizerConfig('tenant-1');
      expect(result).toBeNull();
    });

    it('should not call decryptCredentials when no credentials exist', async () => {
      mocks.state.tenantCreds = null;
      mocks.state.locationCreds = null;
      await getTokenizerConfig('tenant-1');
      expect(mocks.decryptCredentials).not.toHaveBeenCalled();
    });
  });

  // ── 6. Location-specific credentials ───────────────────────────

  describe('location-specific credentials', () => {
    it('should use location credentials when available', async () => {
      mocks.state.locationCreds = {
        credentialsEncrypted: 'location-encrypted-blob',
        isSandbox: false,
      };
      mocks.state.tenantCreds = {
        credentialsEncrypted: 'tenant-encrypted-blob',
        isSandbox: true,
      };

      const result = await getTokenizerConfig('tenant-1', 'loc-1');

      // Location credentials were used — isSandbox should be false (from location creds)
      expect(result!.isSandbox).toBe(false);
      expect(mocks.decryptCredentials).toHaveBeenCalledWith('location-encrypted-blob');
    });

    it('should fall back to tenant-wide credentials when no location credentials', async () => {
      mocks.state.locationCreds = null;
      mocks.state.tenantCreds = {
        credentialsEncrypted: 'tenant-encrypted-blob',
        isSandbox: true,
      };

      const result = await getTokenizerConfig('tenant-1', 'loc-1');

      expect(result!.isSandbox).toBe(true);
      expect(mocks.decryptCredentials).toHaveBeenCalledWith('tenant-encrypted-blob');
    });

    it('should use tenant-wide credentials when no locationId is provided', async () => {
      mocks.state.tenantCreds = {
        credentialsEncrypted: 'tenant-blob',
        isSandbox: true,
      };

      const result = await getTokenizerConfig('tenant-1');

      expect(result).not.toBeNull();
      expect(mocks.decryptCredentials).toHaveBeenCalledWith('tenant-blob');
    });
  });
});
