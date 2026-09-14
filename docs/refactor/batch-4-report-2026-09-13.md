# Batch 4 Report

Date: 2026-09-13

Conclusion: PASS. The independent word-book learning domain, frontend domain boundary, migration round-trip, concurrency controls, and full isolated PostgreSQL gate all pass. Batch 4 is accepted; Batch 5 may begin using the frozen R-001/R-002 decisions below.

## Whitelist

Backend: word-book learning models/schemas/router/service, application router registration, the new word-book migration, and word-book API/PostgreSQL tests.

Frontend: `utils/api/wordbooks.js`, `utils/api/mappers.js`, and `tests/api-foundation.test.js`.

No formal page layout, demo page, demo store, private project config, existing Review state machine, production database, or unrelated user files were changed for Batch 4.

## Implemented

- Added `WordBookLearningProfile` with a database-unique `(user_id, wordbook_id)` identity, start/access timestamps, and a stable continue position.
- Added `WordBookEntryProgress` with database-unique `(profile_id, material_item_id)` identity and independent `learning`/`learned` state. Starting a book creates neither entry-progress rows nor Cards.
- Added authenticated list, detail, start/continue, paginated entries, progress update, and single-entry add-to-library endpoints under `/api/wordbooks`.
- Limited the launch catalog to CET4, CET6, postgraduate, IELTS, and TOEFL. Every DTO item count is queried from active persisted entries rather than copied from display metadata.
- Added per-user/book PostgreSQL advisory locking and in-process locking for concurrent start/continue and progress updates. Progress writes reuse `ClientAction`, persist exact replay responses, and reject idempotency-key reuse with different payloads.
- Added single-entry add-to-library through the Batch 2 PersonalCard contract with `add_channel=wordbook`, source book/item references, encounter data, normalized-content deduplication, and no progress mutation.
- Added migration `l6m7n8o9p0q1_add_wordbook_learning_domain.py` with complete downgrade support.
- Added frontend mappers and API methods that keep word-book progress state separate from `inLibrary` PersonalCard membership.
- Intentionally did not add whole-book add or stop-learning actions.

## Verification

- Focused backend word-book/discovery/Card/import contracts: `49 passed`.
- Word-book API contract suite: `4 passed`.
- Frontend syntax and focused contract checks: passed.
- Frontend full tests: `47 passed, 16 skipped`; skips are the existing real-run evidence scenarios.
- Alembic revision discovery: `l6m7n8o9p0q1 (head)`.
- Isolated PostgreSQL migration round-trip: upgrade to `l6m7n8o9p0q1`, downgrade to `k5l6m7n8o9p0`, and re-upgrade to head all passed.
- PostgreSQL word-book catalog and concurrency tests: `2 passed` after importing 50 items per launch book in the migration test database.
- Full isolated PostgreSQL gate: `500 passed, 19 skipped, 3 deselected, 12 warnings, 34 subtests passed in 43.40s` after importing 500 active entries per launch book.
- Repeated/concurrent start, same-action progress replay, concurrent add-to-library, pagination, learned counts, item counts, cross-user isolation, and progress/Card independence have PostgreSQL or API contract coverage.
- `git diff --check`: passed in both repositories.
- Both isolated databases were dropped after verification. The configured formal database `english_analyzer` was not migrated or written by Batch 4 database tests.

## Frozen R-001/R-002 for Batch 5

- R-001: the first wrong answer stays on the current question and shows an example; the second wrong answer transitions to detail after about 150 ms; returning restores the same session/current item; only a later correct answer advances. Both the first and second wrong answers immediately write `ReviewAnswerLog`, and every answer updates FSRS.
- R-002: review batch sizes remain `5 / 10 / 15`.

## Next gate

Batch 4 is accepted. Batch 5 may implement the explicit review state machine and the two isolated review domains using the frozen decisions above. Historical snapshots must remain immutable, and production database migration remains outside the batch.
