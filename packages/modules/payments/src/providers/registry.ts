import type { PaymentProvider, ProviderCredentials } from './interface';
import { CardPointeProvider } from './cardpointe/provider';

type ProviderFactory = (credentials: ProviderCredentials, merchantId: string) => PaymentProvider;

/**
 * Registry of payment provider factories.
 * Maps provider codes to factory functions that create provider instances.
 */
class ProviderRegistry {
  private factories = new Map<string, ProviderFactory>();

  register(code: string, factory: ProviderFactory): void {
    this.factories.set(code, factory);
  }

  get(code: string, credentials: ProviderCredentials, merchantId: string): PaymentProvider {
    const factory = this.factories.get(code);
    if (!factory) {
      throw new Error(`Unknown payment provider: ${code}. Available: ${[...this.factories.keys()].join(', ')}`);
    }
    return factory(credentials, merchantId);
  }

  has(code: string): boolean {
    return this.factories.has(code);
  }

  listCodes(): string[] {
    return [...this.factories.keys()];
  }
}

// Singleton instance with CardPointe pre-registered
export const providerRegistry = new ProviderRegistry();

providerRegistry.register('cardpointe', (credentials, merchantId) => {
  return new CardPointeProvider(credentials, merchantId);
});
