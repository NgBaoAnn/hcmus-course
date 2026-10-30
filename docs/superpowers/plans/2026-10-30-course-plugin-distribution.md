# Course Plugin Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Distribute the existing CLI-backed skills from GitHub to local Codex, Claude Code, and OpenCode users, and prepare reviewable packages for official directories.

**Architecture:** The four skills remain canonical under `plugins/hcmus-course/skills`. Codex reads the portable root manifest and existing marketplace, Claude Code reads a compatibility manifest and its own marketplace, and OpenCode 2 reads a static HTTP skill catalog. The CLI stays on npm and is installed through the setup skill.

**Tech Stack:** JSON manifests, Markdown skills, SVG icons, Node.js test runner, Claude/Codex/OpenCode CLIs.

**Spec:** `docs/superpowers/specs/2026-10-30-course-plugin-distribution-design.md`

## Global Constraints

- Local CLI and PTY approval remain mandatory for Moodle writes; no MCP or web-runtime claim.
- Keep marketplace/plugin identifiers stable and plugin version synchronized across formats.
- Release plugin version `0.2.0`; leave npm CLI version `0.1.0` unchanged.
- Do not submit to a public directory without owner review of the final package and listing.

## Review Focus

- Codex and Claude manifest names or versions diverge: test their equality.
- OpenCode catalog references a missing skill or stale version: test paths and version equality.
- The ZIP contains repo files or credentials: inspect its complete file list.
- Claude manifest validates but the marketplace source cannot install: test both validation and an isolated install when the CLI permits it.
- A host-neutral skill loses explicit approval on write: run baseline and updated agent scenarios for Assignment, Quiz, and another write.

---

### Task 1: Portable skill instructions

**Files:** Modify the four `plugins/hcmus-course/skills/*/SKILL.md` files only where host-specific wording blocks Claude Code or OpenCode. Test with agent scenarios and `packages/cli/src/plugin.test.ts` if structural assertions help.

**Interfaces:** Skills continue to use the existing `course` command and `--agent` JSONL protocol.

- [ ] **Step 1: Run baseline agent scenarios** without the edited skill text; record any failure to choose `--agent`, relay previews, or wait for approval.
- [ ] **Step 2: Edit the minimum wording** to apply to any local agent with a PTY, preserving every read/write safety rule.
- [ ] **Step 3: Run the same scenarios** with the edited skills and verify approvals and error handling.
- [ ] **Step 4: Validate skill frontmatter and run `npm test`.**
- [ ] **Step 5: Commit the skill changes.**

### Task 2: Claude and Codex packaging

**Files:** Create `.claude-plugin/marketplace.json`, `plugins/hcmus-course/.claude-plugin/plugin.json`, `plugins/hcmus-course/assets/icon.svg`, and `plugins/hcmus-course/README.md`; modify `plugins/hcmus-course/plugin.json`, `packages/cli/src/plugin.test.ts`, and root `README.md`.

**Interfaces:** Marketplace names and sources resolve to `plugins/hcmus-course`; both plugin manifests identify `hcmus-course` at the same plugin version. Codex ZIP is assembled from the plugin root and excludes unrelated repo files.

- [ ] **Step 1: Extend `plugin.test.ts`** to assert both manifests, asset paths, marketplace source, and required listing metadata; run it RED.
- [ ] **Step 2: Add minimal manifests, SVG, plugin README, and install docs**; run the test GREEN.
- [ ] **Step 3: Run `claude plugin validate`** for plugin and marketplace, and test installation in an isolated config if supported.
- [ ] **Step 4: Assemble and inspect a Codex submission ZIP** with only the portable manifest, skills, README, and assets.
- [ ] **Step 5: Run the full `npm test` and commit.**

### Task 3: OpenCode catalog and release guidance

**Files:** Create `plugins/hcmus-course/skills/index.json`; modify `packages/cli/src/plugin.test.ts`, root `README.md`, and optionally `plugins/hcmus-course/README.md` for concise install instructions.

**Interfaces:** Each catalog entry maps to one existing skill directory with a real `SKILL.md`, and versions match the plugin release.

- [ ] **Step 1: Extend `plugin.test.ts`** to assert exact skill entries, paths, and versions; run RED.
- [ ] **Step 2: Add the catalog and OpenCode 2 GitHub raw URL guidance** plus OpenCode 1 copy fallback; run GREEN.
- [ ] **Step 3: Verify the HTTP catalog against local files** and exercise OpenCode skill loading if feasible.
- [ ] **Step 4: Run final tests, `git diff --check`, and inspect the ZIP again; commit and push.**

## Public-directory handoff

After Tasks 1–3, review the final listing and ZIP with the owner. Submit the Codex ZIP in the OpenAI developer portal after developer identity checks and the owner's approval. Submit the Claude GitHub repo through Anthropic's paid-plan directory portal after the owner's approval. Report review status and portal findings; public directory publication happens only after platform approval and owner authorization.
