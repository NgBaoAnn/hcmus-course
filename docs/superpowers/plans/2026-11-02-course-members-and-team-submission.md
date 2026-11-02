# Course Members & Team Submission Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `course members --course <id> [--query <keyword>]` to search classmates realtime by partial name or student ID (MSSV), and update `submitting-course-assignments` so the agent actively asks if this is individual or team submission, resolves team member names into verified student IDs, and guides group packaging and web confirmation.

**Architecture:**
1. In `packages/cli/src/student.ts`, add `courseMembers(token: string, courseId: InputId, query?: string)` using `core_enrol_get_enrolled_users`. Parse MSSV from student email (`email.split('@')[0]`), filter by query (accent-insensitive, case-insensitive, matching fullname or MSSV).
2. In `packages/cli/src/course.ts`, wire command `course members --course <id> [--query <text>]` with both TUI card formatting and JSON output.
3. In `plugins/hcmus-course/skills/submitting-course-assignments/SKILL.md`, add "Team vs Individual Confirmation Workflow" guiding the agent to query classmates by name, present interactive pickers/lists, assemble team student IDs, name the submission zip, and link directly to Moodle web for the `fitnhom` confirmation.
4. Add comprehensive unit tests in `student.test.ts` and `course.test.ts`.
5. Bump CLI to `0.1.4`, plugin to `0.4.1`, package distribution and publish release.

**Tech Stack:** TypeScript, Node.js test runner, Moodle WebService REST API (`core_enrol_get_enrolled_users`).

---

### Task 1: Implement `courseMembers` in `student.ts`

**Files:**
- Modify: `packages/cli/src/student.ts`
- Modify: `packages/cli/src/student.test.ts`

- [ ] **Step 1: Write failing test in `student.test.ts`**
Test `courseMembers` fetches enrolled users for a course ID, parses MSSV from email, filters by query (name or MSSV), and sorts by fullname.

- [ ] **Step 2: Implement `courseMembers` in `student.ts`**
Signature:
```ts
export interface EnrolledMember {
  id: number;
  fullname: string;
  mssv: string | null;
  email: string | null;
  role: 'student' | 'teacher' | 'other';
}

export async function courseMembers(token: string, courseId: InputId, query?: string): Promise<{
  courseid: number;
  members: EnrolledMember[];
  warnings: MoodleWarning[];
}>
```

- [ ] **Step 3: Run tests to verify PASS**
```bash
npm test --workspace hcmus-course-cli -- test/student
```

- [ ] **Step 4: Commit**
```bash
git add packages/cli/src/student.ts packages/cli/src/student.test.ts
git commit -m "feat(cli): add courseMembers function to search enrolled classmates"
```

---

### Task 2: Wire `course members` in `course.ts` CLI router

**Files:**
- Modify: `packages/cli/src/course.ts`
- Modify: `packages/cli/src/course.test.ts`

- [ ] **Step 1: Write CLI routing test in `course.test.ts`**
Assert `course members --course 12 --query An` returns matched students in cards and JSON.

- [ ] **Step 2: Implement command `members` in `course.ts`**
Allow:
`course members --course <course-id> [--query <text>]`
or `course members <course-id> [--query <text>]`

- [ ] **Step 3: Run CLI tests**
```bash
npm test
```

- [ ] **Step 4: Commit**
```bash
git add packages/cli/src/course.ts packages/cli/src/course.test.ts
git commit -m "feat(cli): add 'course members' command for realtime student lookup"
```

---

### Task 3: Enhance `submitting-course-assignments` with Team/Individual Workflow

**Files:**
- Modify: `plugins/hcmus-course/skills/submitting-course-assignments/SKILL.md`

- [ ] **Step 1: Add "Team vs Individual Confirmation & Member Lookup" Section**
Detailed instructions:
1. When preparing an assignment, ALWAYS ask: *"Bài này bạn nộp cá nhân (một mình) hay nộp nhóm?"*
2. If Team:
   - Ask for member names (e.g. *"Bảo An, Tuấn Kiệt"*).
   - Use `course members --course <id> --query <name>` to search classmates in realtime.
   - Present the matched list with Full Name and Student ID (MSSV) for user selection/confirmation.
   - Advise/prepare file naming with group student IDs (e.g. `23120190_22120171.zip`).
   - After CLI submits the archive, present the direct Moodle assignment link for the student to select "Bài nhóm" on Moodle web.

- [ ] **Step 2: Commit**
```bash
git add plugins/hcmus-course/skills/submitting-course-assignments/SKILL.md
git commit -m "docs(skill): add interactive team member search and submission flow"
```

---

### Task 4: Bump versions, package Codex zip, and publish release

- [ ] **Step 1: Bump CLI to 0.1.4, Plugin to 0.4.1**
- [ ] **Step 2: Run full test suite**
- [ ] **Step 3: Re-package Codex zip**
- [ ] **Step 4: Push git commits, tags, and create GitHub release**
