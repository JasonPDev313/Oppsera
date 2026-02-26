import '@testing-library/jest-dom/vitest';
import 'vitest-axe/extend-expect';
import * as matchers from 'vitest-axe/matchers';
import { axe } from 'vitest-axe';
import { expect } from 'vitest';

// Extend vitest matchers with vitest-axe
expect.extend(matchers);

/**
 * Run axe-core accessibility checks on a rendered container.
 * Asserts zero WCAG 2.1 AA violations.
 *
 * Usage in tests:
 * ```ts
 * import { render } from '@testing-library/react';
 * import { expectNoA11yViolations } from '@/test/setup-a11y';
 *
 * it('has no a11y violations', async () => {
 *   const { container } = render(<MyComponent />);
 *   await expectNoA11yViolations(container);
 * });
 * ```
 */
export async function expectNoA11yViolations(container: HTMLElement): Promise<void> {
  const results = await axe(container, {
    rules: {
      // WCAG 2.1 AA ruleset
      region: { enabled: true },
    },
  });
  (expect(results) as any).toHaveNoViolations();
}
