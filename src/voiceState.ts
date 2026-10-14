// The guild the bot was last told to join from this Stream Deck, so Leave Voice can name it
// explicitly instead of relying on the bot finding the key owner in voice (which fails once the
// owner has already left). In memory only: after a plugin restart Leave falls back to presence.
let lastJoinedGuildId: string | null = null;

/** Records the guild a successful Join Voice targeted, or clears it with null. */
export function setLastJoinedGuildId(guildId: string | null): void {
	lastJoinedGuildId = guildId;
}

/** The guild of the last successful Join Voice, if known. */
export function getLastJoinedGuildId(): string | null {
	return lastJoinedGuildId;
}
