# Codex Course Plugin Design

## Intent

Students install a local Codex skills plugin and ask for Moodle work in natural language. The agent checks for the separately installed `course` CLI, guides setup when necessary, reads structured output, prepares local deliverables, and presents the exact Moodle write preview in chat before confirmation. Existing terminal users retain the same commands and TUI.

## Approaches

- **Chosen: skills with a separately installed global CLI:** keeps the plugin small and allows the CLI to be published and updated through npm. The setup skill checks the CLI and guides installation and authentication.
- Skills with a bundled CLI executable: one plugin installation, but duplicates the CLI release and makes npm updates invisible to the plugin.
- MCP server: structured tool calls, but a second protocol and authentication surface that the user explicitly does not want.

## Package

`plugins/hcmus-course` is a portable Agent Plugins package with `plugin.json` and `skills/`. The manifest declares `extensions.com.openai.requires_local_executor: true` and an onboarding skill. A repo marketplace entry makes it discoverable in local Codex. No MCP server or configuration is packaged. The plugin contains instructions, not a copy of the CLI or credentials.

The CLI remains a TypeScript npm package in `packages/cli`, with Node.js >=22 required. It will be published separately later. Until the npm release, the setup skill can guide a local development install from this repository; it must not claim a package already exists on npm. The release/install instructions describe both paths and Microsoft login through the default browser.

## Agent workflow

1. Check that `course` is installed and is the expected HCMUS CLI. If absent, guide installation without inventing an unpublished npm package. Run `auth status`; if needed, launch `auth login` and let the student complete Microsoft SSO/MFA in their browser.
2. For a deadline prompt, call `deadlines --days 30 --overdue` and `list --all` to map course names. Check ambiguous per-assignment states before saying an item is submitted or outstanding. Carry Moodle warnings and unknown states into the answer.
3. For “do that assignment,” resolve the referenced Assignment ID, read `assignment view` and `status` as JSON, download attachments when relevant, produce the requested artifact in a local working directory, and validate it as appropriate to the task.
4. Start `assignment submit` with explicit ID and files in a PTY. Relay the CLI's current preview to chat; wait for the student's approval of that exact submission. The agent then sends `yes` to the waiting PTY and checks `assignment status` afterward. On timeout or uncertain state, inspect before any retry.
5. Quiz answers are approved before entry because they save immediately. Final quiz submission has separate summary-reading and finalization confirmations.

## Constraints

- No automatic Moodle write merely from a broad prompt. A student can authorize preparing a solution in the initial prompt, while the final submission is approved against a concrete preview in chat.
- CLI file arguments replace the entire assignment file set; skills must gather all files intended to remain.
- Do not expose passwords, MFA codes, Moodle tokens, or private quiz contents in logs or plugin artifacts.
- The local plugin works only where Codex can run shell commands and access the student's browser and files. Cloud execution and public directory submission are outside this change.
- Preserve `course --help` as human-facing; the hidden `--json` option is for agents and scripts. All read commands should emit JSON when stdout is not a terminal.

## Verification

Run existing CLI tests, test JSON and PTY paths with mocked Moodle responses, validate the plugin manifest and local marketplace, and pressure-test the skills against the two example prompts plus a write-cancellation case. Do not submit real coursework during tests.
