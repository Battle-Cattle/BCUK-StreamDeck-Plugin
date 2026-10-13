// Generates placeholder PNG icons for the plugin.
// Run: node scripts/gen-placeholders.js
// Requires: sharp (installed as devDependency)

import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DARK = { r: 45, g: 45, b: 45, alpha: 1 };
const DARK_RED = { r: 60, g: 20, b: 20, alpha: 1 };

// Speaker icon SVG (white, scalable)
function speakerSvg(size) {
	const s = size;
	return Buffer.from(`
		<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24">
			<rect width="24" height="24" fill="none"/>
			<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"
			      fill="white" opacity="0.9"/>
		</svg>`);
}

// Headphones icon SVG for join-voice (white, scalable)
function headphonesSvg(size) {
	const s = size;
	return Buffer.from(`
		<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24">
			<rect width="24" height="24" fill="none"/>
			<path d="M12 3C7.03 3 3 7.03 3 12v5c0 1.1.9 2 2 2h1c1.1 0 2-.9 2-2v-3c0-1.1-.9-2-2-2H5.07C5.56 8.47 8.5 6 12 6s6.44 2.47 6.93 6H18c-1.1 0-2 .9-2 2v3c0 1.1.9 2 2 2h1c1.1 0 2-.9 2-2v-5c0-4.97-4.03-9-9-9z"
			      fill="white" opacity="0.9"/>
		</svg>`);
}

// Headphones with X overlay for leave-voice
function leaveVoiceSvg(size) {
	const s = size;
	return Buffer.from(`
		<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24">
			<rect width="24" height="24" fill="none"/>
			<path d="M12 3C7.03 3 3 7.03 3 12v5c0 1.1.9 2 2 2h1c1.1 0 2-.9 2-2v-3c0-1.1-.9-2-2-2H5.07C5.56 8.47 8.5 6 12 6s6.44 2.47 6.93 6H18c-1.1 0-2 .9-2 2v3c0 1.1.9 2 2 2h1c1.1 0 2-.9 2-2v-5c0-4.97-4.03-9-9-9z"
			      fill="white" opacity="0.5"/>
			<line x1="16" y1="8" x2="22" y2="14" stroke="#e74c3c" stroke-width="2.5" stroke-linecap="round"/>
			<line x1="22" y1="8" x2="16" y2="14" stroke="#e74c3c" stroke-width="2.5" stroke-linecap="round"/>
		</svg>`);
}

// Speaker with error X overlay
function speakerErrorSvg(size) {
	const s = size;
	return Buffer.from(`
		<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24">
			<rect width="24" height="24" fill="none"/>
			<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"
			      fill="white" opacity="0.5"/>
			<line x1="16" y1="8" x2="22" y2="14" stroke="#e74c3c" stroke-width="2.5" stroke-linecap="round"/>
			<line x1="22" y1="8" x2="16" y2="14" stroke="#e74c3c" stroke-width="2.5" stroke-linecap="round"/>
		</svg>`);
}

// BCUK label SVG for marketplace / category icons
function labelSvg(size) {
	const fs = Math.round(size * 0.3);
	return Buffer.from(`
		<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
			<rect width="${size}" height="${size}" rx="${size * 0.12}" fill="#2d2d2d"/>
			<text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle"
			      font-family="Arial, sans-serif" font-weight="bold" font-size="${fs}"
			      fill="white">BCUK</text>
		</svg>`);
}

async function makeIcon(outputPath, size, bg, svgBuffer) {
	mkdirSync(dirname(outputPath), { recursive: true });

	const base = await sharp({
		create: { width: size, height: size, channels: 4, background: bg },
	})
		.png()
		.toBuffer();

	await sharp(base)
		.composite([{ input: svgBuffer, gravity: "center" }])
		.png()
		.toFile(outputPath);

	console.log(`  created  ${outputPath}`);
}

async function makeLabelIcon(outputPath, size) {
	mkdirSync(dirname(outputPath), { recursive: true });
	await sharp(labelSvg(size)).png().toFile(outputPath);
	console.log(`  created  ${outputPath}`);
}

const root = "com.expiredminotaur.bcuk.sdPlugin";

console.log("Generating placeholder icons…\n");

await Promise.all([
	// Plugin-level icons
	makeLabelIcon(`${root}/imgs/plugin/category-icon.png`, 28),
	makeLabelIcon(`${root}/imgs/plugin/category-icon@2x.png`, 56),
	makeLabelIcon(`${root}/imgs/plugin/marketplace.png`, 300),
	makeLabelIcon(`${root}/imgs/plugin/marketplace@2x.png`, 600),

	// Action picker icons — play-sfx
	makeIcon(`${root}/imgs/actions/play-sfx/icon.png`, 28, DARK, speakerSvg(20)),
	makeIcon(`${root}/imgs/actions/play-sfx/icon@2x.png`, 56, DARK, speakerSvg(40)),

	// Key face — play-sfx default
	makeIcon(`${root}/imgs/actions/play-sfx/key-default.png`, 72, DARK, speakerSvg(48)),
	makeIcon(`${root}/imgs/actions/play-sfx/key-default@2x.png`, 144, DARK, speakerSvg(96)),

	// Key face — play-sfx error (persistent 401/404 state)
	makeIcon(`${root}/imgs/actions/play-sfx/key-error.png`, 72, DARK_RED, speakerErrorSvg(48)),
	makeIcon(`${root}/imgs/actions/play-sfx/key-error@2x.png`, 144, DARK_RED, speakerErrorSvg(96)),

	// Action picker icons — join-voice
	makeIcon(`${root}/imgs/actions/join-voice/icon.png`, 28, DARK, headphonesSvg(20)),
	makeIcon(`${root}/imgs/actions/join-voice/icon@2x.png`, 56, DARK, headphonesSvg(40)),

	// Key face — join-voice default
	makeIcon(`${root}/imgs/actions/join-voice/key-default.png`, 72, DARK, headphonesSvg(48)),
	makeIcon(`${root}/imgs/actions/join-voice/key-default@2x.png`, 144, DARK, headphonesSvg(96)),

	// Action picker icons — leave-voice
	makeIcon(`${root}/imgs/actions/leave-voice/icon.png`, 28, DARK_RED, leaveVoiceSvg(20)),
	makeIcon(`${root}/imgs/actions/leave-voice/icon@2x.png`, 56, DARK_RED, leaveVoiceSvg(40)),

	// Key face — leave-voice default
	makeIcon(`${root}/imgs/actions/leave-voice/key-default.png`, 72, DARK_RED, leaveVoiceSvg(48)),
	makeIcon(`${root}/imgs/actions/leave-voice/key-default@2x.png`, 144, DARK_RED, leaveVoiceSvg(96)),
]);

console.log("\nDone.");
