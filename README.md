# BCUK Stream Deck Plugin

A Stream Deck plugin for controlling the **BCUK Discord bot** from your Stream Deck.

## Actions

| Action | What it does |
| --- | --- |
| **Play SFX** | Triggers one of the bot's sound effects in the voice channel it's connected to (interrupts anything already playing). |
| **Join Voice** | Tells the bot to join a chosen voice channel. |
| **Leave Voice** | Tells the bot to leave its current voice channel. |

Each action is configured in the Stream Deck property inspector with the bot's **host**, **port** (default `3000`) and an **API key**. See [`streamdeck-plugin-spec.md`](streamdeck-plugin-spec.md) for the bot's HTTP API.

## Requirements

- Stream Deck software 6.9+
- Windows 10+ or macOS 12+
- Node.js 20 (for building)

## Development

```bash
npm install
npm run build        # bundle src/ into com.expiredminotaur.bcuk.sdPlugin/bin
npm run watch        # rebuild on change
npm run pack         # produce a .streamDeckPlugin installer
npm run placeholders # regenerate placeholder icons
```

Source lives in `src/` (TypeScript); the plugin bundle (manifest, icons, property inspector UIs) lives in `com.expiredminotaur.bcuk.sdPlugin/`.
