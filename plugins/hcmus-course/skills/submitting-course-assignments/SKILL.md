---
name: submitting-course-assignments
description: Use when a student asks an agent to inspect requirements, read, solve, prepare, upload, submit, verify, or troubleshoot a Moodle Assignment through the HCMUS FIT Course CLI, including questions like "yêu cầu bài tập này là gì" or "cần nộp những gì cho đồ án".
---

# Submitting Course Assignments

## Overview

`course assignment submit` writes to a student's Moodle Assignment. A file argument is the **complete replacement file set**, and an upload or saved draft is not proof of final submission.

If `course` is unavailable or unauthenticated, follow the plugin's [setup skill](../setup/SKILL.md). When a student asks about assignment requirements or asks to prepare and submit an assignment ("yêu cầu bài tập này là gì", "làm bài tập đó và nộp bài"), **never rely solely on the brief assignment description**. Instructors and TAs frequently publish critical requirements, errata, file naming conventions, and zip packaging structures across prompt attachments, course forums, and section notes. Conduct an **Exhaustive Requirement Discovery** before preparing or submitting any file.

## Exhaustive Requirement Discovery

Before producing deliverables or submitting files, gather the full specification through four complementary sources:

### 1. Assignment Prompt & System Settings
Run:
```sh
course assignment view <assignment-id>
course assignment status <assignment-id>
```
Extract:
- Exact deadline (`duedate`) and hard cutoff (`cutoffdate`)
- Submission types allowed: file submissions (`maxfilesubmissions`, `maxsubmissionsizebytes`, `filetypeslist`) and/or online text
- Prompt text and submission statement requirements
- Attached prompt files (`introattachments`)

### 2. Prompt Attachments & Rubrics
If `introattachments` lists any files (PDF, Word, ZIP, rubric):
```sh
course assignment download <assignment-id> --output <destination-directory>
```
Read the downloaded PDF, markdown, or text files directly. Often the full rubric, test case guidelines, and code skeleton reside only in these attachments.

### 3. Course Forums & TA Announcements (Critical Errata & Naming Rules)
Instructors and TAs routinely post clarification threads, sample inputs/outputs, and strict file/folder naming rules on the course forums:
```sh
course forum list --course <course-id>
```
For all relevant forums (especially "Hỏi đáp", "Thông báo bài tập", "Thảo luận Lab"):
```sh
course forum discussions <forum-id>
```
Look for discussions mentioning the assignment name or lab number (e.g., "Lab 1", "Đồ án giữa kỳ"). If found, read the full thread with:
```sh
course forum view <discussion-id>
```
Note any overrides: e.g., "MSSV_HoTen.zip", "không nộp thư mục bin/obj", "được nộp muộn thêm 1 ngày", or bug fixes in test cases.

### 4. Section Context & Supplemental Notes
Check the section where this assignment is placed for supplementary notes, FAQs, or teacher guidelines:
```sh
course view <course-id>
```
Read the relevant section summary and module descriptions for any caveats.

### 5. Present the Consolidated Checklist
Present a concise, structured checklist to the student covering:
- **Core functional requirements** (from prompt and attachment)
- **Packaging & Naming conventions** (e.g., `23120190_23120202.zip` with root structure)
- **Allowed file types & constraints**
- **Deadline, cutoff, and grace period rules** (incorporating any forum notes)

---

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
