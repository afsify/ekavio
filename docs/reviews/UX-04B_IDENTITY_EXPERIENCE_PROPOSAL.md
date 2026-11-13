# UX-04B identity experience — proposal only

Date: 2026-11-13. Source baseline: UX-03 `a0627cd93ece9d7a634785bbc81d23f9fc4bd49c`, inspected during UX-04A. **Not implemented or approved by this document.**

## Existing contracts inspected

- `frontend/src/pages/Login.tsx`: one Phone or email identifier, unchanged password login, username autocomplete and explicit errors. The account-ready notification currently directs the owner to phone sign-in.
- `backend/src/postgres/identityRepository.ts`: email lookup requires a verified email identity. An email entered into a form is not sufficient authority.
- `frontend/src/pages/Identity/EmailSettings.tsx`: separate pending/verified email states, resend, disabled-delivery explanation; phone login remains available.
- `frontend/src/pages/Identity/AccountActionPage.tsx` and `backend/src/services/identityAccountService.ts`: generic forgot-password response, expiring single-use actions, fragment token removal, new-password confirmation, explicit existing-account invitation acceptance. Manually handed invitations do not automatically verify an email identity.
- `frontend/src/pages/Onboarding/OnboardingPage.tsx`: approved one-time commercial onboarding, optional recovery email, password chosen by the customer, phone sign-in followed by Settings verification. No automatic purchase or public operator creation.
- `backend/src/middlewares/registrationAvailability.ts`: public organization registration is unavailable in production. `backend/src/postgres/accountRepository.ts` creates ordinary tenant identities without platform privileges.

## Smallest proposed sequence, requiring separate owner approval

1. **Login clarity:** lead with “Email or phone” language and explain that email must be verified; preserve the single existing identifier API and phone-compatible text input. Do not use an email-only HTML validator that blocks legacy phone accounts. Preserve generic credential errors, rate limits, cancellation and session recovery.
2. **Verification clarity:** explain pending versus verified identity in onboarding completion and Settings. Keep phone-only onboarding functional. Email-first *onboarding authority* would require a separately reviewed protocol/backend change; do not promise email sign-in immediately after entering an unverified address.
3. **Invitation clarity:** show the canonical organization and invited name only after inspection. Clearly distinguish choosing a password for a new account from signing into the exact existing invited account. Preserve token privacy, expiry, single use, assigned role/branch restrictions and the explicit acceptance action.
4. **Recovery clarity:** consistent headings, input descriptions, submit/loading/error states and safe “request another link” guidance. Keep the same non-enumerating message for unknown accounts; do not reveal whether an account or mailbox exists. No fallback default passwords, security-question bypass or broad refresh replay window.
5. **Operator separation:** explanatory copy and permission-aware destinations only. Tenant roles must never imply platform-operator authority. No new public operator registration, credentials, privilege selector or special authentication bypass.

## Acceptance and boundaries

Use synthetic fixtures to test verified email, legacy phone, unverified email rejection, disabled email delivery, expired/consumed actions, existing-account mismatch, logout/session revocation and tenant/operator separation. Review 320/390/768/1440px in Light/Dark/System, focus/keyboard, labels and text contrast. Preserve current auth, password, commercial and RBAC contracts. Any new backend/schema/email-provider behavior needs separate scope and approval.

UX-04A changes no identity/authentication source and executes no email or identity provisioning. No hosted evidence is established by this proposal. **NO-GO FOR REAL CUSTOMER DATA; Render Free is staging-only.**
