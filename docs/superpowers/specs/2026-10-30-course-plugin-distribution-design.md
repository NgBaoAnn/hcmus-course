# Course plugin distribution design

## Intent

Students should install the skills and the published `hcmus-course-cli` from GitHub-backed catalogs in local Codex, Claude Code, and OpenCode. Prepare the same plugin for submission to OpenAI's and Anthropic's public directories. The CLI remains a separate npm package; the plugin never contains Moodle credentials.

## Scope and constraints

- Keep one source of truth for the four skills in `plugins/hcmus-course/skills/`.
- Preserve local CLI execution, explicit user approval for Moodle writes, and the existing `--agent` PTY protocol. Do not add MCP or claim that web chat can reach a student's local CLI.
- Keep the existing Codex marketplace name stable. Add only the format-specific manifests and metadata each host needs.
- The plugin and CLI have separate versions. Bump the plugin version when releasing changed skills; do not republish CLI `0.1.0`.
- Do not submit to a public directory until the package, listing, and tests are reviewable and the owner approves the final submission.

## Approaches

1. **GitHub catalogs first, then official directories (chosen):** Codex installs the current portable package from the GitHub marketplace; Claude Code gets its own manifest and marketplace file; OpenCode 2 reads the four skills from a GitHub-hosted HTTP catalog. This reaches local agents without a new service, while official submissions follow each vendor's review process.
2. **Official directories only:** fewer installation instructions after approval, but developer identity, review, and web-only execution constraints delay use.
3. **Build an MCP backend:** could serve cloud chat, but adds hosted infrastructure and conflicts with the project's skills-plus-CLI direction.

## Package changes

- Add `.claude-plugin/marketplace.json` at the repository root, pointing to `./plugins/hcmus-course`. Add `plugins/hcmus-course/.claude-plugin/plugin.json` with the same stable plugin name, display metadata, and version as the portable manifest.
- Make the existing skills host-neutral where they describe PTY usage. The rules still require preview, chat approval, verification, and no blind retry for writes.
- Add `plugins/hcmus-course/skills/index.json` for OpenCode 2's HTTP catalog. Each entry lists its `SKILL.md`, and the catalog version changes when skill content changes. Document the global local-skill copy fallback for OpenCode 1.
- Add concise cross-platform install and update instructions to the repo README. The plugin setup skill checks the published npm package before installing it.
- Complete Codex public-listing metadata and add square code-native icon assets. Build a ZIP containing only the plugin root for the OpenAI submission portal. Prepare a review checklist for the owner, including verified developer identity and local desktop test.
- Document Anthropic's paid-plan directory submission and local-only limitation. The GitHub marketplace can be installed immediately; directory approval remains a separate external step.

## Verification

- Validate the Claude plugin and marketplace with the installed `claude` CLI; test an isolated install where possible.
- Verify Codex can resolve the GitHub marketplace and load all four skills in a fresh local install.
- Verify the OpenCode catalog paths and load the skills in OpenCode 2, including a no-auth read-only scenario and a write preview that waits for consent.
- Run existing CLI tests and check the final ZIP contains no credentials, build output, or unrelated repository files.

## Remaining owner steps

OpenAI's public directory requires a verified developer identity and ZIP upload/review; Anthropic's directory requires a paid Claude account and repository submission. These portal actions and final public publication happen only after the owner reviews the finished package and listing.
