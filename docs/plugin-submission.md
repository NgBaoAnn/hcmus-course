# HCMUS Course plugin release

## GitHub installation

The root [README](../README.md) gives the Claude Code, Codex, OpenCode,
Antigravity, Cursor, Copilot, and generic Agent Skills install commands. The
plugin is `hcmus-course` version `0.3.0`; the separately published CLI is
`hcmus-course-cli@0.1.0`. Merge the distribution branch into
`main` before giving the `#main` instructions to other students.

## Codex directory package

From the repository root, run `sh scripts/package-plugin.sh`. It generates the
release ZIP at `dist/plugin/hcmus-course-0.3.0-codex.zip`.
It contains only `plugin.json`, the four `skills/*/SKILL.md` files, the plugin
README, and icon assets. The ZIP contains no credentials, MCP configuration,
CLI source, or repository metadata. Recreate it after any change to these files.

Suggested listing:

- Name: **HCMUS Course**
- Subtitle: **Study with HCMUS Course**
- Description: Use the local Course CLI to check deadlines, read course and
  assignment content, prepare submissions, and work through quizzes. Moodle
  writes require a concrete preview and the student's approval in chat. The
  plugin runs only in a local agent session with the CLI installed.
- Website: `https://github.com/NgBaoAnn/hcmus-course`
- Category: Productivity

The OpenAI developer portal needs a verified developer identity and a ZIP upload.
After its checks pass, submit the draft for review and publish only after
approval. The skills-only package does not need MCP test cases. Public listing
is separate from the GitHub marketplace installation.

## Claude directory

The GitHub marketplace works without directory approval. Anthropic's directory
submission uses the repository URL and the `.claude-plugin` manifests; it
requires an eligible Claude plan and Anthropic review. The plugin is not listed
in that directory yet.
