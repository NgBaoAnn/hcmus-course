---
name: setup
description: Use when setting up the HCMUS Course plugin, when the course command is missing, or when Moodle authentication has expired.
---

# Set up HCMUS Course

The plugin supplies instructions only. The `course` CLI must be installed separately on the student's computer, with Node.js 22 or newer. Never claim the CLI is published on npm until its package and version are verified in the registry.

1. Check `course --help` and `node --version`. If `course` exists, run `course doctor` and `course auth status`.
2. If it is missing, check `npm view hcmus-course-cli version`. If the registry returns a version, run `npm install -g hcmus-course-cli`. If the package is unavailable, use an existing checkout of `https://github.com/NgBaoAnn/portal-cli` or clone it to a suitable writable work directory. From the checkout root run `npm ci`, then `npm link` inside `packages/cli`. Verify with `course --help` and `course doctor`. Never install an unverified package name.
3. If unauthenticated, run `course auth login` in a local interactive terminal. It opens the operating system's default browser; let the student complete Microsoft sign-in and MFA there. Never ask for or display passwords, cookies, or tokens. Verify with `course auth status`.

If installation or login fails, report the exact failing step and diagnostic. Do not proceed with Moodle reads or writes until authentication works.
