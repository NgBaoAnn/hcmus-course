# Default Browser Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Let `course auth login` use any default browser and securely receive Moodle's `coursecli://` callback through a per-user OS protocol handler.

**Architecture:** Add a small protocol module for OS registration, default-browser launch, and callback IPC. Moodle callback handling validates a one-time passport, verifies the token with Moodle, and saves it using the existing atomic auth-file pattern. Login waits on a short-lived result file; logout removes the CLI's registration.

**Tech Stack:** Existing TypeScript/Node.js ESM, `node:child_process`, `node:fs/promises`, built-in test runner, Moodle REST API.

**Spec:** `docs/superpowers/specs/2026-10-29-default-browser-auth-design.md`

## Global Constraints

- Node.js >=22; source and tests remain TypeScript.
- Never write a password, cookie, or token to logs or stdout.
- Validate the callback scheme and one-time passport before Moodle requests or auth-file writes.
- Register only for the current user; never override an existing `coursecli` handler.
- Preserve existing token until new login identity is verified; use atomic writes with mode `0600`.
- Never invoke OS commands through a shell with callback data interpolated into the command.

## Review Focus

- Malformed, wrong-scheme, stale, and replayed callbacks must not change auth state.
- Existing non-CLI protocol registrations must not be overwritten or removed.
- Browser open failure, callback timeout, and identity API failure must preserve the prior token and clean up pending secrets.
- Paths with spaces and callback URLs containing `+`, `/`, and `=` must survive OS argument handling.
- Logout must remove only the CLI's handler and local token, never a pre-existing handler or Moodle-side token.

---

### Task 1: Callback IPC and token persistence

**Files:**
- Modify `course.ts`
- Modify `moodle.ts` if callback scheme validation needs to be exported or tightened
- Test `course.test.ts` and `moodle.test.ts`

**Interfaces:**
- `auth callback --config-dir <directory> <url>` consumes the URI and the login state directory from the registered OS handler. Passing the directory keeps GUI-launched callbacks independent of the shell's environment.
- `auth login` creates a random login ID, passport, pending state, and completion file inside the config directory.

- [x] Add tests proving valid callback saves only after identity verification, and wrong/replayed callback is rejected without overwriting existing token.
- [x] Implement callback state, callback command routing, atomic token write, and parent wait/timeout cleanup.
- [ ] Run focused and full test suite after the final callback argument update; commit.

### Task 2: Per-user protocol registration and default-browser launch

**Files:**
- Create `protocol.ts`
- Create `protocol.test.ts`
- Modify `course.ts`, `course.test.ts`

**Interfaces:**
- `registerProtocolHandler({ configDir }): Promise<void>`
- `unregisterProtocolHandler(): Promise<void>`
- `openDefaultBrowser(url): Promise<void>`

- [x] Add tests for platform adapters using injected command runners and temporary config paths; assert no shell is used and existing handlers are not overridden.
- [x] Implement Windows HKCU registration, macOS Launch Services app registration, Linux desktop/MIME registration, and default-browser opener.
- [x] Have `auth login` register before opening; have `auth logout` remove the registration.
- [x] Manually verify macOS registration, callback routing, and unregister; unit suite was green before the final callback argument update.
- [ ] Run focused and full suite after the final callback argument update; commit.

### Task 3: User documentation and integration

**Files:**
- Modify `README.md`
- Modify `docs/superpowers/specs/2026-10-29-course-cli-design.md`
- Modify `course.test.ts`

- [x] Replace Chrome/Edge requirements with default-browser requirements and explain the temporary per-user `coursecli://` registration.
- [x] Verify CLI help and auth error messages describe setup/cleanup accurately.
- [x] Run build and `git diff --check`; full test suite remains to be rerun after the final callback argument update.
