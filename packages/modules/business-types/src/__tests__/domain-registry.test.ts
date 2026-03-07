import { describe, it, expect } from 'vitest';
import {
  registerDomain,
  getRegisteredDomains,
  getDomain,
} from '../provisioning/domain-registry';
import type { BlueprintDomainExecutor } from '../provisioning/domain-registry';

// Create test executors to verify the registry mechanics
const mockExecutor = (key: string, critical: boolean): BlueprintDomainExecutor => ({
  domainKey: key,
  isCritical: critical,
  validate: async () => ({ isValid: true, errors: [] }),
  provision: async () => ({ success: true, itemsProvisioned: 0, details: {} }),
  snapshot: async () => ({}),
});

describe('domain-registry', () => {
  it('registers and retrieves domain executors', () => {
    registerDomain(mockExecutor('test_domain_a', true));
    const domain = getDomain('test_domain_a');
    expect(domain).toBeDefined();
    expect(domain!.domainKey).toBe('test_domain_a');
    expect(domain!.isCritical).toBe(true);
  });

  it('returns undefined for unregistered domain', () => {
    expect(getDomain('nonexistent_test')).toBeUndefined();
  });

  it('getRegisteredDomains returns all registered domains', () => {
    registerDomain(mockExecutor('test_domain_b', false));
    const domains = getRegisteredDomains();
    const keys = domains.map((d) => d.domainKey);
    expect(keys).toContain('test_domain_a');
    expect(keys).toContain('test_domain_b');
  });

  it('maintains insertion order', () => {
    const domains = getRegisteredDomains();
    const keys = domains.map((d) => d.domainKey);
    const aIndex = keys.indexOf('test_domain_a');
    const bIndex = keys.indexOf('test_domain_b');
    expect(aIndex).toBeLessThan(bIndex);
  });

  it('overwrites existing domain on re-registration', () => {
    registerDomain(mockExecutor('test_domain_a', false)); // change isCritical
    const domain = getDomain('test_domain_a');
    expect(domain!.isCritical).toBe(false);
  });
});
