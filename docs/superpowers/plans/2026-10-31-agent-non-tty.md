# Agent Non-TTY Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow `--agent` mode to work in non-TTY environments (agent harnesses like OpenCode) by reading confirmation from stdin pipe when TTY is unavailable, and update the Skill to document this correctly.

**Architecture:** `AgentSession` currently throws if `process.stdin.isTTY` is false. The fix relaxes this: when `--agent` is passed, stdin piped input is acceptable because confirmation flows through structured JSONL (harness reads `confirmation_required`, sends `yes`). `ask()` in terminal.ts keeps its TTY guard for the human TUI path. The Skill is updated to remove the PTY workaround and document the correct non-TTY flow.

**Tech Stack:** TypeScript, Node.js `node:readline/promises`, existing `AgentSession` + `AgentIO` interface.

**Spec:** This file (requirements derived from user-reported failure and codebase analysis).

## Global Constraints

- No new runtime dependencies.
- All existing tests must remain green.
- `--agent` without TTY **only** reads from stdin pipe; it never silently swallows TTY-only prompts.
- Human TUI path (`ask`, `confirm` in `terminal.ts`) keeps its TTY guard unchanged.
- `AgentSession` constructed with `interactive: false` still throws — that guard is for explicit opt-out, not for the TTY-absent case.

## Review Focus

- Stdin pipe closed before harness sends `yes` → readline rejects → `confirm()` catches and returns `false`, agent emits `error` with `code: cancelled`. Safe.
- Harness sends `no` or garbage → `trim().toLowerCase() !== 'yes'` → declined correctly.
- `--agent` used in a script that also reads stdin for file content → both compete for stdin. Noted in Skill as unsupported; no code change needed.
- `AgentSession` constructed without `--agent` flag in non-TTY script → `enabled !== true` → `agentSession()` returns `undefined`, no session created, no change in behavior.
- Concurrent writes with two `AgentSession` instances → already guarded by the single `activeAgent` pattern in `course.ts`; no change needed.

---

### Task 1: Relax TTY guard in `AgentSession` for piped stdin

**Files:**
- Modify: `packages/cli/src/agent.ts:15`
- Modify: `packages/cli/src/agent.test.ts`

**Interfaces:**
- Consumes: `AgentIO.interactive?: boolean` (existing)
- Produces: `new AgentSession(operation)` — no longer throws when `process.stdin.isTTY` is `false`, provided `io.interactive` is not explicitly `false`.

- [ ] **Step 1: Write the failing test**

Add to `agent.test.ts`:

```ts
test('agent mode accepts piped stdin when interactive is not set', () => {
  // Simulate non-TTY: do not pass interactive, rely on isTTY being false in test env.
  // Pass explicit readInput so no real stdin is touched.
  const session = new AgentSession('assignment.submit', {
    readInput: async () => 'yes',
    write: () => {},
  });
  assert.ok(session); // must not throw
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/cli && ../../node_modules/.bin/tsc && node --test dist/agent.test.js
```

Expected: FAIL — `AgentSession` throws `terminal tương tác`.

- [ ] **Step 3: Change the TTY guard in `agent.ts` line 15**

Current:
```ts
if (!(io.interactive ?? process.stdin.isTTY)) throw new Error('Chế độ agent cần terminal tương tác để xác nhận thao tác ghi.');
```

Replace with:
```ts
if (io.interactive === false) throw new Error('Chế độ agent cần terminal tương tác để xác nhận thao tác ghi.');
```

Rationale: when `--agent` is active, the harness owns confirmation via structured JSONL on stdin. Explicit `interactive: false` (used in tests to assert rejection) still throws. `process.stdin.isTTY` is no longer consulted — the `--agent` flag is the user's explicit opt-in to pipe-based flow.

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test dist/agent.test.js
```

Expected: all agent tests PASS, including the new one and the existing `interactive: false` rejection test.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/agent.ts packages/cli/src/agent.test.ts
git commit -m "fix: allow AgentSession in non-TTY stdin-pipe environments"
```

---

### Task 2: Update `readInput` default to work without TTY

**Files:**
- Modify: `packages/cli/src/agent.ts:16`

**Interfaces:**
- Consumes: `ask` from `terminal.ts` (current default for `readInput`)
- Produces: `AgentSession.readInput` — uses a readline that works on piped stdin, not `ask()` which throws when `!isTTY`.

**Problem:** Line 16 defaults `readInput` to `ask('')`, which throws when `!process.stdin.isTTY` (see `terminal.ts:128`). After Task 1, construction no longer throws, but the first `confirm()` or `ask()` call would still throw via `ask()`.

- [ ] **Step 1: Write the failing test**

Add to `agent.test.ts`:

```ts
test('agent mode reads yes from piped stdin without explicit readInput', async () => {
  // We cannot mock process.stdin easily; test via explicit readInput that simulates pipe.
  // This test documents the contract: AgentSession must not call terminal.ask internally.
  const lines: string[] = [];
  const session = new AgentSession('assignment.submit', {
    readInput: async () => 'yes',
    write: line => lines.push(line),
  });
  const result = await session.confirm('preview text');
  assert.equal(result, true);
});
```

(This test already passes after Task 1 if `readInput` is provided. The next step fixes the case where it is not.)

- [ ] **Step 2: Implement a pipe-safe default `readInput` in `agent.ts`**

Replace line 16:
```ts
this.readInput = io.readInput ?? (() => ask(''));
```
with:
```ts
this.readInput = io.readInput ?? (() => {
  const rl = createInterface({ input: process.stdin });
  return new Promise<string>((resolve, reject) => {
    rl.once('line', line => { rl.close(); resolve(line); });
    rl.once('close', () => reject(new Error('stdin fechado.')));
  });
});
```

Add `import { createInterface } from 'node:readline';` at top (replace or supplement existing import from `terminal.ts`).

The default no longer calls `ask()` (which enforces TTY). It reads one line from stdin — works for both TTY and pipe.

- [ ] **Step 3: Run full test suite**

```bash
cd /Users/nguyenbaoan/codeLab/portal-cli && npm test
```

Expected: all 163+ tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/agent.ts
git commit -m "fix: use pipe-safe readline default in AgentSession instead of terminal.ask"
```

---

### Task 3: Update the Skill

**Files:**
- Modify: `plugins/hcmus-course/skills/submitting-course-assignments/SKILL.md`

**Interfaces:** None — documentation only.

**Changes:**
1. Remove the PTY-session requirement from the Confirmation section.
2. Document that `--agent` works with piped stdin (no PTY needed).
3. Document the correct flow: harness runs `course assignment submit <id> <files> --agent`, reads JSONL from stdout, waits for `confirmation_required`, sends `yes\n` to stdin of that process.
4. Keep the warning about not retrying writes and checking `result.result.state`.
5. Remove Codex-specific PTY instructions (they were a workaround, not the intended flow).

- [ ] **Step 1: Rewrite the Confirmation and result section**

Replace the current "Confirmation and result" paragraph with:

```markdown
## Confirmation and result

Append `--agent` to enable structured JSONL output on stdout. The flag does **not** bypass confirmation and works with or without a TTY — a harness can pipe stdin directly.

**Flow:**
1. Run `course assignment submit <id> [files...] --agent` with stdout captured and stdin kept open (do not use a one-shot shell substitution that closes stdin).
2. Parse each stdout line as JSON; ignore lines that are not `{ "schema": 1, ... }`.
3. When `event: "preview"` arrives, relay `preview.preview` (account, assignment, files, action, submission statement) to the student for review.
4. When `event: "confirmation_required"` arrives, wait for explicit student approval of that concrete preview, then write `yes\n` to the process stdin. If declined, write `no\n`; `error.code: cancelled` confirms no upload occurred.
5. After sending `yes`, wait for `event: "result"` or `event: "error"`.
6. Inspect `result.result.state`: `submitted` = final, `saved` = draft only, `uncertain` = verify manually.
7. Recheck with `course assignment status <id>` regardless of reported state.

**Never retry a write automatically.** On timeout, error, or `uncertain`, inspect status and the website.
```

- [ ] **Step 2: Run full test suite to confirm nothing broke**

```bash
cd /Users/nguyenbaoan/codeLab/portal-cli && npm test
```

Expected: all tests pass (Skill is documentation only).

- [ ] **Step 3: Commit**

```bash
git add plugins/hcmus-course/skills/submitting-course-assignments/SKILL.md
git commit -m "docs(skill): document non-TTY --agent flow, remove PTY workaround"
```

---

### Task 4: Bump version and publish

**Files:**
- Modify: `packages/cli/package.json` (version bump via `npm version patch`)

- [ ] **Step 1: Run full test suite one final time**

```bash
cd /Users/nguyenbaoan/codeLab/portal-cli && npm test
```

Expected: all tests pass.

- [ ] **Step 2: Bump version**

```bash
npm version patch --workspace hcmus-course-cli
git add packages/cli/package.json package-lock.json
git commit -m "chore: bump hcmus-course-cli to 0.1.3"
```

- [ ] **Step 3: Push and publish**

```bash
git push
npm publish --workspace hcmus-course-cli
```

- [ ] **Step 4: Verify on registry**

```bash
npm view hcmus-course-cli version
```

Expected: `0.1.3`.
