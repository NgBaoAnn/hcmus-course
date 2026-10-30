# Course CLI agent write mode implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give agents structured, safely confirmed write workflows without changing human CLI use.

**Architecture:** Add a small AgentSession that emits JSONL events and reads answers from an interactive terminal. Wire it to existing confirmation hooks and quiz interaction hooks; route final results through it only under `--agent`.

**Tech Stack:** TypeScript, Node.js 22, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-30-course-agent-write-mode.md`

## Constraints

- Keep all existing commands and TUI behavior when `--agent` is absent.
- No noninteractive write bypass; approval still requires `yes` after the preview.
- Keep write preflight, concurrency checks, verification, and uncertain-state behavior.
- Do not expose auth tokens or secret quiz passwords in events.

## Tasks

### 1. Agent event transport

- [x] Write a failing test for JSONL `preview`, `confirmation_required`, `result`, and cancellation.
- [x] Implement `packages/cli/src/agent.ts` with schema version 1 and interactive input.
- [x] Run targeted tests.

### 2. Assignment and simple Moodle writes

- [x] Write failing CLI tests for `assignment submit`, message/forum text preview, no-TTY refusal, and stable results.
- [x] Accept hidden `--agent` on assignment, forum, messages, completion, notifications, favourites, and event writes; pass session confirmation hooks and emit final result.
- [x] Include exact message/forum body in write preview, preserving human confirmation.
- [x] Run targeted tests.

### 3. Quiz interaction events

- [x] Write failing quiz tests for structured question, verified answer-save, and summary events.
- [x] Add quiz event hooks and stage-specific confirmation; wire `--agent` start/resume/submit.
- [x] Run quiz and CLI tests.

### 4. Skills and verification

- [x] Pressure-test existing skills against the new mode, revise only demonstrated gaps, then re-test.
- [x] Update README and sync installed skill copies.
- [x] Run full tests, diff check, and final review. Push branch and open or update a PR as appropriate.
