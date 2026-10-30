# Course CLI agent write mode

The existing CLI remains the human interface. An opt-in hidden `--agent` flag on Moodle write commands gives Codex a stable line-delimited JSON event stream while preserving the current interactive consent gate.

Each event has `schema: 1`, `event`, and `operation`. A write emits a `preview` with the exact proposed target/content, then `confirmation_required`; the agent presents that preview in chat and sends `yes` to the same waiting PTY only after student approval. It emits a typed `result` or `error`. The flag requires an interactive stdin and explicit IDs/options. It never bypasses Moodle preflight, stale-state checks, or confirmation.

Message and forum previews include the exact outgoing text as well as recipient/target. Quiz emits typed `question` (slot/type/text/choices), `input_required`, `answer_saved` after readback verification, and `summary` before final submission confirmation. Existing TUI output and command names are unchanged without the flag. The plugin skills teach agents to use the event stream and interpret saved/uncertain states conservatively.

Tests use mocked Moodle responses; no real write is performed.
