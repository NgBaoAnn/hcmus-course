# HCMUS Course agent plugin

Five skills guide local Codex, Claude Code, OpenCode, Antigravity, Cursor, and other agents through the
`hcmus-course-cli` commands for HCMUS FIT Moodle. Install the CLI separately with
`npm install -g hcmus-course-cli`; run `course doctor` and `course auth login` on
the student's computer. The plugin contains no Moodle credentials or MCP server.

The skills cover setup, read-only workflows, Assignment submission and requirement cross-checking,
comprehensive announcement and update inspection, and Quiz attempts. Agent writes use `--agent` with
piped confirmation or an interactive stream, show the concrete preview in chat, and wait for the student's
approval before confirming.

See the [repository README](../../README.md) for installation on each agent host.
