---
name: taking-course-quizzes
description: Use when an agent needs to inspect, start, resume, answer, submit, or review a Moodle quiz through the HCMUS FIT Course CLI.
---

# Taking Course Quizzes

## Overview

Quiz reads and active-attempt operations have different effects in Moodle. Keep a read-only request on read-only commands; starting, resuming, and submitting can affect a live attempt or its timer.

## Quick reference

| Need | Command | ID |
| --- | --- | --- |
| Find quiz | `course quiz list [--course <course-id>]` | Course ID optional |
| Read quiz settings | `course quiz view <quiz-id>` | Quiz ID |
| Find attempts | `course quiz attempts <quiz-id>` | Quiz ID |
| Read safe attempt status | `course quiz status <attempt-id>` | Attempt ID |
| Review finished attempt | `course quiz review <attempt-id>` | Attempt ID |
| Start new attempt | `course quiz start <quiz-id>` | Quiz ID |
| Answer current attempt | `course quiz resume <attempt-id>` | Attempt ID |
| Finish attempt | `course quiz submit <attempt-id>` | Attempt ID |

The `id=` in a Moodle `mod/quiz/view.php` link is a course-module ID, not necessarily the Quiz ID. Resolve IDs through `quiz list` and `quiz attempts`. Read commands are safe for reporting; `start`, `resume`, and `submit` require an interactive terminal and confirmation. Never use them to satisfy a read-only request.

## Active attempts

`quiz status` intentionally returns `endtime: null` and `answeredQuestions: null` for an active attempt: Moodle's more detailed APIs may process an expired attempt. Null means **unknown**, not unlimited time or zero answers. For an exact live timer or question state under a read-only request, direct the student to the Moodle website. Leaving the CLI does not pause Moodle's timer.

When the student explicitly wants to continue, `quiz resume <attempt-id>` accepts answers in an interactive terminal. An agent can enter an answer through its PTY after the student supplies or approves that specific answer in chat; the student need not type in the terminal. A changed answer is saved immediately, so obtain approval **before** entering it. Enter keeps the existing answer; `:clear` deletes it; `:quit` exits the question. The page menu has `next`, `back` when allowed, `submit`, and `quit`. Sequential navigation may prevent going back. Save acknowledgement is checked with Moodle; do not assume a typed answer was recorded after a timeout. `quiz submit <attempt-id>` has **two** `yes` prompts: the first permits reading a fresh summary and may process expiry, so only start this after the student requests submission; the second finalizes the attempt. The agent may answer the first through its PTY, then must show the fresh summary in chat and wait for explicit approval before sending the second `yes` to that same PTY process. After an uncertain finish, check status and the website; do not blindly retry or claim completion.

## Supported scope

The CLI supports deferred-feedback quizzes with description, multichoice, true/false, short answer, numerical, match, and gapselect controls. A quiz with essay must be **started on the website** because attachment requirements cannot be determined safely before starting. An already started attempt can accept essay **plain text without attachments** if its control is verified. Essay PDF/upload, drag-and-drop, adaptive/interactive/CBM, Safe Exam Browser, proctoring, IP restrictions, and unsupported access rules require the website. The CLI never chooses answers automatically.

## Example

For a student who wants to continue attempt 42 with an essay PDF attachment, use `course quiz status 42` to report what is safely known, then send them to the website for the attachment and final submission. Do not promise a `course quiz resume 42` upload path: the CLI has none.

## Common mistakes

- `quiz resume` takes an Attempt ID; `quiz start` takes a Quiz ID.
- `quiz review` applies to finished attempts and respects Moodle's review permissions.
- `quiz start` does not reuse an in-progress attempt; use `quiz resume` when appropriate.
