# Phase 5-7 Add Save Chain Summary

## Phase Background

Phase 5-7 addressed the save flow for the Add (card creation) page in two sub-phases:

1. **Phase 5-7A-1** (commit `bb38f8d`): Decoupled save from English text analysis. Previously, `submitCard()` waited for the cloud function `analyzeEnglish` before completing, making the save operation dependent on an external service. After the change, `saveCard()` completes immediately (backend + local cache), and `runBackgroundEnglishCheck()` fires as fire-and-forget afterward.

2. **Phase 5-7A-3** (commit `190d16e`): Added local fallback for card creation when the backend is unavailable. Without this, a backend connection failure caused total data loss — the card was never persisted to `cardsCache`.

## Commits

| Commit | Description |
|--------|-------------|
| `bb38f8d` | decouple add save from english analysis |
| `190d16e` | add offline fallback for card creation |

## Current Save Chain Semantics

### Normal path (backend available)

```
submitCard()
  → saveCard()
    → addCard(form)                    [utils/recordStorage.js]
      → buildBackendCardCreatePayload(form)
      → createBackendCard(payload)     [utils/apiClient.js → POST /api/cards]
      → normalizeBackendCardToLocal(backendCard, fallback)
      → upsertCachedCard(localCard)    [triple dedup: id, backend_card_id, local_temp_id]
      → return card (backend_sync_status: 'synced')
    → runBackgroundEnglishCheck(card)  [fire-and-forget]
```

### Fallback path (backend unavailable)

```
submitCard()
  → saveCard()
    → addCard(form)
      → buildBackendCardCreatePayload(form)
      → createBackendCard(payload) → throws (network/connection error)
      → catch: build local card with backend_sync_status: 'pending'
      → upsertCachedCard(localCard)
      → return card (backend_sync_status: 'pending')
    → runBackgroundEnglishCheck(card)  [still fires on pending card]
```

### Edit path — normal (synced card)

```
submitCard()
  → saveCard()
    → updateCard(cardId, form)
      → currentCard.backend_sync_status !== 'pending' → normal path
      → buildBackendCardPatchPayload(form, currentCard)
      → updateBackendCard(cardId, payload)  [PATCH /api/cards/:id]
      → normalizeBackendCardToLocal(backendCard, currentCard)
      → upsertCachedCard(localCard)
```

### Edit path — pending card (manual sync)

```
submitCard()
  → saveCard()
    → updateCard(cardId, form)
      → currentCard.backend_sync_status === 'pending' && !currentCard.backend_card_id
      → buildBackendCardCreatePayload({...form, local_temp_id: currentCard.local_temp_id})
      → createBackendCard(payload)  [POST /api/cards, reuses original local_temp_id]
      → normalizeBackendCardToLocal(backendCard, currentCard)
      → upsertCachedCard(localCard)
      → return card (backend_sync_status: 'synced')
```

## Pending Card Rules

1. **Identification**: A card with `backend_sync_status === 'pending'` exists only in local storage and has not been created on the backend.
2. **Home page display**: Shows "待同步" badge (amber pill: `#b47a25` on `#fff8ea` background).
3. **Review isolation**: Pending cards are naturally excluded from review — the review page fetches cards from `GET /api/reviews/today` (backend), and pending cards never reach the backend.
4. **Edit forces create**: Editing a pending card triggers `POST /api/cards` (create), not `PATCH /api/cards/:id` (update). The original `local_temp_id` is preserved for idempotency.
5. **Cache refresh preserves pending**: `refreshCardsCacheFromBackend()` merges backend cards with local pending cards. A pending card is removed only if it can be matched to a backend card via `id`, `backend_card_id`, or `local_temp_id`.

## Review Isolation

Review is fully backend-driven:
- `pages/review/review.js` calls `createReviewSession()` → `getTodayReview()`.
- Both functions query the backend (`POST /api/review-sessions`, `GET /api/reviews/today`).
- Pending cards have no backend representation, so they cannot appear in review sessions.
- No additional filtering or guard logic is needed on the client side.

## Not Implemented

The following were explicitly excluded from scope per the phase constraints:

| Item | Reason |
|------|--------|
| Auto-sync of pending cards | Constraint: no automatic background sync |
| actionQueue for card CRUD | Constraint: actionQueue remains review_feedback only |
| Review with pending cards | Constraint: no review/history schema changes |
| History for pending cards | Constraint: history remains backend-driven |
| Batch sync button | Not in requirements |

## Known Tech Debt

### P2: Business error codes treated as network failures

When `createBackendCard()` receives a 400, 422, or other business-level error, the fallback path is triggered just like a network error. The card is saved locally with `backend_sync_status: 'pending'` and `backend_sync_error` capturing the error detail.

**Risk assessment**: Low.
- 401 errors already have token refresh via `request()` before reaching the fallback.
- Well-formed payloads from `buildBackendCardCreatePayload()` are unlikely to trigger 400/422 in normal operation.
- Cards are never lost — they remain as "待同步" and can be retried by editing.
- The `local_temp_id` field provides a foundation for backend idempotency, though the backend implementation of this guarantee has not been confirmed.

### P2: Backend `local_temp_id` idempotency unconfirmed

The client sends `local_temp_id` with every create request and reuses it on retry, but whether the backend enforces uniqueness on this field has not been verified. If not enforced, duplicate cards could be created on retry.

## Phase Conclusion

The save chain now handles both online and offline scenarios without data loss. Pending cards are visible to the user, preserved across cache refreshes, and can be manually synced by editing. Review and history remain correctly isolated from pending cards. No P0 or P1 issues were identified in the final review.
