# Private phone access and persistence

## Tailscale

`--up` runs `scripts/phone-routes.mjs` after installing the local runtime. It checks current Tailscale mappings, preserves existing routes, and adds unused HTTPS listeners for the hub and every saved project. It stops on conflicts instead of overwriting another application. If Tailscale is unavailable, it reports that phone routing still needs setup. Each project's HTTPS port must reach that project's local preview port, because project iframe origins are separate.

Use an existing private route when it already points to this wrapper. Inspect before making changes:

```sh
tailscale serve status
```

On macOS the CLI may be `/Applications/Tailscale.app/Contents/MacOS/Tailscale`. When no suitable route exists and private phone access is requested, use an unused HTTPS listener, keeping existing routes intact:

```sh
tailscale serve --bg --https=8443 5180
```

Read the actual hostname from the output. The phone URL is `https://THAT-HOST:8443/__preview/`, not the target server URL. The phone must be connected to the same tailnet. Do not enable Funnel or publish externally unless explicitly requested.

Verify the complete URL, including content type and nonempty body. An empty 502 can appear as a download on Safari and usually means the wrapper is stopped. A 200 for config alone does not prove that the shell or target loaded.

If this Mac cannot resolve its own MagicDNS name, inspect `tailscale ip -4` and test using `curl --resolve HOST:PORT:TAILSCALE_IP https://HOST:PORT/__preview/`. This preserves hostname and TLS validation. Report the DNS limitation separately; do not disable certificate checks.

## Persistent macOS service

`node scripts/attach.mjs ... --up` installs a LaunchAgent and runs the readiness checks. The installer copies only wrapper runtime files/configuration into `~/Library/Application Support/Mobile Desktop Preview`; the source remains in this skill directory. It preserves the invoking PATH so an optional managed command can find npm and other tools.

The existing per-user service label is `local.mobile-desktop-preview`. Useful inspection:

```sh
launchctl print "gui/$(id -u)/local.mobile-desktop-preview"
tail -30 /tmp/mobile-desktop-preview.error.log
```

Refreshing the service briefly restarts all preview listeners and its managed target processes. Reuse a target's independently managed service when available. A foreground process started during an agent turn is not proof of persistence.

macOS can block background processes from reading Desktop/Documents. If an app is stuck on file reads or macOS requests a new permission, explain the specific blocker and obtain any required permission; do not claim a healthy background app or broaden privacy access silently. The target app's persistence is separate from the wrapper's. Do not copy the target's source or secrets into the wrapper as a workaround.

The proxy preserves request Origin; if the target rejects phone POST requests, configure that app to trust the exact private origin as appropriate for the task. Do not remove its origin checks globally.
