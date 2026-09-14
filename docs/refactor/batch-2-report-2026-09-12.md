# Batch 2 Report

Date: 2026-09-12

Conclusion: PASS. Code, frontend contracts, and the isolated PostgreSQL migration/integration gate all pass. Batch 2 is accepted; Batch 3 may begin after user confirmation.

## Whitelist

Backend: `app/models/card.py`, `app/schemas/card.py`, `app/services/card_service.py`, the new Card migration, `tests/test_cards_api.py`, and the existing PostgreSQL integration test entry point.

Frontend: `utils/api/**`, `utils/apiClient.js`, `utils/recordStorage.js`, and `tests/api-foundation.test.js`.

No page layout, demo page, demo store, private project config, Review business code, or production database was changed.

## Implemented

- Added `participates_in_review`, `add_channel`, public material item reference, source wordbook reference, and independent `card_encounters` records.
- Added the Alembic migration `j4k5l6m7n8o9_add_personal_card_sources_and_encounters.py` with legacy-safe defaults, foreign keys, encounter index, and the active partial unique index on `(user_id, content_normalized)`.
- Preserved existing English normalization, soft-delete tombstones, version conflicts, and offline `/sync` idempotence.
- Duplicate active cards now return structured `duplicate_active_card` conflicts. Deleted cards can be re-added with a new local identity; different users remain isolated.
- Extended frontend mappers and storage payloads without removing offline create/edit/delete or pending sync behavior. Online edit/delete now carry the backend Card version.

## Verification

- Backend import and migration syntax: passed.
- Alembic revision discovery: `j4k5l6m7n8o9 (head)`.
- Card API tests: `28 passed`.
- Related Card contract tests: `106 passed`.
- Frontend full tests: `45 passed, 16 skipped` using `node --test tests/*.test.js`.
- JavaScript syntax and `git diff --check`: passed.
- Isolated PostgreSQL migration and integration gate: `488 passed, 19 skipped, 3 deselected, 12 warnings, 34 subtests passed in 82.88s`.
- The existing script created `english_analyzer_phase1_pytest`, migrated it to `j4k5l6m7n8o9`, ran the suite, and dropped it afterward. No production database was touched.

## Next gate

Batch 2 is accepted. The isolated database is ephemeral and has already been removed by the test script. Do not rerun production migrations as part of this batch.
