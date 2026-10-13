# BCUK Bot — Streamdeck Plugin Specification

## Overview

The BCUK Bot exposes a small HTTP API that lets a Streamdeck (or any HTTP client) trigger sound effects directly into the Discord voice channel the bot is connected to. Triggers bypass the global chat cooldown and will immediately interrupt any currently playing sound.

---

## Base URL

The bot's web panel and API share the same Express server. The default port is `3000`, but this is configurable by the bot operator.

```
http://<host>:<port>
```

Example (local deployment):

```
http://localhost:3000
```

The plugin should expose the host and port as user-configurable settings in the Streamdeck Property Inspector.

---

## Authentication

Every request to the Streamdeck API must include an `Authorization` header with a Bearer token.

```
Authorization: Bearer <api-key>
```

API keys are obtained through the bot's web panel at `/streamdeck-key`. The key is a 64-character lowercase hex string (32 random bytes). It is shown exactly once at generation time and must be stored securely by the user.

### Key approval rules

| User role | Approval |
|-----------|----------|
| Manager, Admin | Immediate — key is active as soon as it is generated |
| User, Mod | Pending — an Admin must approve the request before the key works |

An unapproved or revoked key returns `401 Unauthorized`.

---

## Endpoints

### `GET /api/streamdeck/sfx`

Retrieve all available sound effect commands. Useful for populating a picker in the Property Inspector.

#### Request

```
GET /api/streamdeck/sfx
Authorization: Bearer <api-key>
```

No request body.

#### Response `200 OK`

```json
{
  "ok": true,
  "triggers": [
    {
      "triggerId": "1",
      "triggerCommand": "!boom",
      "description": "Explosion sound",
      "hidden": false,
      "categoryName": "Effects",
      "files": [
        { "id": 10, "file": "boom.mp3", "weight": 1, "hidden": false },
        { "id": 11, "file": "boom2.mp3", "weight": 2, "hidden": false }
      ]
    },
    {
      "triggerId": "2",
      "triggerCommand": "!airhorn",
      "description": null,
      "hidden": false,
      "categoryName": null,
      "files": [
        { "id": 20, "file": "airhorn.mp3", "weight": 1, "hidden": false }
      ]
    }
  ]
}
```

#### Field reference — trigger object

| Field | Type | Description |
|-------|------|-------------|
| `triggerId` | string | Internal database ID |
| `triggerCommand` | string | The command string to use in POST requests (e.g. `"!boom"`) |
| `description` | string \ null | Optional human-readable description |
| `hidden` | boolean | Hidden from the public SFX listing, but still fully playable |
| `categoryName` | string \ null | Optional category grouping |
| `files` | array | Sound files associated with this trigger |

#### Field reference — file object

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Internal file ID |
| `file` | string | Filename (relative path within the bot's SFX folder) |
| `weight` | number | Relative weight for random selection — higher = more likely |
| `hidden` | boolean | Hidden from public listing; still played during random selection |

> **Note:** When a command has multiple files, the bot selects one at random using weighted probability. The plugin does not need to manage file selection.

---

### `POST /api/streamdeck/sfx`

Trigger a sound effect by command name.

#### Request

```
POST /api/streamdeck/sfx
Authorization: Bearer <api-key>
Content-Type: application/json
```

```json
{
  "command": "!boom"
}
```

#### Request body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `command` | string | Yes | The trigger command, e.g. `"!boom"`. Case-insensitive. |

#### Response `200 OK` — sound is playing

```json
{
  "ok": true,
  "file": "boom2.mp3"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ok` | boolean | Always `true` on success |
| `file` | string | The specific filename that was selected and is now playing |

---

## Error responses

All error responses share the same shape:

```json
{
  "ok": false,
  "error": "<human-readable message>"
}
```

| Status | Meaning | Common cause |
|--------|---------|--------------|
| `400 Bad Request` | Missing or invalid `command` field | Body is missing, `command` is not a string, or is empty |
| `401 Unauthorized` | Invalid, revoked, or pending API key | Key not yet approved; key was revoked; wrong key |
| `404 Not Found` | Command not recognised, or has no sound files | Typo in command name; command exists but has no files attached |
| `500 Internal Server Error` | Unexpected server error | Database connectivity issue or file system error |
| `503 Service Unavailable` | Bot is not connected to a voice channel | Bot was disconnected or has not yet joined a channel |

---

## Behaviour notes

- **No cooldown.** Streamdeck triggers skip the global chat cooldown entirely.
- **Interrupt behaviour.** If a sound is already playing when a POST request arrives, the current sound is stopped immediately and the new one starts. There is no queue.
- **Case-insensitive.** The `command` value is normalised to lowercase before lookup, so `"!BOOM"`, `"!Boom"`, and `"!boom"` are all equivalent.
- **Hidden commands work.** The `hidden` flag on triggers and files only controls public web-panel listing. All commands are playable via the API regardless of their hidden status.

---

## Obtaining an API key

1. The user logs in to the bot's web panel (default: `http://<host>:<port>`).
2. They navigate to **Streamdeck Key** in the navigation bar.
3. They click **Request API Key**.
4. The key is shown **once only**. They copy it into the Streamdeck plugin's Property Inspector.
5. If the user's role is Manager or Admin, the key is immediately active. If their role is User or Mod, an Admin must approve the request at **Admin → Streamdeck Keys** before the key will work.

---

## Suggested plugin architecture

### Actions

The plugin should expose at least one action type: **Play SFX**.

**Property Inspector fields:**

| Field | Type | Notes |
|-------|------|-------|
| Host | text | e.g. `localhost` or an IP address |
| Port | number | Default `3000` |
| API Key | password | 64-char hex string; stored in Streamdeck's secure settings |
| Command | text or dropdown | The `triggerCommand` value; populate from `GET /api/streamdeck/sfx` |

**On key press:**

1. Send `POST /api/streamdeck/sfx` with the configured command.
2. On `200`: briefly show a success state (e.g. green tick or animated icon).
3. On `401`: show a persistent error state and log "Invalid or unapproved API key".
4. On `404`: show an error state and log "Command not found".
5. On `503`: show a warning state and log "Bot not connected to voice".
6. On network error / timeout: show an error state and log the exception.

**Optional — command list refresh:**

In the Property Inspector, provide a "Refresh Commands" button that calls `GET /api/streamdeck/sfx` and repopulates the command dropdown. Cache the result locally so the panel does not need the bot to be running to display previously fetched commands.

---

## Example requests (curl)

```bash
# List all available commands
curl -H "Authorization: Bearer <your-api-key>" \
     http://localhost:3000/api/streamdeck/sfx

# Trigger a sound
curl -X POST \
     -H "Authorization: Bearer <your-api-key>" \
     -H "Content-Type: application/json" \
     -d '{"command":"!boom"}' \
     http://localhost:3000/api/streamdeck/sfx
```

---

## Versioning

This API has no version prefix. Breaking changes will be communicated directly between projects.
