## Summary

<!-- 1-3 bullet points describing what this PR does and why -->

## Architecture Checklist

<!-- Check all that apply. Leave unchecked items — they help reviewers focus. -->

- [ ] No module-to-module imports introduced (`packages/modules/X` does not import `@oppsera/module-Y`)
- [ ] No direct DB writes to tables owned by another module from app code
- [ ] No direct consumer invocation from commands (events go through `publishWithOutbox`)
- [ ] If this is a sync cross-module exception, it is tracked in `docs/conventions/module-architecture.md`
- [ ] New events follow `{domain}.{entity}.{action}.v{N}` naming convention
- [ ] Event payloads are self-sufficient (consumers don't need to query the source module)
- [ ] New consumers are idempotent and registered with a stable name in `instrumentation.ts`

## Test Plan

<!-- How was this tested? Unit tests, manual, etc. -->
