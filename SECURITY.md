# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest (main) | Yes |

## Reporting a Vulnerability

If you discover a security vulnerability in OppsEra, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email security concerns to: **security@oppsera.com**

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response timeline

- **Acknowledgement**: Within 48 hours
- **Initial assessment**: Within 5 business days
- **Resolution target**: Based on severity (Critical: 7 days, High: 14 days, Medium: 30 days, Low: 90 days)

## Security Measures

- **SAST**: Semgrep scans run on every push and PR, plus weekly full scans
- **SCA**: Dependabot monitors npm and GitHub Actions dependencies
- **Scorecard**: OpenSSF Scorecard runs weekly to track supply chain security posture
- **Secrets scanning**: CI pre-flight checks scan for hardcoded tokens and tracked .env files
- **Encryption**: AES-256-GCM for field-level encryption of sensitive data at rest
- **Multi-tenancy**: Row-Level Security (RLS) + application-level tenant isolation
- **Auth**: JWT-based authentication via Supabase Auth with RBAC (6 roles, module-scoped permissions)
