# EkaVio development

- Treat accepted source, ADRs, source-controlled migrations and CI as authoritative.
- Preserve the React, TypeScript and Vite PWA frontend and the Node.js, Express and TypeScript backend. PostgreSQL is the runtime authority. Use MongoDB only for explicit legacy compatibility or archive workflows.
- Enforce organization membership, branch scope, RBAC and commercial entitlements independently on the server.
- Preserve exact monetary arithmetic, idempotency, append-only history and canonical server pagination.
- Use local synthetic data and disable external email delivery. Verify database destinations before migrations or integration tests. Keep credentials and secrets out of source, logs and shared artifacts.
- Inspect Git status before edits. Work on isolated feature branches and preserve historical worktrees.
- Run relevant lint, typecheck, build, unit, integration and browser checks. Require passing CI on the exact candidate commit before acceptance.
- Obtain explicit authorization before GitHub publication, merges, deployments or hosted changes.
- Customer and pilot use remains **NO-GO FOR REAL CUSTOMER DATA**.
