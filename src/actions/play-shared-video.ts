import type { JsonObject, JsonValue } from "@elgato/utils";
import { action, type KeyDownEvent, type WillAppearEvent } from "@elgato/streamdeck";
import { fillMissingSettings } from "../buttonSettings";
import { InspectorCatalog } from "../inspectorCatalog";
import { playSharedVideo } from "../sharedVideoKeys";
import { type SharedVideo, toSharedVideos } from "../sharedVideos";
import { CatalogAction } from "./catalogAction";

// Only the chosen video lives in per-button settings (see play-sfx.ts for why); the list for the
// dropdown lives in the catalog.
interface SharedVideoSettings extends JsonObject {
	[key: string]: JsonValue;
	videoId: string;
}

@action({ UUID: "com.expiredminotaur.bcuk.shared-video" })
export class PlaySharedVideoAction extends CatalogAction<SharedVideoSettings, SharedVideo> {
	/** Creates the action with its shared-video dropdown list. */
	constructor() {
		super(
			new InspectorCatalog<SharedVideo>({
				label: "shared videos",
				path: "/shared-videos",
				parse: (body) => (Array.isArray(body.videos) ? toSharedVideos(body.videos) : null),
				loadedEvent: "videosLoaded",
				errorEvent: "videosError",
				listKey: "videos",
			}),
			"refreshVideos",
		);
	}

	/**
	 * Plays the button's shared video on every connected shared overlay (see `playSharedVideo`).
	 * @param ev The key press, carrying the button's saved video id.
	 */
	override async onKeyDown(ev: KeyDownEvent<SharedVideoSettings>): Promise<void> {
		await playSharedVideo(ev.action, ev.payload.settings.videoId);
	}

	/**
	 * Gives a new button an empty video setting, so later events carry the expected shape.
	 * @param ev The appearance event, carrying the button's saved settings (`{}` on a new button).
	 */
	override async onWillAppear(ev: WillAppearEvent<SharedVideoSettings>): Promise<void> {
		await fillMissingSettings(ev.action, ev.payload.settings, { videoId: "" });
	}
}
