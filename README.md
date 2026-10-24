# BCUK Stream Deck Plugin

A Stream Deck plugin for controlling the **BCUK Discord bot** from your Stream Deck.

## Actions

| Action | What it does |
| --- | --- |
| **Play SFX** | Triggers one of the bot's sound effects in the voice channel it's connected to (interrupts anything already playing). You need to be in a voice channel yourself, which picks the server; the sound plays in the bot's channel in that server, even if it's a different one from yours. Its settings list the sounds by category, with a search box that filters them by command or category (and picks the sound when only one matches). |
| **Join Voice** | Tells the bot to join a chosen voice channel. |
| **Leave Voice** | Tells the bot to leave its current voice channel. |
| **Trigger Command** | Fires one of your own advanced commands (set up on the bot's **Advanced Commands** page) for free — no point cost, cooldowns or limits. Shows an alert if the command is disabled or gone. |
| **Toggle Command** | Enables or disables one of your advanced commands. The key shows the command's current state (bright bolt = enabled, dimmed = disabled). |

Trigger Command and Toggle Command need your Stream Deck key's owner to be a monitored streamer on the bot.

Each action is configured in the Stream Deck property inspector with the bot's **Server URL** (e.g. `https://bot.example.com`; a bare host is assumed to be HTTPS, except `localhost`/`127.0.0.1`, which is assumed to be plain HTTP; type `http://` explicitly for a LAN address) and an **API key** from the bot's web panel (**Streamdeck Key** page). Both are shared by every action. Installs from before 1.2 that saved a host and port keep working over plain HTTP until a Server URL is saved.

The plugin talks to the bot's `/api/streamdeck` routes; see `src/web/routes/streamdeck*.ts` in [BCUK-Bot-4](https://github.com/Battle-Cattle/BCUK-Bot-4) for the API.

## Requirements

- Stream Deck software 7.1+ (on Stream Deck 6.9–7.0, install [v1.3.3](https://github.com/Battle-Cattle/BCUK-StreamDeck-Plugin/releases/tag/v1.3.3.0), the last release that supports them)
- Windows 10+ or macOS 12+
- Node.js 24.22.1 or later (for development)

## Development

```bash
npm install
npm run build        # bundle src/ into com.expiredminotaur.bcuk.sdPlugin/bin
npm run typecheck    # tsc --noEmit
npm run lint         # eslint (the same rules as BCUK-Bot-4: JSDoc, promises, complexity)
npm test             # vitest
npm run watch        # rebuild on change
npm run pack         # produce a .streamDeckPlugin installer
npm run placeholders # regenerate placeholder icons
```

Source lives in `src/` (TypeScript); the plugin bundle (manifest, icons, property inspector UIs) lives in `com.expiredminotaur.bcuk.sdPlugin/`.

## Releases

CI (`.github/workflows/ci.yml`) type-checks, lints, tests and builds every pull request. On `main`, whenever `Version` in `com.expiredminotaur.bcuk.sdPlugin/manifest.json` hasn't been released yet, it packs the plugin and publishes it as a GitHub Release tagged `v<version>` with `com.expiredminotaur.bcuk.streamDeckPlugin` attached.

To ship an update: bump `Version` in the manifest and `version` in `package.json` to match (`1.2.3.0` ↔ `1.2.3`; `npm version 1.2.3 --no-git-tag-version` updates the lockfile too), then merge. A test fails if the two drift apart. The bot's web panel links to the latest release's download (`https://github.com/Battle-Cattle/BCUK-StreamDeck-Plugin/releases/latest/download/com.expiredminotaur.bcuk.streamDeckPlugin`), so nothing needs updating on the bot's server.
