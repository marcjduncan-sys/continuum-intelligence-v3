# FLYWHEEL: Cross-device conversation persistence

## Problem

Analyst Chat and PM Chat conversations were only persisted in sessionStorage, meaning:
- Conversations disappeared when switching devices
- OTP login did not restore prior conversation history
- Homepage load with no ticker showed a blank chat instead of the most recent conversation

## Changes

### src/features/pm-chat.js
- Added `_restoreFromDB()` function that fetches the latest PM conversation from `/api/pm-conversations/latest`
- Called `_restoreFromDB()` in `initPMChat()` after `_checkExistingPortfolio()`
- Added `ci:auth:login` event listener to re-fetch PM history after OTP login

### src/features/chat.js
- Replaced silent `.catch()` handlers with `console.warn()` logging in `_restoreFromDB`, `_ensureConversation`, and `_persistMessage`
- Added `_restoreLatestFromDB()` function that fetches the conversation list and auto-selects the most recent ticker
- Updated `initChat()` to branch: if a ticker is set (URL hash), restore that conversation; if no ticker (homepage), fetch the most recent conversation from DB
- Added `ci:auth:login` event listener to re-fetch history after OTP login

## Verification

- `npm run test:unit` -- 234 tests passing
- `npm run build` -- clean production build
