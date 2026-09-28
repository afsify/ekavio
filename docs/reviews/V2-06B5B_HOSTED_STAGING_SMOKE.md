# V2-06B5B Hosted Staging Smoke

- Date: 2026-09-28
- Environment: disposable internal hosted staging
- Implementation commit: `fa685a4837988994bd7f67fd11b63b6036e5966c`
- Implementation tag: `v2-06b5b-manual-commercial-activation`
- Exact implementation CI: GitHub Actions run `36304813216`, completed successfully for the implementation commit
- Test-data prefix: `STAGING B5B`

## Deployment and migration evidence

Read-only closeout checks confirmed:

- `https://api.ekavio.afsify.com/health/live` returned HTTP 200;
- `https://api.ekavio.afsify.com/health/ready` returned HTTP 200;
- the hosted landing, login, and onboarding routes returned HTTP 200;
- deployed frontend chunks contained the accepted B5B onboarding, operator-activation, and tenant Billing behavior;
- the public commercial catalogue was reachable;
- invalid onboarding inspection reached the B5B boundary and failed safely;
- unauthenticated operator activation and tenant Billing probes were rejected;
- repository migration status, using the existing direct/session-capable staging configuration without printing its value, reported migrations 001 through 007 applied.

No provider deployment identifier was observable, so none is claimed.

## Controlled hosted B5B flow

One disposable end-to-end flow was completed with staging-only data and a previously unused phone number. The user supplied sanitized manual PASS evidence for every required step:

1. A public Request Access submission was created.
2. A platform operator reviewed and approved the request.
3. A commercial agreement was created only after approval, with the intended final plan, add-ons, billing cycle, period, and explicitly entered negotiated staging amount.
4. A manual staging payment record was accepted, and exact settlement was required before onboarding. No real funds or payment gateway were involved.
5. The one-time onboarding link was generated and shown only for the intended handoff.
6. The customer chose their own password; no default or operator-selected customer password was used.
7. Atomic provisioning created exactly one organization, one `Main` branch, one subscription, and the intended plan/add-ons/modules.
8. The customer received no platform-operator authority, and the access request became `activated` only after successful provisioning.
9. The newly onboarded customer logged in successfully.
10. Customer Billing showed the expected agreement, subscription status and period, and manual payment information, scoped only to the customer's organization.
11. Reuse of the consumed onboarding invitation was rejected safely.

No destructive hosted concurrency test was performed. Exactly-once and concurrency behavior remains covered by the accepted automated B5B suite.

## Hosted log and secret review

The manual hosted-log review passed for this flow. It found no password or password hash, raw onboarding token, Authorization or Cookie header, refresh credential, database connection string, MongoDB URI, JWT secret, or unnecessary sensitive request-body or personally identifiable data.

This record contains no phone number, password, raw onboarding token, UUID, authorization value, cookie value, database credential, or sensitive log content.

## Closeout boundary

V2-06B5B is implemented and its single controlled hosted staging smoke is verified. This remains internal disposable staging evidence, not production or real-pilot approval. Backup/restore proof and a production-grade recovery process remain **OPEN BEFORE REAL PILOT / CUSTOMER DATA**. The partial V2-06B4 gaps outside this B5B flow also remain open.

No payment gateway, recurring billing, automated renewal, Attendance cutover, Inventory cutover, Dues migration, V2-06B5C, or V2-06C work was added.
