# Readable Terminal Output Design

## Intent

Make the existing one-command-at-a-time CLI easier for students to scan, especially when checking courses, assignments, quizzes, grades, notices, and deadlines.

## Goals and non-goals

- Format human-readable list and detail output with clear headings, compact labels, localized dates, and readable status names.
- Keep `--json` output and the existing command grammar unchanged for scripts.
- Keep diagnostics on stderr and ordinary results on stdout.
- Do not add a full-screen TUI or a rendering dependency.
- Keep `doctor`, `auth status`, and `probe` JSON output unchanged, as documented.

## Approaches

1. **Aligned tables:** compact for short ASCII data, but long course names and Vietnamese text can wrap and break column alignment in narrow terminals.
2. **Labeled cards:** one item per block with short labels; uses more vertical space but stays readable across terminal widths and Unicode text. **Recommended and selected as the default call** because Moodle names and descriptions are variable length and the CLI has no width-aware rendering dependency.

## Design

Use small formatting helpers in `terminal.ts`; update the human-readable branches in `course.ts` for courses, assignments, quizzes, deadlines, grades, notices, and detail views. Each list item gets a compact title and relevant fields, with dates shown in the existing Asia/Ho_Chi_Minh timezone. Deadline items clearly distinguish overdue, submitted/in-progress, cutoff, and unknown states without inventing data. Long descriptions and links remain visible beneath the summary.

Use color only when stdout is a TTY and `NO_COLOR` is unset; structure and labels remain understandable without color. JSON paths, API result objects, warning content, and mutation confirmations keep their current behavior.

## Validation

Build TypeScript, inspect representative human-readable output for long Vietnamese names and missing dates/statuses, confirm JSON shape is untouched, and run `git diff --check`.
