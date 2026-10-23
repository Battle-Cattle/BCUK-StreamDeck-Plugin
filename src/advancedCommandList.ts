import type { JsonValue } from "@elgato/utils";
import { apiRequest, type ApiResult, type Connection, QUICK_KEY_PRESS_TIMEOUT_MS } from "./api";

/** The bot's `GET /advanced-commands` response body. */
export type AdvancedCommandListBody = { commands?: JsonValue };

/** How long a successful list is reused after it arrives, so a page of Toggle keys appearing together shares one request. */
export const ADVANCED_COMMAND_LIST_TTL_MS = 3_000;

/** A list request, finished or still in flight, for one connection. */
interface Entry {
	/** The Server URL and API key it was made with, so a settings change doesn't reuse it. */
	connectionKey: string;
	/** When it succeeded, in `Date.now()` milliseconds; null while it's still in flight. */
	settledAt: number | null;
	/** The request's result. */
	result: Promise<ApiResult<AdvancedCommandListBody>>;
}

let latest: Entry | null = null;

/** Bumped by every {@link invalidateAdvancedCommandList}, so a fetch can tell its list went stale while it waited. */
let listGeneration = 0;

/**
 * Fetches the bot's advanced-command list, sharing one request between callers: a request still in
 * flight is always joined, and a successful result is reused for {@link ADVANCED_COMMAND_LIST_TTL_MS}
 * after it arrives. A failed result isn't reused, so the next caller retries, and a different Server
 * URL or API key never shares a request. If the list is invalidated (by a toggle press) while this
 * call waits, the result may predate the press, so it fetches once more.
 * @param connection The bot's URL and API key.
 * @returns The list request's result.
 */
export async function fetchAdvancedCommandList(connection: Connection): Promise<ApiResult<AdvancedCommandListBody>> {
	const generation = listGeneration;
	const result = await sharedRequest(connection);
	return generation === listGeneration ? result : sharedRequest(connection);
}

/**
 * Returns the shared request for `connection`: the one in flight, a recent success, or a new one.
 * @param connection The bot's URL and API key.
 * @returns The list request's result.
 */
function sharedRequest(connection: Connection): Promise<ApiResult<AdvancedCommandListBody>> {
	const connectionKey = `${connection.serverUrl}\n${connection.apiKey}`;
	if (latest?.connectionKey === connectionKey && isReusable(latest)) {
		return latest.result;
	}

	const entry: Entry = {
		connectionKey,
		settledAt: null,
		result: apiRequest<AdvancedCommandListBody>(connection, "/advanced-commands", undefined, QUICK_KEY_PRESS_TIMEOUT_MS),
	};
	latest = entry;
	// Start the reuse window when a success arrives; drop a failure (unless a newer request has
	// replaced it) so the next caller retries.
	void entry.result.then((result) => {
		if (result.ok) entry.settledAt = Date.now();
		else if (latest === entry) latest = null;
	});
	return entry.result;
}

/**
 * Whether a shared request can still be handed out.
 * @param entry The shared request.
 * @returns True while it's in flight, or within the reuse window after it succeeded.
 */
function isReusable(entry: Entry): boolean {
	return entry.settledAt === null || Date.now() - entry.settledAt < ADVANCED_COMMAND_LIST_TTL_MS;
}

/** Drops the shared list, e.g. after a toggle press changed a command's state, so the next fetch is fresh. */
export function invalidateAdvancedCommandList(): void {
	latest = null;
	listGeneration += 1;
}
