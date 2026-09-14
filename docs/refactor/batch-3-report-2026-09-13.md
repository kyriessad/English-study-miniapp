# Batch 3 Report

Date: 2026-09-13

Conclusion: PASS. The public discovery backend contract, frontend domain boundary, migration round-trip, isolated PostgreSQL gate, and live Ollama check all pass. Batch 3 is accepted; Batch 4 may begin.

## Whitelist

Backend: discovery category data, discovery models/schemas/router/service/importer, the new discovery migration, the nested Card encounter DTO compatibility fix, and discovery/Card contract tests.

Frontend: `utils/api/discovery.js`, `utils/api/mappers.js`, and `tests/api-foundation.test.js`.

No formal page layout, demo page, demo store, private project config, Review business code, production database, or unrelated user files were changed for Batch 3.

## Implemented

- Added the frozen `life` and `reading` parent categories with all 14 Batch 0 child categories, stable ordering, and one explicit legacy-pack-to-category mapping.
- Added stable per-user daily discovery batches of exactly three distinct items using Asia/Shanghai calendar dates. A persisted batch and deterministic key keep same-day retries stable.
- Added cursor-based category browsing and per-user exposure/weak-negative interaction records with client-event idempotence.
- Added a public detail DTO whose base content stays available independently of AI status.
- Added on-demand public AI analysis with shared database cache, PostgreSQL advisory locking plus in-process locking, single-generator concurrency behavior, retryable failure state, and observable error data.
- Added public-item-to-PersonalCard creation through the Batch 2 service contract. Active duplicates reuse the existing Card, concurrent requests remain single-card, source/encounter data is preserved, and users remain isolated.
- Added migration `k5l6m7n8o9p0_add_discovery_contract.py` for categories, item ownership, daily batches, interactions, and analysis cache, including downgrade support.
- Extended the frontend discovery API and mapper boundary for categories, cursors, daily batches, public details, interactions, AI analysis, and add-to-library responses.

## Verification

- Focused backend discovery/Card/import pipelines: `54 passed`.
- Frontend syntax checks: passed for all Batch 3 JavaScript changes.
- Frontend full tests: `46 passed, 16 skipped` using `node --test tests/*.test.js`; skips are the existing real-run evidence scenarios.
- Migration round-trip on isolated PostgreSQL: clean upgrade to `k5l6m7n8o9p0`, downgrade to `j4k5l6m7n8o9`, and re-upgrade to head all passed.
- PostgreSQL discovery concurrency and idempotence tests: `3 passed`.
- Full isolated PostgreSQL gate: `494 passed, 19 skipped, 3 deselected, 12 warnings, 34 subtests passed in 41.49s`.
- Daily stability, Asia/Shanghai boundary, exact taxonomy, cursor continuity, weak-negative refresh, cross-user isolation, AI failure isolation/retry/cache, and add-to-library idempotence have contract coverage.
- Live Ollama: `/api/tags` exposed `qwen3:8b`. The first cold-start analysis exceeded the configured model timeout; the second attempt succeeded through the production analyzer and returned `provider=ollama`, `analysisModel=qwen3:8b`.
- `git diff --check`: passed in both repositories.
- Both isolated databases were dropped after verification. The configured formal database `english_analyzer` was not migrated or written by the Batch 3 database tests.

## Next gate

Batch 3 is accepted. Batch 4 may add the independent word-book learning domain. Do not implement whole-book add/stop actions, do not copy word-book progress into PersonalCard, and do not migrate the production database as part of that batch.
