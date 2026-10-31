# Comprehensive Course Intel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide full-course inspection for new announcements/updates across forums, sections, and notifications, and mandate exhaustive requirement cross-checking (assignment prompt + attachments + forum clarifications + section notes) before submitting assignments.

**Architecture:** 
1. Create new skill `inspecting-course-updates` in `plugins/hcmus-course/skills/inspecting-course-updates/SKILL.md` to guide agents in sweeping all enrolled courses, news forums, general discussions, section announcements, and user notifications.
2. Update `plugins/hcmus-course/src/index.ts` to register `inspecting-course-updates`.
3. Update `plugins/hcmus-course/skills/submitting-course-assignments/SKILL.md` with a mandatory "Exhaustive Requirement Discovery" procedure that checks assignment prompts, attachment files, forum clarifications, and section notes.
4. Update `packages/cli/src/plugin.test.ts` to verify the new skill is registered and matches all plugin manifests.
5. Bump plugin version to `0.4.0` and package new distribution.

**Tech Stack:** Markdown skills, TypeScript plugin adapter, Node.js test runner.

---

### Task 1: Create `inspecting-course-updates` Skill

**Files:**
- Create: `plugins/hcmus-course/skills/inspecting-course-updates/SKILL.md`

- [ ] **Step 1: Write `SKILL.md` for `inspecting-course-updates`**
Cover:
- Frontmatter with name `inspecting-course-updates` and rich description covering Vietnamese/English prompts ("có thông báo gì mới không", "tin tức môn học", "dặn dò của thầy cô", announcements, course updates).
- Step-by-step sweep procedure:
  1. `course list` (current enrolled courses).
  2. For each course: `course notices --course <id>` (official news forums).
  3. `course forum list --course <id>` -> check pinned or recent discussions with `course forum discussions <forum-id>` for instructor/TA posts.
  4. `course view <course-id>` -> check section summaries for pinned notices, changes in lecture schedule, or exam announcements.
  5. `course notifications --limit 10` (system notifications).
- Output synthesis guidelines: Group findings by course, highlight actionable deadlines/schedule changes, filter out routine spam, format in clean Vietnamese cards/bullet points.

- [ ] **Step 2: Commit**
```bash
git add plugins/hcmus-course/skills/inspecting-course-updates/SKILL.md
git commit -m "feat(plugin): add inspecting-course-updates skill"
```

---

### Task 2: Enhance `submitting-course-assignments` with Exhaustive Requirement Discovery

**Files:**
- Modify: `plugins/hcmus-course/skills/submitting-course-assignments/SKILL.md`

- [ ] **Step 1: Add "Requirement Cross-Checking" section**
Explicitly instruct the agent that before solving or submitting:
1. **Prompt & Specs:** Read `course assignment view <id>` for prompt text, cutoff date, file restrictions, submission statement.
2. **Attachments:** Check `introattachments`. If prompts or specs are attached (`.pdf`, `.docx`, `.zip`), run `course assignment download <id>` to inspect the actual file contents.
3. **Forum Clarifications:** Run `course forum list --course <course-id>` and inspect discussions mentioning this assignment/lab/project (professors and TAs frequently clarify naming conventions, zip structure, or test cases in forum threads).
4. **Section Context:** Run `course view <course-id>` to check the section containing the assignment for supplemental FAQs, rubrics, or updates.
5. **Synthesis:** Present a checklist of ALL requirements (functional + file naming + packaging + deadline) to the student.

- [ ] **Step 2: Commit**
```bash
git add plugins/hcmus-course/skills/submitting-course-assignments/SKILL.md
git commit -m "docs(skill): add exhaustive requirement cross-checking to assignment submissions"
```

---

### Task 3: Register new skill in plugin adapter and tests

**Files:**
- Modify: `plugins/hcmus-course/src/index.ts`
- Modify: `packages/cli/src/plugin.test.ts`
- Modify: `plugins/hcmus-course/README.md`
- Modify: `README.md`

- [ ] **Step 1: Add `inspecting-course-updates` to `skillDirectories` in `src/index.ts`**
- [ ] **Step 2: Update `packages/cli/src/plugin.test.ts` to assert the 5 skills**
- [ ] **Step 3: Update `plugins/hcmus-course/README.md` and root `README.md` mentioning the 5 skills**
- [ ] **Step 4: Run test suite**
```bash
npm test
```
Expected: 164+ tests pass.

- [ ] **Step 5: Commit**
```bash
git add plugins/hcmus-course/src/index.ts packages/cli/src/plugin.test.ts plugins/hcmus-course/README.md README.md
git commit -m "feat(plugin): register inspecting-course-updates across plugin and docs"
```

---

### Task 4: Bump plugin version, package Codex zip, and publish release

**Files:**
- Modify: `plugins/hcmus-course/package.json` (0.4.0)
- Modify: `plugins/hcmus-course/plugin.json` (0.4.0)
- Modify: `plugins/hcmus-course/.claude-plugin/plugin.json` (0.4.0)
- Modify: `plugins/hcmus-course/.cursor-plugin/plugin.json` (0.4.0)
- Modify: `.antigravity-plugin/plugin.json` (0.4.0)
- Modify: `packages/cli/src/plugin.test.ts` (0.4.0)
- Modify: `docs/plugin-submission.md` (0.4.0)

- [ ] **Step 1: Update versions across manifests**
- [ ] **Step 2: Re-generate Codex package zip**
```bash
sh scripts/package-plugin.sh
```
- [ ] **Step 3: Run test suite**
```bash
npm test
```
- [ ] **Step 4: Commit and push**
```bash
git commit -am "chore: bump hcmus-course plugin to 0.4.0"
git tag v0.4.0
git push && git push --tags
gh release create v0.4.0 dist/plugin/hcmus-course-0.4.0-codex.zip --title "HCMUS Course Plugin v0.4.0" --notes "..."
```
