# Course CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the proven Moodle API spike into a student CLI for courses, assignments, deadlines, grades, announcements, and quizzes.

**Architecture:** Compile TypeScript source to `dist/` with `tsc`. Keep `moodle.ts` as the token-safe REST transport and `course.ts` as the command entry point. Add focused modules for terminal input, student reads, assignments, and quizzes; invoke Moodle APIs only through the transport, except the documented file upload/download endpoints.

**Tech Stack:** Node.js >=22, TypeScript ESM with strict type checking, `tsc`, built-in test runner and `fetch`, existing `playwright-core` for Microsoft SSO, and `linkedom` for HTML parsing.

**Spec:** `docs/superpowers/specs/2026-10-29-course-cli-design.md`

## Global Constraints

- Host is fixed to `https://courses.fit.hcmus.edu.vn`; current token path is preserved.
- All editable source and tests use `.ts`; `dist/` is compiled output ignored by Git.
- `doctor`, `auth login`, `auth logout`, and `probe` continue working.
- Every mutation requires explicit terminal confirmation; no production writes in tests.
- Token, quiz passwords, and unsaved answers never enter logs, URLs exposed to users, or the repository.
- Live school checks are read-only; writes use a mock Moodle server/fixtures.
- No module silently skips unsupported activities or claims success before server verification.
- Commands render safe human output and machine-readable `--json` where the spec calls for it.

## Review Focus

- Existing draft files: submitting a new file set must show every replaced file and never erase online text silently. Task 3 tests this.
- Unknown Moodle warnings: output must identify partial data, rather than claim the list is complete. Tasks 2–4 test this.
- Timed quiz near expiry: no start without disclosure; interrupted writes never claim an answer or finish was saved. Task 4 tests this.
- Two devices editing a quiz: sequence-check conflict must stop the CLI rather than overwrite remote answers. Task 4 tests this.
- Unsafe file URLs/filenames: no token leak or filesystem traversal on download. Task 3 tests this.

---

### Task 1: Command shell and shared input/output

**Files:** Modify `package.json`, `course.ts`, `moodle.ts`; create `terminal.ts`, `terminal.test.ts`.

**Interfaces:** `terminal.ts` exports `confirm(message) -> Promise<boolean>`, `ask(message) -> Promise<string>`, `render(html) -> string`, `show(value,{json}) -> void`, and `requireId(value,label) -> number`. `course.ts` retains auth/doctor/probe and dispatches later commands via lazy imports. `moodle.ts` retains `api(token,method,params)` and `SITE`.

- [ ] Write tests for ID parsing, non-TTY confirmation denial, safe output of untrusted HTML/control sequences, JSON output, and legacy help.
- [ ] Run `npm test`; confirm tests fail from missing interfaces.
- [ ] Implement shared helpers, `bin`/help, token loader and dispatch skeleton with explicit usage errors.
- [ ] Run `npm test`, `node dist/course.js --help`, `node dist/course.js doctor`; confirm success and no token printed.
- [ ] Commit Task 1.

### Task 1A: Migrate the spike and current read work to TypeScript

**Files:** Rename the current `course.mjs`, `moodle.mjs`, `terminal.mjs`, `moodle.test.mjs`, `terminal.test.mjs`, `student.mjs`, and `student.test.mjs` to `.ts`. Modify `package.json`, `package-lock.json`, `.gitignore`, `README.md`; create `tsconfig.json`.

**Interfaces:** Existing exports keep the same names. Source imports use `.js` specifiers for NodeNext resolution. `npm run build` emits `dist/*.js`; `npm test` builds then runs `dist/*.test.js`; the `course` bin points to `dist/course.js`.

- [ ] Change build/test scripts and write `tsconfig.json` with `strict`, `NodeNext`, and `noEmitOnError`.
- [ ] Rename sources/tests to `.ts`, update imports, and run `npm run build` to see type errors.
- [ ] Add the minimum types needed at boundaries; keep existing behavior.
- [ ] Run `npm test`, `node dist/course.js doctor`, and `node dist/course.js --help`.
- [ ] Commit the migration with Task 2 after its TypeScript tests pass.

### Task 2: Read-only student workflows

**Files:** Create `student.ts`, `student.test.ts`; modify command dispatch in `course.ts` only for this task.

**Interfaces:** `student.ts` exports `listCourses(token)`, `viewCourse(token,id)`, `deadlines(token,{courseId,days,overdue})`, `grades(token,id)`, `notices(token,id)`. Every function returns a value with `warnings` where relevant and performs no Moodle mutation. Consumes `api` from `moodle.ts` and `render/show` in command shell.

- [ ] Write fixtures/tests for enrolled courses, course sections, due vs cutoff vs extensions, overdue status, quiz close dates, grade hidden/ungraded values, announcements, partial permission warnings, and empty lists.
- [ ] Run targeted tests; confirm failures before code.
- [ ] Implement the Moodle read calls, bounded status lookups, paginated forum results, local-time formatting and `--json` rendering.
- [ ] Run targeted tests and full `npm test`; inspect only read-only data against the school API.
- [ ] Commit Task 2 with Task 1A if the read workflow was already written in JavaScript.

### Task 3: Assignment workflow

**Files:** Create `assignments.ts`, `assignments.test.ts`; modify command dispatch in `course.ts` only for this task.

**Interfaces:** `assignments.ts` exports `listAssignments(token,courseId)`, `viewAssignment(token,id)`, `assignmentStatus(token,id)`, `downloadAssignment(token,id,directory)`, `submitAssignment(token,id,{files,textFile,draft,confirm})`. Reads return values with `warnings`. Submit reports `saved`, `submitted`, or `uncertain`, with observed server state.

- [ ] Write tests using fixture responses for list/view/status and file download failure, path traversal, and duplicate names.
- [ ] Write mutation tests for refusal/confirmation, plugin support, max size/type/count, team state, replacing existing files, preserving text, upload → save → verify → finalize → verify, partial success, timeout/uncertain state, and no automatic write retry.
- [ ] Run targeted tests; confirm failure before implementation.
- [ ] Implement REST/file handling and assignment commands, keeping upload/download credentials away from output and redirects.
- [ ] Run targeted tests and full suite; perform live reads only.
- [ ] Commit Task 3.

### Task 4: Quiz workflow

**Files:** Create `quizzes.ts`, `quizzes.test.ts`; modify command dispatch in `course.ts` only for this task.

**Interfaces:** `quizzes.ts` exports `listQuizzes(token,courseId)`, `viewQuiz(token,id)`, `quizAttempts(token,id)`, `quizStatus(token,attemptId)`, `startQuiz(token,id,{confirm,ask})`, `resumeQuiz(token,attemptId,{ask})`, `submitQuiz(token,attemptId,{confirm})`, `reviewQuiz(token,attemptId)`. Start/resume are interactive only, use the current attempt's field names/sequence-check, and never log answers.

- [ ] Write tests for read-only listing/access/review, unsupported qtypes and access rules, and no attempt created by read commands.
- [ ] Write tests for explicit start confirmation, timeout and resume, supported question types, answer mapping/shuffle, save/clear/keep, sequential pages, expiry/grace, conflicts, EOF, final confirmation, and server-verified finish.
- [ ] Run targeted tests; confirm failure before implementation.
- [ ] Implement quiz API flow and terminal commands. Refuse unsupported question/behaviour before starting; preserve an existing attempt when a later question is unsupported.
- [ ] Run targeted tests and full suite; perform only live quiz reads.
- [ ] Commit Task 4.

### Task 5: Integration, documentation and verification

**Files:** Modify `course.ts`, `README.md`, `package.json`, and tests as required by integration findings.

**Interfaces:** All documented commands are reachable as `course` via `npm link`; `node dist/course.js` also works. Existing auth file remains usable.

- [ ] Write CLI-level tests for help, invalid args, `--json`, missing auth, unsupported quiz/assignment cases, and clean stderr/stdout separation; confirm failures.
- [ ] Connect command parser and modules, revise README to explain installation, IDs, submission replacement, quiz timing, and limits.
- [ ] Run `npm test`, `npm run build`, `node dist/course.js doctor`, and read-only live commands for each API group where school data permits. Compare output with expected fields; fix errors with failing tests.
- [ ] Review for credential leaks, file overwrites, partial-data claims, and unintended real writes. Re-run suite after any fix.
- [ ] Commit Task 5 and request whole-branch code review.
