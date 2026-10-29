# Readable Terminal Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make default human-readable output easier to scan while preserving the CLI grammar and JSON output.

**Architecture:** Add small terminal formatting helpers in `terminal.ts`, then use them in the existing human-readable output branches in `course.ts`. Keep API data, JSON paths, warnings, and write confirmations unchanged.

**Tech Stack:** Existing TypeScript, Node.js standard library, no new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-10-29-readable-terminal-output-design.md`

## Global Constraints

- `--json` output and command grammar remain unchanged.
- stdout carries results; stderr carries warnings and prompts.
- Output must be readable without color; color is used only for TTY output when `NO_COLOR` is unset.
- Dates use `Asia/Ho_Chi_Minh`; unknown values remain explicit instead of guessed.
- Do not add a full-screen TUI or dependencies.

## Review Focus

- Long Vietnamese names and descriptions wrap naturally in card output; no fixed-width column assumptions.
- Missing dates, null statuses, and unknown Moodle states remain visible and are not fabricated.
- `NO_COLOR`, redirected stdout, and JSON output contain no ANSI styling.
- Unicode content and external descriptions remain sanitized by the existing `render()` helper.
- Existing human confirmation prompts for write operations keep their current wording and behavior.

---

### Task 1: Shared terminal formatting

**Files:**
- Modify: `terminal.ts`
- Modify: `terminal.test.ts`

**Interfaces:**
- Produce: `formatCards(title: string, cards: { title: string; lines: string[] }[]): string`
- Produce: `formatLocalDate(timestamp: number | null | undefined): string`
- Produce: `formatStatus(status: string): string` for known Moodle states, returning unknown values unchanged.

- [x] Implement card headings, indented fields, empty-state output, TTY-aware color, and `NO_COLOR` handling without changing `show()` JSON behavior.
- [x] Format positive Unix timestamps in `Asia/Ho_Chi_Minh`; render absent/non-positive dates as `Không đặt`.
- [x] Map known Moodle states to concise Vietnamese labels; preserve unknown server values.
- [x] Run `npm run build` and inspect the helper diff.

### Task 2: Human-readable command output

**Files:**
- Modify: `course.ts`
- Modify: `course.test.ts`

**Interfaces:**
- Consume the `terminal.ts` formatting helpers from Task 1.

- [x] Apply card output to course, assignment, quiz, deadline, grade, notice, and corresponding detail views.
- [x] Add a CLI integration assertion that assignment list output uses a labeled card and a local date rather than tabs or a Unix timestamp; verified red then green.
- [x] Preserve quiz review question slots, answer details, and Moodle link in cards; regression test observed red then green.
- [x] Keep the quiz link in attempt-list cards and show unfinished submissions clearly; regression test observed red then green.
- [x] Make deadline and assignment dates readable and distinguish overdue/cutoff/state fields without altering source values.
- [x] Keep JSON branches, API return shapes, warnings, and mutation confirmation text unchanged.
- [x] Run `npm test`, `git diff --check`, and inspect sample output for deadline and detail commands.

