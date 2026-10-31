# Install HCMUS Course in OpenCode

OpenCode 2 can install the skills as a Git-backed plugin. The plugin is a small
TypeScript adapter that registers the five skills in `plugins/hcmus-course/skills`.
It does not bundle or run a Moodle server.

## Install

```sh
opencode plugin add 'github:NgBaoAnn/hcmus-course#main::path:plugins/hcmus-course'
```

Restart OpenCode. Ask it to use the `setup` skill, or install the CLI yourself:

```sh
npm install -g hcmus-course-cli
course doctor
course auth login
```

The CLI requires Node.js 22 or newer. Login opens your default browser. Complete
Microsoft sign-in yourself; never send credentials or tokens in chat. To check
installation, ask OpenCode to list the available skills and find `using-course-cli`.

## Update

Run `opencode plugin update` to check and update the configured Git package. If
the exact `#main` selector stays cached, remove and add the package again, then
restart OpenCode. Update the CLI separately with `npm update -g hcmus-course-cli`.

## Older OpenCode versions

If your OpenCode version does not support Git package plugins, clone this repo
and copy the five directories from `plugins/hcmus-course/skills` into
`~/.agents/skills/`. Restart OpenCode after copying, and repeat after a skill
update. See the [root README](../README.md) for the copy command.
