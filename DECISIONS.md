# DECISIONS.md

<!-- Record every non-trivial decision. Update before merge. -->

## 2026-03-23 -- Adopt Agent Flywheel Core as operating discipline

**Decision:** Implement a staged Core Flywheel rollout on Continuum Intelligence v3. Manual planner/builder/reviewer workflow first (Phase 1). Add beads and bv tooling only after the manual process proves stable (Phase 2). Defer full swarm/VPS setup until three consecutive clean shipments.

**Reason:** Ad hoc coding workflow has produced regressions (commit 58b2c99, WOW scoring divergence, shadow copy problem, Railway 502 chain). The platform ships directly to production with no staging or rollback. A disciplined plan-first, test-gated, fresh-context-review process reduces regression risk to an acceptable level for a live investment-grade product.

**Alternatives rejected:**
- Full Agent Flywheel stack from day one -- rejected due to complexity trap risk on a live codebase with no staging environment.
- Continue ad hoc with more care -- rejected because the pattern of regressions shows the current process is structurally insufficient, not just sloppily executed.
- Formal CI/CD with staging environment -- deferred, not rejected. Would require infrastructure investment. The Flywheel discipline is complementary and should be in place regardless.

**Commercial / technical trade-off:** Short-term velocity reduction (planning overhead) traded for regression elimination. The velocity cost is acceptable because one production regression costs more in user trust and recovery time than a full day of planning.

**Follow-up required:**
- Complete first pilot cycle (one bead through plan/build/review/merge).
- Hold retrospective after first merge.
- Measure: regression count, plan compliance, test compliance, review freshness.
- Decision on Phase 2 (beads + bv tooling) after three clean shipments.

---

## Prior decisions (pre-Flywheel)

See also:
- [docs/decisions/001-monolith-to-module-migration.md](docs/decisions/001-monolith-to-module-migration.md)
- [docs/decisions/002-railway-backend-ephemeral-storage.md](docs/decisions/002-railway-backend-ephemeral-storage.md)
- [docs/decisions/003-computeskewscore-neutral-convention.md](docs/decisions/003-computeskewscore-neutral-convention.md)
