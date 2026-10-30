---
name: using-course-cli
description: Use when a student asks an agent to inspect or manage HCMUS FIT Course data, such as unfinished deadlines, courses, grades, calendar, materials, forums, messages, notifications, or completion.
---

# Using Course CLI

## Overview

`course` reads `https://courses.fit.hcmus.edu.vn` through Moodle APIs. Use its IDs and structured output as the source of truth; a successful command can still contain warnings and partial data.

If `course` is missing or authentication fails, follow the plugin's [setup skill](../setup/SKILL.md). Never request or print the password or Moodle token. `course auth logout` removes the locally saved token.

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
| Messages and forums | `course messages inbox|view|send`, `course forum list|discussions|view|create|reply|subscribe|favourite` |
| Personal activity | `course favourites list|add|remove`, `course completion done|undo`, `course notifications read`, `course event create` |

Run `course --help` for the full command inventory and syntax; subcommands do not support `--help`. In a terminal, omitted IDs open a selector. For agents and scripts, pass IDs explicitly. Read commands emit JSON when stdout is not a TTY. Parse stdout and check the exit code, then inspect `warnings` in JSON and diagnostics on stderr. Warnings mean the answer may be incomplete.

For a requested Moodle write outside Assignment or Quiz, use `course --help` for the command syntax, supply every ID and input explicitly, and append the hidden `--agent` flag. Run it in a local PTY. Parse only JSON lines with `schema: 1`; the PTY may also echo typed input. A `preview` event gives the exact target and, for messages/forum posts, the full outgoing text. Relay it in chat. When `confirmation_required` arrives, wait for the student's approval of that preview, then send `yes` to the same PTY; send `no` if declined. Read `result.result` or `error.code`/`error.message`; `code: cancelled` confirms refusal. Use a read command to verify the effect. Do not retry an uncertain write automatically. Without `--agent`, the existing human TUI still works.

## ID map

`course list` supplies course IDs. `assignment list` supplies assignment IDs; `quiz list` supplies quiz IDs; `quiz attempts` supplies attempt IDs. A Moodle link such as `mod/assign/view.php?id=127833` contains a **course-module ID**, not necessarily an assignment ID. Resolve the instance through the relevant list before calling `assignment status` or `quiz view`. Forum, discussion, post, conversation, user, and module IDs are likewise distinct.

## Example: report unfinished deadlines

```sh
course auth status
course deadlines --days 30 --overdue
course list --all
course assignment status 39794
```

For a request like “còn deadline nào tôi chưa làm”, start with the 30-day window plus overdue work, then map course IDs to names with `list --all`. Use the assignment ID from the deadline output to check ambiguous submission states. A saved draft or uploaded file alone does not mean `submitted`; report due date and cutoff separately. For quizzes, check attempts before saying they are unfinished; a deadline alone does not prove that. If API warnings or a failed status lookup prevent confirmation, label the item unverified. Summarize results for the student rather than pasting raw JSON. Times are in `Asia/Ho_Chi_Minh`.

## Common mistakes

- `course list` defaults to the current academic year; deadlines still consider every enrolled course. Use `--all` when the course inventory must be complete.
- `course quiz status` deliberately leaves active-attempt end time and answer counts unknown because some Moodle reads can process an expired attempt. Do not infer time remaining from null fields.
- `course grades` can fail with `nopermissiontoviewgrades`; this is a permissions error, not an empty gradebook.
- Treat Moodle warnings as partial-result evidence, even if the process exits successfully.
