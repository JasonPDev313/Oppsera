## Subagent Model Routing — Cost Optimization

When spawning subagents via the Agent tool, **default to Haiku** and only escalate when the task requires it.

### Use Haiku (`model: "haiku"`) for:
- Lint checks, type-checking, running tests
- Simple file searches (grep, glob patterns)
- Single-file code reviews or diffs
- Running CLI commands and reporting output
- Straightforward Q&A about a single file
- Formatting, renaming, or mechanical transformations

### Use Sonnet (`model: "sonnet"`) for:
- Multi-file code exploration (3+ files)
- Moderate refactors with cross-file dependencies
- Writing new test suites from scratch
- Debugging failures that require reasoning across modules
- Code review that needs architectural context

### Use Opus (`model: "opus"`) for:
- Architectural design or planning across the codebase
- Complex multi-step implementations with many moving parts
- Tasks requiring deep domain knowledge of multiple modules
- Security audits or performance analysis
- Anything where Sonnet produced an incorrect or shallow result (retry with Opus)

### Decision heuristic
1. Start with Haiku
2. If the task involves reasoning across >3 files or requires judgment calls → Sonnet
3. If the task involves architectural decisions, complex debugging, or prior Sonnet attempt failed → Opus
4. When in doubt, prefer the cheaper model — it's easy to retry with a stronger one

### Safety nets (auto-escalation)
- **Failed result → escalate**: If a Haiku subagent returns an error, incomplete result, or shallow analysis → retry with Sonnet before reporting failure
- **Input-length floor**: Tasks with large context (>3 files to read, long error logs, big diffs) → minimum Sonnet
- **Confidence-based bump**: If a task is non-trivial and the initial approach seems uncertain → bump Haiku to Sonnet proactively
- **Retry budget**: Only escalate once. If Sonnet fails, escalate to Opus. If Opus fails, report the failure — don't loop.

### Transparency requirement
When starting a task or presenting a plan, **always state which model(s) you'll use** for each step. Example:
- "I'll use **Haiku** to run lint + tests, **Sonnet** for the multi-file refactor"
- "This is straightforward — **Haiku** for everything"
- "Complex cross-module work — using **Opus** for the implementation agent"

This lets the user override before tokens are spent.
