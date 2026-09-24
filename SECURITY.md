# Security policy

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/LeulTew/play-100/security/advisories/new).
Do not disclose vulnerabilities, credentials or private account data in public
issues. Ordinary non-security bugs can use the repository's issue tracker.

## Scope

Reports are welcome for the maintained Play 100 source and its current public
deployment, including:

- The website's account, sharing, publishing and local-data behavior.
- The `/api` functions and their request, response and resource boundaries.
- Firestore authorization, validation and data-lifecycle rules.
- PWA installation, service-worker updates and cache privacy.
- Reachable dependency vulnerabilities in runtime, server, build or CI paths.

Third-party services, infrastructure and unrelated repositories are outside
this project's control; report their defects to their owners. A flaw in how
Play 100 integrates a service is still in scope. Cosmetic issues, unsupported
feature requests and dependency-version findings without a demonstrated
affected path are not, by themselves, proof of a vulnerability.

Use your own test accounts and the smallest safe reproduction. Do not access
another person's data, exhaust service quotas, spam reports or invitations,
attempt social engineering, or disrupt the public service. This policy does
not authorize testing third-party systems.

## What to include

Provide the affected route/component and deployment ID or source commit if
known, reproduction steps, expected versus observed behavior, and the potential
security impact. Include the browser/environment and a minimal proof using
synthetic data. Redact credentials, tokens, email addresses and other private
details from logs or screenshots; do not collect unrelated user data.

## Handling and dependency triage

Reports are handled on a best-effort basis, with no promised response or
resolution times. Maintainers may ask for clarification or a safer reproduction
and coordinate disclosure through the private report.

Dependency advisories are assessed for reachability, including build and CI
execution. Fix reachable advisories. Dismiss an advisory as `not_used` only with
an evidence comment identifying the package/version and why the affected path
is not used. Re-evaluate that decision whenever the package updates; a prior
dismissal is not a permanent exemption or a reason to weaken scanning rules.

See [security boundaries and current release gates](docs/security.md) and the
[release, rollback and repair runbook](docs/security-release-runbook.md) for
the implementation's limits and operator responsibilities.
