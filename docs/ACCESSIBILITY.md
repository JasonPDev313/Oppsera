# Accessibility Standards (WCAG 2.1 Level AA)

OppsEra targets **WCAG 2.1 Level AA** compliance across all three web applications (`apps/web`, `apps/admin`, `apps/member-portal`).

## Automated Enforcement

### ESLint (`eslint-plugin-jsx-a11y`)

All WCAG-relevant rules are enabled in `eslint.config.mjs`:

| Tier | Level | Rules | Purpose |
|------|-------|-------|---------|
| **Tier 1** | `error` | `aria-props`, `aria-proptypes`, `aria-role`, `aria-unsupported-elements`, `role-has-required-aria-props`, `role-supports-aria-props`, `alt-text`, `heading-has-content`, `html-has-lang`, `iframe-has-title`, `no-distracting-elements`, `scope`, `tabindex-no-positive`, `no-access-key`, `img-redundant-alt`, `no-redundant-roles` | Correctness-critical. Bad ARIA is worse than no ARIA. |
| **Tier 2** | `warn` | `click-events-have-key-events`, `label-has-associated-control`, `no-static-element-interactions`, `no-autofocus`, `interactive-supports-focus`, and others | Important but high-volume. Fix incrementally. |

**Note:** `anchor-is-valid` is disabled because it conflicts with Next.js `<Link>`.

### Testing

- **vitest-axe** for component-level axe-core testing
- **@testing-library/react** + **@testing-library/user-event** for interaction tests
- Test setup: `apps/web/src/test/setup-a11y.ts`

## Component Patterns

### Dialogs

All modal dialogs use a consistent pattern:

```tsx
<div
  className="fixed inset-0 z-50 flex items-center justify-center"
  role="dialog"
  aria-modal="true"
  aria-labelledby="my-dialog-title"
>
  {/* Backdrop */}
  <div className="absolute inset-0 bg-black/40" onClick={onClose} />

  {/* Panel */}
  <div className="relative ...">
    <h2 id="my-dialog-title">Dialog Title</h2>
    <button aria-label="Close" onClick={onClose}>
      <X className="h-5 w-5" aria-hidden="true" />
    </button>
    {/* Content */}
  </div>
</div>
```

Key requirements:
- `role="dialog"` (or `role="alertdialog"` for conflicts/warnings)
- `aria-modal="true"`
- `aria-labelledby` pointing to the title element's `id`
- Use `aria-label` instead of `aria-labelledby` when the title is dynamic
- Close button must have `aria-label="Close"`
- Decorative icons must have `aria-hidden="true"`

### Focus Trap (`useFocusTrap`)

```tsx
import { useFocusTrap } from '@/lib/focus-trap';

function MyDialog({ open, onClose }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open);

  return <div ref={ref}>...</div>;
}
```

Features:
- Records and restores previously focused element
- Wraps Tab/Shift+Tab at boundaries
- Handles nested traps (stack-based)
- MutationObserver for dynamically added content

### Dialog A11y Hook (`useDialogA11y`)

```tsx
import { useDialogA11y } from '@/lib/dialog-a11y';

function MyDialog({ open, onClose }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogA11y(ref, open, { onClose, labelledBy: 'my-dialog-title' });

  return <div ref={ref}>...</div>;
}
```

Applies `role`, `aria-modal`, `aria-labelledby`, Escape key handling, focus trap, and `aria-hidden` on sibling elements.

### Live Region Announcer

```tsx
import { useLiveAnnouncer } from '@/lib/live-region';

function MyComponent() {
  const announce = useLiveAnnouncer();
  // announce('Item added to cart');           // polite
  // announce('Error occurred', 'assertive');  // urgent
}
```

### Form Fields

Use `FormField` for automatic label-input association:

```tsx
<FormField label="Email" error={errors.email} required>
  <input type="email" ... />
</FormField>
```

`FormField` automatically:
- Generates a stable `id` via `useId()`
- Sets `htmlFor` on the label
- Adds `aria-invalid` when there's an error
- Adds `aria-describedby` linking the input to the error message
- Adds `aria-required` from the `required` prop
- Error messages have `role="alert"`

### Select Component

The custom `Select` component implements full ARIA combobox pattern:
- Trigger: `role="combobox"`, `aria-expanded`, `aria-haspopup="listbox"`, `aria-controls`
- Dropdown: `role="listbox"` with stable `id`
- Options: `role="option"`, `aria-selected`

### Toast Notifications

```tsx
<div role="status" aria-live="polite" aria-atomic="true">
  <span className="sr-only">{prefix}:</span>
  {message}
</div>
```

- `role="status"` with `aria-live="polite"`
- Screen-reader-only prefix text: "Success:", "Error:", "Info:"
- Dismiss button has `aria-label="Dismiss notification"`

### Data Tables

- `scope="col"` on header `<th>` elements
- Optional `caption` prop for table description
- Clickable rows: `tabIndex={0}` + `onKeyDown` for Enter/Space
- `aria-sort` on sortable column headers
- `aria-busy="true"` during loading state

## Icon Guidelines

### Decorative Icons (next to text)

Always add `aria-hidden="true"`:

```tsx
<button>
  <Plus className="h-4 w-4" aria-hidden="true" />
  Add Item
</button>
```

### Icon-Only Buttons

Add `aria-label` to the button (NOT `aria-hidden` on the icon):

```tsx
<button aria-label="Close">
  <X className="h-5 w-5" />
</button>
```

### Why?

Lucide-react v0.468.0 does **not** set `aria-hidden` by default on SVG elements. Without it, screen readers attempt to read SVG content, creating noise.

## Keyboard Navigation

### Skip Link

All three apps include a skip-to-content link as the first focusable element:

```html
<a href="#main-content" className="skip-link">Skip to main content</a>
```

Styled off-screen by default, visible on focus (`:focus-visible`).

### Navigation

- `aria-label="Main navigation"` / `"Admin navigation"` / `"Portal navigation"` on `<nav>`
- `aria-current="page"` on active links
- `aria-expanded` on collapsible sidebar sections
- `aria-hidden="true"` on decorative nav icons

### Focus Visible

Global `:focus-visible` outline using the design system's ring color:

```css
:focus-visible {
  outline: 2px solid var(--sem-ring);
  outline-offset: 2px;
}
```

## Reduced Motion

All three apps respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

## Remaining Work

### High-Volume Lint Warnings (Tier 2)

These rules are `warn` level and should be fixed incrementally:

| Rule | Count | Fix |
|------|-------|-----|
| `label-has-associated-control` | ~519 | Use `FormField` component or add `htmlFor` |
| `no-static-element-interactions` | ~167 | Use `<button>` or add `role="button"` + keyboard handler |
| `click-events-have-key-events` | ~162 | Add `onKeyDown` with Enter/Space handling |
| `no-autofocus` | ~54 | Remove `autoFocus` except on dialog first fields |

### Decorative Icons

~460 remaining files have Lucide icons without `aria-hidden="true"`. The top 20 highest-impact files have been fixed. Fix remaining files incrementally as they are touched.

### Color Contrast

Use the existing `contrast.ts` utility for systematic text/background checks in both light and dark modes. Opacity-based colors (e.g., `bg-red-500/10 text-red-500`) generally maintain good contrast ratios.

## Development Guidelines

1. **New dialogs**: Always use `useDialogA11y` or apply the manual pattern (role + aria-modal + aria-labelledby + focus trap)
2. **New forms**: Always use `FormField` for label association
3. **New buttons**: If icon-only, add `aria-label`. If icon+text, add `aria-hidden="true"` to the icon
4. **New pages**: Ensure `<h1>` exists, heading hierarchy is correct
5. **Loading states**: Use `role="status"` and `aria-busy="true"`
6. **Error states**: Use `role="alert"` on error messages
7. **Run `pnpm lint`** before committing — Tier 1 rules are `error` level and will fail CI
