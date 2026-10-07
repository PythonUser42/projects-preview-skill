---
name: mobile-desktop-preview
description: Make any local web UI available on a phone through a private desktop-sized PWA preview. Use for “send this UI to my phone”, “preview this project on mobile”, or adding projects to a private installable Projects hub without rebuilding their layouts.
---

# Mobile Desktop Preview

This skill directory is the reusable wrapper and CLI. Resolve its absolute path before running commands; do not assume the current project is this directory. Keep target source and data in their own project. Attaching changes the wrapper configuration, not the target's UI.

## Add a project

Read the target's local instructions and identify its loopback origin, entry route, and start command. Reuse a healthy existing server. For an app that must be started, follow its own start procedure; use `--start-command-json` only when the wrapper should own that process. Never start a second process on an occupied port.

Run from this skill directory (replace the example values):

```sh
node scripts/attach.mjs --name "My UI" --profile my-ui \
  --target http://127.0.0.1:3000 --project-dir /absolute/path/to/project --up
```

- `--up` refreshes the persistent macOS runtime and verifies the attachment. Omitting it only writes configuration; use `npm start` for foreground operation or on other systems.
- `--entry-path /dashboard` selects a page inside the app. `--target` is an origin with no path.
- `--desktop-width 1440 --desktop-height 900` controls the fixed iframe viewport.
- `--start-command-json '["npm","run","dev","--","--host","127.0.0.1","--port","3000"]'` optionally owns the app process. Use its actual command, not necessarily this Vite example. Omit this option for an independently managed server.
- For plain HTML, run a loopback static server in its artifact directory, for example `python3 -m http.server 3000 --bind 127.0.0.1 --directory /absolute/path/to/artifacts`, and attach that origin. Avoid serving a directory containing secrets.

Switch a previously saved project with:

```sh
node scripts/attach.mjs --list
node scripts/attach.mjs --use my-ui --up
```

Profiles and the last CLI selection are local ignored files. Every saved `--profile` appears in the Projects home; use stable distinct profile names when adding apps. The service runs every saved preview concurrently. New profiles automatically receive separate local preview ports (5180, 5181, …) and private HTTPS phone ports (8443, 8444, …); existing profiles retain their addresses. Override with `--preview-port` and `--phone-port` only when necessary. The Projects hub stays on `--hub-port` (default 5180).

The home page stays on the hub origin while its preview shell frames the selected project's own origin. Opening another project does not reroute existing tabs. Different ports separate localStorage and service workers, but cookies are scoped by hostname, not port; projects requiring cookie isolation need different hostnames. Browser state does not migrate when changing a project's port. The UI lists offline target servers honestly; keep each target running independently or provide its managed command.

## Phone URL and verification

The shell URL is `http://127.0.0.1:5180/__preview/` by default. Phone access requires a private reachable route to this wrapper port. Install the PWA from this Projects home using Safari → Share → Add to Home Screen. Its home works in portrait or landscape; desktop previews offer a Projects back link; landscape gives more room, but both orientations work. The live iframe stays at its configured desktop dimensions with no CSS scaling or clipping. Native page zoom handles magnification; never add pinch/resize handlers that mutate frame or app layout. Physical orientation changes may refit and recenter the outer shell once after rotation settles, without resizing or navigating the iframe. The shell works offline, but live target apps still require the Mac and Tailscale.

Read [references/phone-access.md](references/phone-access.md) to configure or verify Tailscale and persistent operation.

`--up` checks HTML/MIME type, wrapper assets, the selected app name/dimensions/entry path, and target HTML. It exits unsuccessfully on an unavailable target or stale attachment. Run `npm run check` to repeat it, or `node scripts/check.mjs --url https://PRIVATE-HOST:8443` to check the phone route. Do not report “ready” based solely on a process or Tailscale mapping.

Open the wrapper at a landscape phone viewport and interact with a harmless control inside the app. Check live reload when it is part of the workflow. The proxy forwards WebSocket upgrades; the target may still require its normal allowed-host/origin and HMR settings for the exact private HTTPS origin. Preserve those security checks and consult that project's framework guidance if rejected. Apps that prohibit framing may need an explicit local preview setting or the shell's “No frame” link.

Return the exact verified private `/__preview/` link and the attached project name. An old Home Screen icon may point to another origin or preview; compare its URL. Desktop browser tests do not prove iOS pinch-zoom stability. If phone-only failures persist, establish which URL/version and gesture the user is using before claiming a fix.

## Maintenance

Wrapper assets are served from a local runtime copy when installed as a service. After editing wrapper files or switching configuration, run `npm run service` (or attach with `--up`) to refresh it. Target source is not copied; its own live dev server supplies updates. For substantive wrapper behavior changes, use the single browser E2E flow (`npm test`) when relevant; it produces a trace, screenshot, and report in `test-results/`. Do not add implementation-mirroring unit tests or run the suite for routine attachments, wording edits, or other trivial changes. After the relevant check passes, stop unless new evidence warrants more testing. Never cache target app data in the wrapper service worker.

## Claude Code and Codex

The same folder is installed at `~/.codex/skills/mobile-desktop-preview` and `~/.claude/skills/mobile-desktop-preview`. In Codex invoke `$mobile-desktop-preview`; in Claude Code invoke `/mobile-desktop-preview`. Resolve the symlink to this tool directory before running the CLI. Both agents add profiles to the same Projects hub; no project-specific copy is needed.
