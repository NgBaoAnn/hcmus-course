---
name: submitting-course-assignments
description: Use when a student asks an agent to read, solve, prepare, upload, submit, verify, or troubleshoot a Moodle Assignment through the HCMUS FIT Course CLI.
---

# Submitting Course Assignments

## Overview

`course assignment submit` writes to a student's Moodle Assignment. A file argument is the **complete replacement file set**, and an upload or saved draft is not proof of final submission.

If `course` is unavailable or unauthenticated, follow the plugin's [setup skill](../setup/SKILL.md). For “làm bài tập đó và nộp bài”, resolve “đó” from the conversation or ask only if several assignments remain plausible. Read the full prompt and attachments, produce the requested answer as local files or UTF-8 text, and check the artifact against the assignment requirements before starting a submission. Show the student the finished artifact and any limits you could not verify.

## Quick reference

| Need | Command |
| --- | --- |
| Find assignment ID | `course assignment list [--course <course-id>]` |
| Read prompt and attachments | `course assignment view <assignment-id>` |
| Inspect submission and group state | `course assignment status <assignment-id>` |
| Download prompt attachments | `course assignment download <assignment-id> [--output <directory>]` |
| Submit files or plain text | `course assignment submit <assignment-id> [files...] [--text-file <path>] [--draft] --agent` (agent execution) |

The number in `mod/assign/view.php?id=...` is a course-module ID; resolve it to the Assignment ID from `assignment list`. Read `view` and `status` before preparing a write. Confirm due date versus cutoff, accepted plugins, file count/size/type, existing draft files and text, group rules, and whether Moodle already says `submitted`. The CLI cannot reopen a submitted assignment.

## File-set procedure

If the student wants to add or replace one file while keeping others, collect **local copies of every file that should remain** and pass all of them to `submit`. For example, when both files are available locally:

```sh
course assignment status 39794
course assignment submit 39794 report.pdf slides.pdf --agent
course assignment status 39794
```

The CLI preview must list the intended final file set. `assignment download` fetches **assignment prompt attachments**, not a backup of submitted files. If a required existing file is unavailable locally, do not confirm a replacement; obtain it through Moodle or the student first. If no files are passed, the existing file set is kept. If `--text-file` is absent, existing online text is kept where Moodle permits it; the file is read as UTF-8 plain text. `--draft` requests a save only and is rejected when Moodle saves directly as final.

## Confirmation and result

Append `--agent` to enable structured JSONL output on stdout. The flag does **not** bypass confirmation and works with piped stdin or a terminal session (no PTY required).

**Execution options:**
- **Piped confirmation (one-shot after user consent):** When the user has already explicitly approved the preview content and file list in chat, pipe `yes\n` directly:
  ```sh
  printf "yes\n" | course assignment submit <assignment-id> [files...] --agent
  ```
- **Interactive agent stream:** Run with subprocess stdin/stdout attached. Parse lines with `schema: 1`. Relay the `preview.preview` text (account, assignment, full replacement files, online text, draft/final action, group effect, submission statement) in chat. After `confirmation_required`, wait for user approval, then write `yes\n` to process stdin (`no\n` to cancel; `error.code: cancelled` confirms no write occurred).

Inspect `result.result.state` and recheck `assignment status`: `submitted` means final submission, `saved` means draft only, and `uncertain` means verification failed. A group may still need other members to confirm. On any `error`, timeout, or uncertainty, inspect status and the website; never retry a write or claim success automatically. Without `--agent`, the human TUI remains available.

## Common mistakes

- Passing only `slides.pdf` removes `report.pdf` from the file set if the write proceeds.
- An uploaded file, draft, or successful process exit is not equivalent to `submitted`.
- An Assignment ID is not interchangeable with the course ID or course-module ID.
- The CLI supports standard file and online-text plugins; unsupported submission plugins require the website.
