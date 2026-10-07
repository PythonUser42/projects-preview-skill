# Mobile Desktop Preview

A reusable Codex and Claude Code skill for opening local web apps in a private phone Projects app. Each app keeps its desktop layout inside a browser frame. Includes the wrapper, CLI, and setup instructions only; no sample projects or personal configuration.

## Requirements

- Node.js 22 or newer
- A local web app running on a loopback address
- For phone access: Tailscale on your computer and phone, connected to the same private network
- macOS for the optional persistent LaunchAgent; foreground operation works on other systems

## Install

Clone this repository into a directory you control:

```sh
git clone https://github.com/PythonUser42/projects-preview-skill.git
cd projects-preview-skill
mkdir -p ~/.codex/skills ~/.claude/skills
ln -s "$PWD" ~/.codex/skills/mobile-desktop-preview
ln -s "$PWD" ~/.claude/skills/mobile-desktop-preview
```

Skip a symlink if you already have a skill at that location. The wrapper has no runtime dependencies. Invoke `$mobile-desktop-preview` in Codex or `/mobile-desktop-preview` in Claude Code.

## Attach your app

Start your app using its normal command, listening on `127.0.0.1`. Then:

```sh
node scripts/attach.mjs --name "My App" --profile my-app \
  --target http://127.0.0.1:3000 --project-dir /absolute/path/to/app --up
```

On macOS, `--up` installs the wrapper service, preserves existing Tailscale routes, and checks readiness. It prints your private Projects URL. Open that URL in Safari on your phone, then Share → Add to Home Screen. Your computer and target app must remain running. macOS may require permission for background access to Desktop/Documents projects.

For foreground operation, omit `--up`, then run `npm start`. Open `http://127.0.0.1:5180/__preview/` locally. See [private phone access](references/phone-access.md) for routing and persistence.

Add more apps with distinct profile names. Use `node scripts/attach.mjs --list` to list your saved apps. See [SKILL.md](SKILL.md) for viewport size, entry paths, optional managed start commands, and verification.

## Privacy

Targets and the wrapper listen on loopback. Phone access uses private Tailscale Serve, not public Funnel. Local profiles, paths, and selected configuration are ignored by Git. Do not commit your profiles, credentials, logs, or app data. Target projects stay in their own directories. Cookie isolation requires separate hostnames; ports alone do not isolate cookies.

## Verify

```sh
npm run check
```

This checks the selected running preview. For development changes, install the optional browser test dependencies with `npm install`, then run `npm test`. The isolated browser flow uses Chrome on macOS; on other systems first run `npx playwright install chromium`. Test artifacts stay in ignored `test-results/`.
