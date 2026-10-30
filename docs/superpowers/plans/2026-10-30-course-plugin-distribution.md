# Course Plugin Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Distribute the existing CLI-backed skills from GitHub to local Codex, Claude Code, and OpenCode users, and prepare reviewable packages for official directories.

**Architecture:** The four skills remain canonical under `plugins/hcmus-course/skills`. Codex reads the portable root manifest and existing marketplace, Claude Code reads a compatibility manifest and its own marketplace, and OpenCode 2 installs the plugin subdirectory as a Git-backed TypeScript package and registers those same skills. The CLI stays on npm and is installed through the setup skill.

**Tech Stack:** JSON manifests, Markdown skills, TypeScript OpenCode adapter, SVG icons, Node.js test runner, Claude/Codex/OpenCode CLIs.

**Spec:** `docs/superpowers/specs/2026-10-30-course-plugin-distribution-design.md`

## Global Constraints

- Local CLI and PTY approval remain mandatory for Moodle writes; no MCP or web-runtime claim.
- Keep marketplace/plugin identifiers stable and plugin version synchronized across formats.
- Release plugin version `0.2.0`; leave npm CLI version `0.1.0` unchanged.
- Do not submit to a public directory without owner review of the final package and listing.

## Review Focus

- Codex and Claude manifest names or versions diverge: test their equality.
- OpenCode package references a missing skill or stale version: test paths and version equality.
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

### Task 3: OpenCode Git package and release guidance

**Files:** Create `plugins/hcmus-course/package.json`, `plugins/hcmus-course/src/index.ts`, and `.opencode/INSTALL.md`; modify `packages/cli/src/plugin.test.ts`, root `README.md`, and optionally `plugins/hcmus-course/README.md` for concise install instructions.

**Interfaces:** OpenCode 2 loads the plugin from `github:NgBaoAnn/hcmus-course#main::path:plugins/hcmus-course`; its TypeScript entry registers every existing `SKILL.md`, and package and manifest versions match.

- [ ] **Step 1: Extend `plugin.test.ts`** to assert package entry, skill paths, and versions; run RED.
- [ ] **Step 2: Add the Git-backed OpenCode 2 plugin and `.opencode/INSTALL.md`** plus older-version copy fallback; run GREEN.
- [ ] **Step 3: Exercise OpenCode plugin loading** in an isolated configuration if feasible.
- [ ] **Step 4: Run final tests, `git diff --check`, and inspect the ZIP again; commit and push.**

## Public-directory handoff

After Tasks 1–3, review the final listing and ZIP with the owner. Submit the Codex ZIP in the OpenAI developer portal after developer identity checks and the owner's approval. Submit the Claude GitHub repo through Anthropic's paid-plan directory portal after the owner's approval. Report review status and portal findings; public directory publication happens only after platform approval and owner authorization.

### Task 4: Antigravity, Cursor, Copilot, and generic skills

**Files:** Add `.antigravity-plugin/plugin.json`, `.cursor-plugin/marketplace.json`, and `plugins/hcmus-course/.cursor-plugin/plugin.json`; update plugin versions, the package script, structural tests, README, and release guidance.

- [ ] Add structural tests for shared version, canonical skill paths, and new marketplace sources; confirm RED.
- [ ] Add native Antigravity and Cursor manifests and document Copilot CLI's reuse of the Claude marketplace.
- [ ] Document `npx skills add` for Gemini CLI and other Agent Skills hosts using the canonical skills.
- [ ] Run `agy plugin validate --strict`, a `skills` discovery/install, the full CLI suite, and regenerate/inspect the Codex ZIP.
- [ ] Push the changes to the existing distribution PR; keep official directory submissions as a separate owner step.
