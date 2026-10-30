---
name: taking-course-quizzes
description: Use when an agent needs to inspect, start, resume, answer, submit, or review a Moodle quiz through the HCMUS FIT Course CLI.
---

# Taking Course Quizzes

## Overview

Quiz reads and active-attempt operations have different effects in Moodle. Keep a read-only request on read-only commands; starting, resuming, and submitting can affect a live attempt or its timer.

If `course` is unavailable or unauthenticated, follow the plugin's [setup skill](../setup/SKILL.md).

## Quick reference

| Need | Command | ID |
| --- | --- | --- |
| Find quiz | `course quiz list [--course <course-id>]` | Course ID optional |
| Read quiz settings | `course quiz view <quiz-id>` | Quiz ID |
| Find attempts | `course quiz attempts <quiz-id>` | Quiz ID |
| Read safe attempt status | `course quiz status <attempt-id>` | Attempt ID |
| Review finished attempt | `course quiz review <attempt-id>` | Attempt ID |
| Start new attempt | `course quiz start <quiz-id> --agent` | Quiz ID |
| Answer current attempt | `course quiz resume <attempt-id> --agent` | Attempt ID |
| Finish attempt | `course quiz submit <attempt-id> --agent` | Attempt ID |

The `id=` in a Moodle `mod/quiz/view.php` link is a course-module ID, not necessarily the Quiz ID. Resolve IDs through `quiz list` and `quiz attempts`. Read commands are safe for reporting; `start`, `resume`, and `submit` require an interactive terminal and confirmation. Never use them to satisfy a read-only request.

## Active attempts

`quiz status` intentionally returns `endtime: null` and `answeredQuestions: null` for an active attempt: Moodle's more detailed APIs may process an expired attempt. Null means **unknown**, not unlimited time or zero answers. For an exact live timer or question state under a read-only request, direct the student to the Moodle website. Leaving the CLI does not pause Moodle's timer.

For Codex, use `--agent` on write commands with explicit IDs in a local PTY. Parse only JSON lines with `schema: 1`; PTY input may echo. A `preview` followed by `confirmation_required` asks for approval. `start` and `resume` stages can open or alter a live attempt; show the preview in chat before sending `yes`. During an attempt, a `question` event contains slot, type, text and choices. `input_required` asks for the answer or navigation. Propose a specific answer in chat and obtain the student's approval **before** sending it to the PTY, because changes save immediately. Wait for `answer_saved` with the same slot before advancing or claiming the answer was saved. Enter keeps the existing answer; `:clear` deletes it; `:quit` exits the question. The page menu accepts `next`, `back` when allowed, `submit`, or `quit`; if sequential navigation prevents going back, explain that consequence and get approval before sending `next`.

`quiz submit <attempt-id> --agent` has two approval stages. Start it only after the student asks to submit: stage `read_summary` permits a fresh summary read and may process expiry. The CLI then emits `summary` and a second `preview`/`confirmation_required` at stage `submit`. Show the summary and final preview in chat, then wait for explicit approval before sending the second `yes` to the same PTY. `result.result.state: finished` confirms completion; `paused` means saved answers remain but the attempt was not submitted, including when final approval was declined. `error.code: cancelled` means an earlier confirmation was declined. On another `error`, `uncertain`, or conflict, check `quiz status` and the website; never blindly retry. Password-protected quizzes require the website in agent mode. Without `--agent`, the human TUI remains available.

## Supported scope

The CLI supports deferred-feedback quizzes with description, multichoice, true/false, short answer, numerical, match, and gapselect controls. A quiz with essay must be **started on the website** because attachment requirements cannot be determined safely before starting. An already started attempt can accept essay **plain text without attachments** if its control is verified. Essay PDF/upload, drag-and-drop, adaptive/interactive/CBM, Safe Exam Browser, proctoring, IP restrictions, and unsupported access rules require the website. The CLI never chooses answers automatically.

## Example

For a student who wants to continue attempt 42 with an essay PDF attachment, use `course quiz status 42` to report what is safely known, then send them to the website for the attachment and final submission. Do not promise a `course quiz resume 42` upload path: the CLI has none.

## Common mistakes

- `quiz resume` takes an Attempt ID; `quiz start` takes a Quiz ID.
- `quiz review` applies to finished attempts and respects Moodle's review permissions.
- `quiz start` does not reuse an in-progress attempt; use `quiz resume` when appropriate.
