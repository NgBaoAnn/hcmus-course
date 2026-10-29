# Codex Course Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a local Codex skills plugin that guides setup and natural-language Moodle workflows through the separately installed `course` CLI.

**Architecture:** The repository root holds the portable plugin manifest and skills. The CLI remains a TypeScript npm workspace package and emits JSON for read commands when stdout is not a TTY. Moodle writes continue through an interactive PTY and a concrete chat approval.

**Tech Stack:** Node.js >=22, TypeScript, npm workspaces, Agent Plugins manifest, Markdown Agent Skills.

**Spec:** `docs/superpowers/specs/2026-10-30-codex-course-plugin-design.md`

## Global Constraints

- Do not package an MCP server or a CLI binary inside the plugin.
- Do not claim the npm CLI package is already published.
- Preserve TTY card output and human-facing `course --help`; `--json` remains hidden.
- Never bypass the CLI's explicit write confirmation or expose Moodle credentials.
- No live Moodle write tests.

## Review Focus

- Piped reads must emit parseable JSON with no TUI text on stdout; add a fixture test for deadline and assignment reads.
- TTY reads must retain cards and selectors; run existing tests.
- Noninteractive writes must still be refused; run existing assignment and quiz tests.
- A missing CLI must trigger setup guidance, not an invented npm install command; pressure-test setup skill.
- An ambiguous assignment reference or uncertain Moodle state must not lead to a write or success claim; pressure-test workflow skills.

---

### Task 1: Make read commands agent-friendly

**Files:** Modify `packages/cli/src/course.ts`; test `packages/cli/src/course.test.ts`.

**Interfaces:** `wantsJson(requested?: boolean): boolean` returns true for explicit `--json` or non-TTY stdout. Apply only to read branches; writes keep their current output and confirmation behavior.

- [ ] Write tests that run `course deadlines` and `course assignment list` without `--json` in non-TTY fixtures, parse stdout as JSON, and assert warning fields remain present.
- [ ] Run the tests and confirm the current card output fails the assertions.
- [ ] Use `wantsJson` in read command branches: course reads, quiz reads, assignment reads/download, forum reads, materials reads/download, messages inbox/view, todo, favourites list. Keep write branches separate.
- [ ] Run targeted tests and all CLI tests, then commit.

### Task 2: Package the skills-only Codex plugin

**Files:** Create `plugin.json`, `.agents/plugins/marketplace.json`; remove `packages/mcp/*`; modify `package.json`, `package-lock.json`, `README.md`.

**Interfaces:** Root portable manifest identifies the skills plugin and sets `extensions.com.openai.requires_local_executor` to `true`. Repo marketplace entry points at the root plugin. CLI npm package remains private and unpublished until a later release.

- [ ] Write a small local validation test for manifest shape, skill paths, absence of MCP configuration, and marketplace source path.
- [ ] Run it against the current repo and confirm it fails because the manifest is missing.
- [ ] Add the manifest and marketplace, remove the unused MCP workspace, update lockfile and setup docs.
- [ ] Run validation, `npm test`, and `git diff --check`, then commit.

### Task 3: Teach natural-language workflows

**Files:** Modify `skills/using-course-cli/SKILL.md`, `skills/submitting-course-assignments/SKILL.md`, `skills/taking-course-quizzes/SKILL.md` only where baseline scenarios show a gap; possibly add `skills/setting-up-course-cli/SKILL.md` if setup needs an independent trigger. Update installed personal copies after verification.

**Interfaces:** Skills run `course` by name after checking it exists. Until npm publication, setup points to the current repository install path. For writes, the agent builds and validates the artifact, starts CLI in a PTY, relays its preview into chat, waits for explicit approval, then sends `yes` to the same process and verifies Moodle status.

- [ ] Run RED agent scenarios without revised skills for missing CLI, unfinished deadlines, completing an assignment, cancellation, and uncertain outcomes; record actual gaps.
- [ ] Update one skill at a time with the minimum guidance for those gaps.
- [ ] Re-run the same scenarios with each revised skill; close remaining gaps.
- [ ] Validate frontmatter, sync local copies, update README with example prompts, and commit.

### Task 4: End-to-end local verification

**Files:** No additional production files expected.

- [ ] Run `npm test` and local plugin validation.
- [ ] Run CLI help and mocked read smoke checks; confirm piped stdout parses as JSON.
- [ ] Inspect clean `git status`, push the branch to PR #1, and report limitations: npm package not published and real Moodle writes not exercised.
