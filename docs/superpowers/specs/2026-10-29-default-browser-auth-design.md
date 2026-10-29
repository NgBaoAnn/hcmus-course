# Default-browser Moodle login

## Intent

`course auth login` must open the operating system's default browser so students do not need Chrome or another specific browser. Moodle returns the mobile-service token through a `coursecli://` URL, so the CLI needs a per-user OS protocol handler to return that URL to the running CLI process.

## Goals and boundaries

- Open the public Moodle login URL with the system default browser on macOS, Windows, and Linux.
- Register `coursecli://` for the current user only; do not require administrator privileges or replace an existing handler.
- Validate every callback against the one-time passport generated for the current login before calling Moodle or saving credentials.
- Keep the current token file format, `0600` permissions, identity verification, and atomic save behavior.
- Remove this CLI's protocol registration on `auth logout`.
- Do not automate the browser, read browser profiles, or ask users to copy token links.

## Approaches

1. **OS protocol handler (selected).** Register a per-user handler and let any default browser return Moodle's custom URL to the CLI. It preserves automatic token capture and supports browsers independently of their automation APIs; it requires small OS-specific registration adapters.
2. **Manual link paste.** Open the default browser and ask users to paste the token URL. It avoids OS registration but exposes the token to clipboard history and adds a fragile manual step.
3. **Browser automation.** Keep Playwright and support selected Chromium brands. This cannot support arbitrary default browsers and is the behavior being replaced.

## Design decisions

- Register at login and unregister at logout. OS registration is per-user and limited to the unique `coursecli` scheme.
- Refuse registration if another handler already owns `coursecli`; never override another application.
- Callback invocations receive only the custom URL, validate its scheme, base64 payload, and one-time passport, verify the token with Moodle, then atomically save it.
- The login process waits for a short-lived, permission-restricted completion record. Timeout/failure removes pending state and preserves any previous token.
- Use OS-native commands without a shell for registration/opening where possible. Escape the macOS AppleScript URL argument with AppleScript's quoted-form operation.
- `auth logout` removes the local token and this CLI's registration; it does not revoke the token on Moodle.

## Risks

- OS protocol registration behavior varies by desktop environment. Implementations must be tested on each OS; unsupported desktop configurations must fail with an actionable message and preserve prior auth state.
- Browser/OS may ask the user to confirm opening the CLI handler. The callback remains unusable without a matching pending passport.
