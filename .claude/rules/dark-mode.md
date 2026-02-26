## Dark Mode Enforcement — MANDATORY

When writing or modifying ANY `.tsx` file in this codebase, you MUST follow these dark mode rules.
Dark mode is the DEFAULT theme. The gray scale is INVERTED. Non-gray colors are NOT inverted.

### Banned Classes → Replacements

| NEVER USE | USE INSTEAD |
|---|---|
| `bg-white` | `bg-surface` |
| `bg-{color}-50`, `bg-{color}-100` | `bg-{color}-500/10` |
| `text-gray-900`, `text-gray-800`, `text-gray-700` | `text-foreground` |
| `text-gray-500`, `text-gray-400` | `text-muted-foreground` |
| `text-{color}-800`, `text-{color}-900`, `text-{color}-700` | `text-{color}-500` or `text-{color}-400` |
| `border-gray-200`, `border-gray-300` | `border-border` |
| `border-{color}-200`, `border-{color}-300` | `border-{color}-500/30` |
| `hover:bg-gray-50`, `hover:bg-gray-100` | `hover:bg-accent` |
| `hover:bg-{color}-50`, `hover:bg-{color}-100` | `hover:bg-{color}-500/10` |
| `divide-gray-200` | `divide-border` |
| `ring-gray-300` | `ring-border` |
| `placeholder-gray-*` | `placeholder:text-muted-foreground` |
| `dark:` prefixed classes | Not supported — use opacity-based colors |

### Correct Patterns

- **Status badges**: `bg-green-500/10 text-green-500 border-green-500/30`
- **Cards/dialogs**: `bg-surface border border-border rounded-lg`
- **Form inputs**: `bg-surface border-input text-foreground placeholder:text-muted-foreground`
- **Hover states**: `hover:bg-accent` or `hover:bg-{color}-500/10`
- **Primary buttons**: `bg-indigo-600 text-white hover:bg-indigo-700` (OK — colored bg ensures contrast)

### Exceptions (OK to keep)

- `text-white` on colored buttons (bg ensures contrast)
- `bg-white` on toggle switch knobs only
- Colors inside SVG charts, Konva canvases, print-oriented receipts
- `bg-black` (stays black in both modes)

### Before Every Commit

Scan for: `bg-white`, `bg-{color}-50`, `text-{color}-800`, `border-gray-200`, `hover:bg-gray-50`, `dark:`
