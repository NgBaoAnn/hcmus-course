---
name: using-course-cli
description: Use when an agent needs to read student data from the HCMUS FIT Moodle Course CLI, including courses, deadlines, grades, calendar, materials, forums, messages, or notifications.
---

# Using Course CLI

## Overview

`course` reads `https://courses.fit.hcmus.edu.vn` through Moodle APIs. Use its IDs and structured output as the source of truth; a successful command can still contain warnings and partial data.

If `course auth status` says unauthenticated, run `course auth login`. It opens the operating system's default browser; the student completes Microsoft sign-in and MFA there. Never request or print the password or Moodle token. Recheck `course auth status` before data commands. `course auth logout` removes the locally saved token.

## Quick reference

| Need | Command |
| --- | --- |
| Check account and API | `course auth status`, `course doctor` |
| Current academic year / all enrolled courses | `course list` / `course list --all` |
| Course contents | `course view <course-id>` |
| Upcoming assignments and quiz closing | `course deadlines` (next 30 days), `--days N`, `--overdue` |
| Actionable work and Moodle events | `course todo`, `course calendar` |
| Grades and announcements | `course grades --course <course-id>`, `course notices --course <course-id>` |
| Resources | `course materials list --course <course-id>` |
| Assignment and quiz details | `course assignment list|view|status`, `course quiz list|view|attempts|status|review` |

Run `course --help` and command help for the full command inventory. In a terminal, omitted IDs open a selector. For agents and scripts, pass IDs explicitly. Read commands emit JSON when stdout is not a TTY; `--json` also requests JSON in a terminal but is intentionally hidden from user-facing help. Parse stdout and check the exit code, then inspect `warnings` in JSON and diagnostics on stderr. Warnings mean the answer may be incomplete.

## ID map

`course list` supplies course IDs. `assignment list` supplies assignment IDs; `quiz list` supplies quiz IDs; `quiz attempts` supplies attempt IDs. A Moodle link such as `mod/assign/view.php?id=127833` contains a **course-module ID**, not necessarily an assignment ID. Resolve the instance through the relevant list before calling `assignment status` or `quiz view`. Forum, discussion, post, conversation, user, and module IDs are likewise distinct.

## Example: report upcoming unsubmitted work

```sh
course auth status
course deadlines --days 30 --json
course assignment status 39794 --json
```

Use the assignment ID from the deadline/list output. Report due date and cutoff separately; an overdue option adds past-due work. Confirm the submission state with `assignment status`; a saved draft or uploaded file alone does not mean `submitted`. If API warnings or a failed status lookup prevent confirmation, label that item unverified. Timestamps in terminal output use `Asia/Ho_Chi_Minh`.

## Common mistakes

- `course list` defaults to the current academic year; deadlines still consider every enrolled course. Use `--all` when the course inventory must be complete.
- `course quiz status` deliberately leaves active-attempt end time and answer counts unknown because some Moodle reads can process an expired attempt. Do not infer time remaining from null fields.
- `course grades` can fail with `nopermissiontoviewgrades`; this is a permissions error, not an empty gradebook.
- Treat Moodle warnings as partial-result evidence, even if the process exits successfully.
