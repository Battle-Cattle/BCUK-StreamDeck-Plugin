import type { JsonValue } from "@elgato/utils";
import { apiRequest, type ApiResult, type Connection, QUICK_KEY_PRESS_TIMEOUT_MS } from "./api";

/** The bot's `GET /advanced-commands` response body. */
export type AdvancedCommandListBody = { commands?: JsonValue };

/** How long a successful list is reused, so a page of Toggle keys appearing together shares one request. */
export const ADVANCED_COMMAND_LIST_TTL_MS = 3_000;

/** A list request, finished or still in flight, for one connection. */
interface Entry {
	/** The Server URL and API key it was made with, so a settings change doesn't reuse it. */
	connectionKey: string;
	/** When the request started, in `Date.now()` milliseconds. */
	startedAt: number;
	/** The request's result. */
	result: Promise<ApiResult<AdvancedCommandListBody>>;
}

let latest: Entry | null = null;

/**
 * Fetches the bot's advanced-command list, sharing one request between callers: a request still in
 * flight is joined, and a successful result is reused for {@link ADVANCED_COMMAND_LIST_TTL_MS}.
 * A failed result isn't reused, so the next caller retries. A different Server URL or API key
 * never shares a request.
 * @param connection The bot's URL and API key.
 * @returns The list request's result.
 */
export function fetchAdvancedCommandList(connection: Connection): Promise<ApiResult<AdvancedCommandListBody>> {
	const connectionKey = `${connection.serverUrl}\n${connection.apiKey}`;
	const now = Date.now();
	if (latest?.connectionKey === connectionKey && now - latest.startedAt < ADVANCED_COMMAND_LIST_TTL_MS) {
		return latest.result;
	}

	const entry: Entry = {
		connectionKey,
		startedAt: now,
		result: apiRequest<AdvancedCommandListBody>(connection, "/advanced-commands", undefined, QUICK_KEY_PRESS_TIMEOUT_MS),
	};
	latest = entry;
	// A failure isn't cached: drop it (unless a newer request has replaced it) so the next caller retries.
	void entry.result.then((result) => {
		if (!result.ok && latest === entry) latest = null;
	});
	return entry.result;
}

/** Drops the shared list, e.g. after a toggle press changed a command's state, so the next fetch is fresh. */
export function invalidateAdvancedCommandList(): void {
	latest = null;
}
