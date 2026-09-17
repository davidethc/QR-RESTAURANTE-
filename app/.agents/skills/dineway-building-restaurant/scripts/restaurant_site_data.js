#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const IMAGE_EXTENSION_RE = /\.(avif|gif|jpe?g|png|webp)(?:$|[?#])/i;
const DIACRITICS_RE = /[\u0300-\u036f]/g;
const SLUG_SEPARATOR_RE = /[^a-z0-9]+/g;
const SLUG_TRIM_RE = /^-|-$/g;
const LEADING_DOT_SLASH_RE = /^\.\//;
const DATA_URL_RE = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i;
const HTTP_URL_RE = /^https?:\/\//i;
const IMAGE_MIME_RE = /^image\/[a-z0-9.+-]+$/i;
const IMAGE_HOST_OR_PATH_RE = /googleusercontent|gstatic|cdn|images?|photos?/i;
const URL_RESOLUTION_RE = /[=_](?:w|s|h)?(\d{2,5})(?:[-x](?:h|w)?(\d{2,5}))?(?:[&?#/]|$)/i;

const SOURCE_PRIORITY = new Map([
	["placeImageList", 100],
	["photoList", 90],
	["photos", 85],
	["menuImages", 75],
	["reviewImageList", 70],
	["extImageReviews", 65],
	["ugcPosts", 50],
	["aiPhotoList", 40],
	["reviewVideoList", 30],
	["videoList", 30],
	["placeVideoList", 30],
	["extraVideos", 30],
	["selectedPlace", 20],
]);
const EXTENSION_BY_MIME = new Map([
	["image/jpeg", ".jpg"],
	["image/png", ".png"],
	["image/webp", ".webp"],
	["image/avif", ".avif"],
	["image/gif", ".gif"],
]);
const IMAGE_ARRAY_KEYS = new Set([
	"photos",
	"photoList",
	"placeImageList",
	"aiPhotoList",
	"images",
	"reviewImageList",
	"extImageReviews",
	"menuImages",
	"ugcPosts",
]);
const IMAGE_URL_KEYS = new Set([
	"url",
	"uri",
	"src",
	"photoUri",
	"photoUrl",
	"imageUri",
	"imageUrl",
	"thumbnailUri",
	"thumbnailUrl",
	"largeUri",
	"largeUrl",
	"originalUri",
	"originalUrl",
]);
const SKIP_URL_KEYS = new Set(["websiteUri", "googleMapsUri", "mapsUri", "businessUri"]);

function usage() {
	return `Usage:
  node restaurant_site_data.js summarize places/PLACE_ID.json [--out summary.json]
  node restaurant_site_data.js download places/PLACE_ID.json --out public/assets/restaurant --max 20 --manifest downloaded-media.json
  node restaurant_site_data.js upload downloaded-media.json --url http://localhost:4321 --out uploaded-media.json
  node restaurant_site_data.js select downloaded-media.json --pick 1,3,5,6,8 --out selected-media.json`;
}

function parseArgs(argv) {
	if (argv.includes("--help") || argv.includes("-h")) {
		return {
			help: true,
		};
	}

	const [command, input, ...rest] = argv;
	const options = {
		command,
		input,
		out: "",
		manifest: "",
		max: 20,
		pick: "",
		url: "http://localhost:4321",
		timeoutMs: 20000,
	};

	for (let index = 0; index < rest.length; index += 1) {
		const flag = rest[index];
		const value = rest[index + 1];
		if (
			flag === "--out" ||
			flag === "--manifest" ||
			flag === "--url" ||
			flag === "--max" ||
			flag === "--timeout-ms" ||
			flag === "--pick"
		) {
			if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
			if (flag === "--out") options.out = value;
			if (flag === "--manifest") options.manifest = value;
			if (flag === "--url") options.url = value;
			if (flag === "--max") options.max = Number(value);
			if (flag === "--timeout-ms") options.timeoutMs = Number(value);
			if (flag === "--pick") options.pick = value;
			index += 1;
			continue;
		}
		if (flag === "--help" || flag === "-h") {
			options.help = true;
			continue;
		}
		throw new Error(`Unknown option: ${flag}`);
	}

	if (options.help) return options;
	if (!command || !input) throw new Error("Command and input path are required");
	if (!["summarize", "download", "upload", "select"].includes(command)) {
		throw new Error(`Unknown command: ${command}`);
	}
	if (!Number.isFinite(options.max) || options.max < 1) options.max = 20;
	if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1000) options.timeoutMs = 20000;
	return options;
}

async function readJson(filePath) {
	const content = await fs.readFile(filePath, "utf8");
	return JSON.parse(content);
}

async function writeJson(filePath, data) {
	await fs.mkdir(path.dirname(path.resolve(filePath)), { recursive: true });
	await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function asRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}

function displayText(value) {
	if (typeof value === "string") return value.trim();
	if (typeof value === "number") return String(value);
	const record = asRecord(value);
	if (!record) return "";
	return (
		displayText(record.text) ||
		displayText(record.name) ||
		displayText(record.displayName) ||
		displayText(record.title)
	);
}

function numberValue(value) {
	const num = Number(value);
	return Number.isFinite(num) ? num : null;
}

function firstPresent(...values) {
	for (const value of values) {
		if (value !== undefined && value !== null && value !== "") return value;
	}
	return null;
}

function slugify(value) {
	return (
		String(value || "restaurant")
			.toLowerCase()
			.normalize("NFKD")
			.replace(DIACRITICS_RE, "")
			.replace(SLUG_SEPARATOR_RE, "-")
			.replace(SLUG_TRIM_RE, "") || "restaurant"
	);
}

function validateDownloadTargetDir(targetDir) {
	const normalized = targetDir.split(path.sep).join("/").replace(LEADING_DOT_SLASH_RE, "");
	if (normalized === "assets" || normalized.startsWith("assets/")) {
		throw new Error(
			"Static Astro image output must be under public/assets. Use --out public/assets/restaurant-slug so /assets/... URLs are served.",
		);
	}
	return targetDir;
}

function getPayloadParts(payload) {
	const record = asRecord(payload) || {};
	const details =
		asRecord(record.placeDetails) ||
		asRecord(record.place_details) ||
		asRecord(record.details) ||
		asRecord(record.data) ||
		record;
	const selected =
		asRecord(record.selectedPlace) ||
		asRecord(record.selected_match) ||
		asRecord(record.selectedCandidate) ||
		asRecord(asRecord(record.search)?.selectedCandidate) ||
		{};
	return { root: record, details, selected };
}

function normalizeCategories(details, selected) {
	const values = [
		...(Array.isArray(details.primaryCategories) ? details.primaryCategories : []),
		...(Array.isArray(details.categories) ? details.categories : []),
		...(Array.isArray(details.types) ? details.types : []),
		...(Array.isArray(selected.types) ? selected.types : []),
	];
	const seen = new Set();
	const categories = [];
	for (const value of values) {
		const label = displayText(value);
		if (!label) continue;
		const key = label.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		categories.push(label);
	}
	return categories;
}

function normalizeCoordinates(details, selected) {
	const sources = [
		asRecord(details.latlon),
		asRecord(details.location),
		asRecord(asRecord(details.geometry)?.location),
		asRecord(selected.latlon),
		asRecord(selected.location),
		asRecord(asRecord(selected.geometry)?.location),
	].filter(Boolean);
	for (const source of sources) {
		const lat = numberValue(firstPresent(source.lat, source.latitude));
		const lng = numberValue(firstPresent(source.lng, source.lon, source.longitude));
		if (lat !== null && lng !== null) return { lat, lng };
	}
	return null;
}

function normalizeHours(details) {
	const regular = asRecord(details.regularOpeningHours);
	const current = asRecord(details.currentOpeningHours);
	const values =
		regular?.weekdayDescriptions ||
		regular?.weekdayText ||
		regular?.weekday_text ||
		current?.weekdayDescriptions ||
		current?.weekdayText ||
		current?.weekday_text ||
		[];
	return Array.isArray(values) ? values.map(displayText).filter(Boolean) : [];
}

function normalizeReviews(details) {
	const reviews = Array.isArray(details.reviews) ? details.reviews : [];
	return reviews
		.map((review) => {
			const record = asRecord(review) || {};
			const author = asRecord(record.authorAttribution) || {};
			return {
				author:
					displayText(author.displayName) ||
					displayText(record.author_name) ||
					displayText(record.authorName),
				rating: numberValue(record.rating),
				text: displayText(record.text) || displayText(record.originalText),
				relativeTime:
					displayText(record.relativePublishTimeDescription) ||
					displayText(record.relative_time_description),
			};
		})
		.filter((review) => review.text || review.rating !== null);
}

function countSourceItems(details, selected, keys) {
	return keys.reduce((count, key) => {
		const detailsValue = details[key];
		const selectedValue = selected[key];
		return (
			count +
			(Array.isArray(detailsValue) ? detailsValue.length : 0) +
			(Array.isArray(selectedValue) ? selectedValue.length : 0)
		);
	}, 0);
}

function countArray(value) {
	return Array.isArray(value) ? value.length : 0;
}

function countNestedArrayItems(values, key) {
	return values.reduce((count, value) => {
		const items = Array.isArray(asRecord(value)?.[key]) ? asRecord(value)?.[key] : [];
		return count + items.length;
	}, 0);
}

function countNestedMediaItems(values, keys) {
	return values.reduce((count, value) => {
		const record = asRecord(value) || {};
		return (
			count +
			keys.reduce((innerCount, key) => {
				const items = record[key];
				return innerCount + (Array.isArray(items) ? items.length : 0);
			}, 0)
		);
	}, 0);
}

function hasImageContext(pathParts) {
	return pathParts.some((part) => {
		const lower = String(part).toLowerCase();
		return (
			lower.includes("photo") ||
			lower.includes("image") ||
			lower.includes("picture") ||
			lower.includes("thumbnail") ||
			lower.includes("thumb")
		);
	});
}

function isUsableImageUrl(url) {
	if (!HTTP_URL_RE.test(url) && !DATA_URL_RE.test(url)) return false;
	if (IMAGE_EXTENSION_RE.test(url)) return true;
	try {
		const parsed = new URL(url);
		return IMAGE_HOST_OR_PATH_RE.test(parsed.hostname + parsed.pathname);
	} catch {
		return false;
	}
}

function collectImageUrls(value, pathParts = [], out = []) {
	if (typeof value === "string") {
		if (hasImageContext(pathParts) && isUsableImageUrl(value)) {
			out.push({ url: value, sourcePath: pathParts.join(".") });
		}
		return out;
	}
	if (Array.isArray(value)) {
		value.forEach((item, index) => collectImageUrls(item, [...pathParts, String(index)], out));
		return out;
	}
	const record = asRecord(value);
	if (!record) return out;

	for (const [key, entry] of Object.entries(record)) {
		if (SKIP_URL_KEYS.has(key)) continue;
		const nextPath = [...pathParts, key];
		if (typeof entry === "string" && IMAGE_URL_KEYS.has(key) && isUsableImageUrl(entry)) {
			out.push({ url: entry, sourcePath: nextPath.join(".") });
			continue;
		}
		collectImageUrls(entry, nextPath, out);
	}
	return out;
}

function classifyMediaUse(sourcePath) {
	const lower = String(sourcePath).toLowerCase();
	if (lower.includes("menu")) return "menu";
	if (lower.includes("review") || lower.includes("extimagereviews")) return "review";
	if (lower.includes("ugcposts") || lower.includes("post")) return "gallery";
	if (lower.includes("video")) return "gallery";
	if (lower.includes("placeimagelist") || lower.includes("photolist") || lower.includes("photos")) {
		return "gallery";
	}
	return "design-only";
}

function sourcePriority(sourcePath) {
	const lower = String(sourcePath).toLowerCase();
	for (const [key, score] of SOURCE_PRIORITY) {
		if (lower.includes(key.toLowerCase())) return score;
	}
	return 10;
}

function parseUrlResolution(url) {
	const match = String(url || "").match(URL_RESOLUTION_RE);
	if (!match) return 0;
	const a = Number(match[1]) || 0;
	const b = Number(match[2]) || 0;
	return Math.max(a, b);
}

function rankCandidates(candidates) {
	return candidates
		.map((candidate, originalIndex) => ({
			...candidate,
			_priority: sourcePriority(candidate.sourcePath),
			_urlResolution: parseUrlResolution(candidate.url),
			_originalIndex: originalIndex,
		}))
		.toSorted((a, b) => {
			if (a._priority !== b._priority) return b._priority - a._priority;
			if (a._urlResolution !== b._urlResolution) return b._urlResolution - a._urlResolution;
			return a._originalIndex - b._originalIndex;
		})
		.map(({ _priority, _urlResolution, _originalIndex, ...rest }) => ({
			...rest,
			priority: _priority,
			urlResolutionHint: _urlResolution,
		}));
}

function extractImageCandidates(payload) {
	const { details, selected } = getPayloadParts(payload);
	const roots = [
		{ value: details.placeImageList, path: ["placeDetails", "placeImageList"] },
		{ value: details.photoList, path: ["placeDetails", "photoList"] },
		{ value: details.photos, path: ["placeDetails", "photos"] },
		{ value: details.reviewImageList, path: ["placeDetails", "reviewImageList"] },
		{ value: details.extImageReviews, path: ["placeDetails", "extImageReviews"] },
		{ value: details.menuImages, path: ["placeDetails", "menuImages"] },
		{ value: details.ugcPosts, path: ["placeDetails", "ugcPosts"] },
		{ value: details.aiPhotoList, path: ["placeDetails", "aiPhotoList"] },
		{ value: details.reviewVideoList, path: ["placeDetails", "reviewVideoList"] },
		{ value: details.videoList, path: ["placeDetails", "videoList"] },
		{ value: details.placeVideoList, path: ["placeDetails", "placeVideoList"] },
		{ value: details.extraVideos, path: ["placeDetails", "extraVideos"] },
		{ value: selected.placeImageList, path: ["selectedPlace", "placeImageList"] },
		{ value: selected.photoList, path: ["selectedPlace", "photoList"] },
		{ value: selected.photos, path: ["selectedPlace", "photos"] },
	];
	const seen = new Set();
	const candidates = [];
	for (const root of roots) {
		if (root.value === undefined) continue;
		const discovered = collectImageUrls(root.value, root.path);
		for (const item of discovered) {
			if (seen.has(item.url)) continue;
			seen.add(item.url);
			candidates.push({
				...item,
				intendedUse: classifyMediaUse(item.sourcePath),
			});
		}
	}

	if (candidates.length === 0) {
		for (const key of IMAGE_ARRAY_KEYS) {
			const value = details[key] ?? selected[key];
			if (value !== undefined) {
				candidates.push({
					sourcePath: key,
					skippedReason: "No direct downloadable image URL found",
				});
			}
		}
	}
	return candidates;
}

function normalizeRestaurant(payload, sourcePath = "") {
	const { root, details, selected } = getPayloadParts(payload);
	const googleMapsLinks = asRecord(details.googleMapsLinks) || {};
	const addressDescriptor = asRecord(details.addressDescriptor) || {};
	const accessibilityOptions = asRecord(details.accessibilityOptions) || {};
	const paymentOptions = asRecord(details.paymentOptions) || {};
	const menuList = Array.isArray(details.menuList) ? details.menuList : [];
	const ugcPosts = Array.isArray(details.ugcPosts) ? details.ugcPosts : [];
	const placeId = displayText(
		firstPresent(
			details.placeId,
			selected.placeId,
			selected.id,
			asRecord(root.search)?.selectedPlaceId,
			asRecord(root.search)?.selectedCandidateId,
			root.reference_id,
		),
	);
	const name =
		displayText(details.displayName) ||
		displayText(details.name) ||
		displayText(selected.displayName) ||
		displayText(selected.name);
	const address =
		displayText(details.formattedAddress) ||
		displayText(details.formatted_address) ||
		displayText(details.shortFormattedAddress) ||
		displayText(selected.formattedAddress) ||
		displayText(selected.formatted_address) ||
		displayText(selected.address);
	const categories = normalizeCategories(details, selected);
	const reviews = normalizeReviews(details);
	const postCount = countSourceItems(details, selected, [
		"ugcPosts",
		"posts",
		"postList",
		"placePostList",
	]);
	const videoCount = countSourceItems(details, selected, [
		"videos",
		"videoList",
		"placeVideoList",
		"extraVideos",
		"reviewVideoList",
	]);
	const imageCandidates = extractImageCandidates(payload);
	return {
		sourcePath,
		placeId,
		slug: slugify(name),
		name,
		address,
		phone:
			displayText(details.internationalPhoneNumber) ||
			displayText(details.nationalPhoneNumber) ||
			displayText(details.formatted_phone_number),
		rating: numberValue(firstPresent(details.rating, selected.rating)),
		reviewCount: numberValue(
			firstPresent(details.userRatingCount, details.user_ratings_total, selected.userRatingCount),
		),
		googleMapsUrl: displayText(
			firstPresent(details.googleMapsUri, details.url, selected.googleMapsUri),
		),
		websiteUrl: displayText(details.websiteUri),
		categories,
		coordinates: normalizeCoordinates(details, selected),
		hours: normalizeHours(details),
		reviews,
		postCount,
		ugcPostCount: ugcPosts.length,
		ugcPostImageCount: countNestedMediaItems(ugcPosts, ["imageUrls", "imageUrl"]),
		ugcPostVideoCount: countNestedMediaItems(ugcPosts, [
			"videoUrls",
			"videoThumbnailUrls",
			"videos",
		]),
		videoCount,
		menuSectionCount: menuList.length,
		menuItemCount: countNestedArrayItems(menuList, "items"),
		menuImageCount: countArray(details.menuImages),
		reviewMediaCount:
			countArray(details.extImageReviews) +
			countArray(details.reviewImageList) +
			countArray(details.reviewVideoList),
		imageCandidateCount: imageCandidates.filter((item) => item.url).length,
		imageCandidates,
		locationSignals: {
			postalAddress: Boolean(asRecord(details.postalAddress)),
			addressComponents: countArray(details.addressComponents),
			areas: countArray(addressDescriptor.areas),
			landmarks: countArray(addressDescriptor.landmarks),
			timeZone: displayText(asRecord(details.timeZone)?.id) || displayText(details.timeZone),
			utcOffsetMinutes: numberValue(details.utcOffsetMinutes),
		},
		mapActionLinks: {
			placeUri: displayText(googleMapsLinks.placeUri),
			photosUri: displayText(googleMapsLinks.photosUri),
			reviewsUri: displayText(googleMapsLinks.reviewsUri),
			directionsUri: displayText(googleMapsLinks.directionsUri),
			writeAReviewUri: displayText(googleMapsLinks.writeAReviewUri),
		},
		serviceFlags: {
			dineIn: details.dineIn === true ? true : null,
			takeout: details.takeout === true ? true : null,
			delivery: details.delivery === true ? true : null,
			reservable: details.reservable === true ? true : null,
			servesLunch: details.servesLunch === true ? true : null,
			servesDinner: details.servesDinner === true ? true : null,
			goodForGroups: details.goodForGroups === true ? true : null,
			restroom: details.restroom === true ? true : null,
			servesVegetarianFood: details.servesVegetarianFood === true ? true : null,
		},
		negativeGuardrails: {
			liveMusic: details.liveMusic === false ? false : null,
			goodForWatchingSports: details.goodForWatchingSports === false ? false : null,
			pureServiceAreaBusiness: details.pureServiceAreaBusiness === false ? false : null,
		},
		paymentOptions: Object.fromEntries(
			Object.entries(paymentOptions).filter(([, value]) => typeof value === "boolean"),
		),
		accessibilityOptions: Object.fromEntries(
			Object.entries(accessibilityOptions).filter(([, value]) => typeof value === "boolean"),
		),
	};
}

function summarize(payload, sourcePath) {
	const restaurant = normalizeRestaurant(payload, sourcePath);
	return {
		restaurant,
		decisionInputs: {
			hasPhone: Boolean(restaurant.phone),
			hasHours: restaurant.hours.length > 0,
			reviewItems: restaurant.reviews.length,
			postItems: restaurant.postCount,
			videoItems: restaurant.videoCount,
			imageCandidates: restaurant.imageCandidateCount,
			categories: restaurant.categories,
		},
	};
}

function extensionFromMime(mimeType) {
	return (
		EXTENSION_BY_MIME.get(
			String(mimeType || "")
				.split(";")[0]
				.trim()
				.toLowerCase(),
		) || ""
	);
}

function extensionFromUrl(url) {
	const match = String(url).match(IMAGE_EXTENSION_RE);
	return match ? `.${match[1].toLowerCase().replace("jpeg", "jpg")}` : "";
}

async function fetchWithTimeout(url, timeoutMs) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, { signal: controller.signal });
	} finally {
		clearTimeout(timer);
	}
}

async function downloadDataUrl(candidate, targetPath) {
	const match = String(candidate.url).match(DATA_URL_RE);
	if (!match) throw new Error("Invalid data URL");
	const mimeType = match[1].toLowerCase();
	const buffer = Buffer.from(match[2], "base64");
	await fs.writeFile(targetPath, buffer);
	return { mimeType, size: buffer.length };
}

async function downloadHttpUrl(candidate, targetPath, timeoutMs) {
	const response = await fetchWithTimeout(candidate.url, timeoutMs);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const mimeType = String(response.headers.get("content-type") || "")
		.split(";")[0]
		.trim()
		.toLowerCase();
	if (!IMAGE_MIME_RE.test(mimeType))
		throw new Error(`Not an image response: ${mimeType || "unknown"}`);
	const buffer = Buffer.from(await response.arrayBuffer());
	await fs.writeFile(targetPath, buffer);
	return { mimeType, size: buffer.length };
}

async function readImageDimensions(filePath) {
	try {
		const fd = await fs.open(filePath, "r");
		try {
			const header = Buffer.alloc(4096);
			const { bytesRead } = await fd.read(header, 0, 4096, 0);
			if (bytesRead < 8) return null;

			// PNG: 8-byte signature then IHDR chunk with width/height at offset 16/20
			if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47) {
				if (bytesRead >= 24) {
					return {
						width: header.readUInt32BE(16),
						height: header.readUInt32BE(20),
					};
				}
				return null;
			}

			// JPEG: scan for SOF0/SOF2 markers (0xFF 0xC0 or 0xFF 0xC2)
			if (header[0] === 0xff && header[1] === 0xd8) {
				let offset = 2;
				while (offset + 8 < bytesRead) {
					if (header[offset] !== 0xff) break;
					const marker = header[offset + 1];
					if (marker === 0xc0 || marker === 0xc2) {
						if (offset + 9 < bytesRead) {
							return {
								width: header.readUInt16BE(offset + 7),
								height: header.readUInt16BE(offset + 5),
							};
						}
						return null;
					}
					const segLen = header.readUInt16BE(offset + 2);
					offset += 2 + segLen;
				}
				return null;
			}

			// WebP: RIFF....WEBP then VP8/VP8L/VP8X
			if (
				header[0] === 0x52 &&
				header[1] === 0x49 &&
				header[2] === 0x46 &&
				header[3] === 0x46 &&
				bytesRead >= 30
			) {
				const chunk = header.toString("ascii", 12, 16);
				if (chunk === "VP8 " && bytesRead >= 30) {
					return {
						width: header.readUInt16LE(26) & 0x3fff,
						height: header.readUInt16LE(28) & 0x3fff,
					};
				}
				if (chunk === "VP8L" && bytesRead >= 25) {
					const bits = header.readUInt32LE(21);
					return {
						width: (bits & 0x3fff) + 1,
						height: ((bits >> 14) & 0x3fff) + 1,
					};
				}
				if (chunk === "VP8X" && bytesRead >= 30) {
					return {
						width: (header.readUIntLE(24, 3) & 0xffffff) + 1,
						height: (header.readUIntLE(27, 3) & 0xffffff) + 1,
					};
				}
			}

			return null;
		} finally {
			await fd.close();
		}
	} catch {
		return null;
	}
}

async function runDownload(inputPath, options) {
	const payload = await readJson(inputPath);
	const summary = summarize(payload, inputPath);
	const restaurant = summary.restaurant;
	const targetDir = validateDownloadTargetDir(
		options.out || path.join("public", "assets", restaurant.slug),
	);
	await fs.mkdir(targetDir, { recursive: true });

	const downloaded = [];
	const skipped = [];
	const rankedCandidates = rankCandidates(
		restaurant.imageCandidates.filter((candidate) => candidate.url),
	);
	const usableCandidates = rankedCandidates.slice(0, options.max);
	for (let index = 0; index < usableCandidates.length; index += 1) {
		const candidate = usableCandidates[index];
		const ordinal = String(index + 1).padStart(2, "0");
		const initialExt = extensionFromUrl(candidate.url) || ".img";
		let targetPath = path.join(targetDir, `${restaurant.slug}-photo-${ordinal}${initialExt}`);
		try {
			let result;
			if (DATA_URL_RE.test(candidate.url)) {
				result = await downloadDataUrl(candidate, targetPath);
			} else {
				result = await downloadHttpUrl(candidate, targetPath, options.timeoutMs);
			}
			const finalExt = extensionFromMime(result.mimeType) || path.extname(targetPath);
			if (finalExt && path.extname(targetPath) !== finalExt) {
				const correctedPath = path.join(
					targetDir,
					`${restaurant.slug}-photo-${ordinal}${finalExt}`,
				);
				await fs.rename(targetPath, correctedPath);
				targetPath = correctedPath;
			}
			const dimensions = await readImageDimensions(targetPath);
			downloaded.push({
				index: index + 1,
				path: targetPath,
				sourceUrl: candidate.url,
				sourcePath: candidate.sourcePath,
				intendedUse: candidate.intendedUse,
				priority: candidate.priority,
				urlResolutionHint: candidate.urlResolutionHint,
				mimeType: result.mimeType,
				size: result.size,
				width: dimensions?.width ?? null,
				height: dimensions?.height ?? null,
				alt: `${restaurant.name || "Restaurant"} photo ${index + 1}`,
				caption: `${restaurant.name || "Restaurant"} ${candidate.intendedUse || "restaurant"} photo`,
			});
		} catch (error) {
			skipped.push({
				sourceUrl: candidate.url,
				sourcePath: candidate.sourcePath,
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}

	for (const candidate of restaurant.imageCandidates.filter((item) => !item.url)) {
		skipped.push({ sourcePath: candidate.sourcePath, reason: candidate.skippedReason || "No URL" });
	}

	const manifest = {
		sourcePath: inputPath,
		restaurant: {
			placeId: restaurant.placeId,
			name: restaurant.name,
			slug: restaurant.slug,
		},
		downloaded,
		skipped,
	};
	const manifestPath = options.manifest || path.join(targetDir, "downloaded-media.json");
	await writeJson(manifestPath, manifest);
	return { ...manifest, manifestPath };
}

function parseUploadOutput(stdout) {
	const trimmed = stdout.trim();
	if (!trimmed) throw new Error("Upload produced no JSON output");
	return JSON.parse(trimmed);
}

function mediaValueFromItem(item, fallback) {
	return {
		provider: "local",
		id: item.id,
		filename: item.filename,
		mimeType: item.mimeType,
		width: item.width ?? undefined,
		height: item.height ?? undefined,
		alt: item.alt ?? fallback.alt ?? undefined,
		meta: {
			storageKey: item.storageKey,
		},
	};
}

async function runSelect(inputPath, options) {
	const manifest = await readJson(inputPath);
	const downloaded = Array.isArray(manifest.downloaded) ? manifest.downloaded : [];
	if (!options.pick)
		throw new Error("--pick is required (comma-separated 1-based indices, e.g. --pick 1,3,5,8)");
	const pickIndices = new Set(
		String(options.pick)
			.split(",")
			.map((s) => Number(s.trim()))
			.filter((n) => Number.isFinite(n) && n >= 1),
	);
	if (pickIndices.size === 0) throw new Error("--pick must contain at least one valid index");
	const selected = downloaded.map((item) => ({
		...item,
		selected: pickIndices.has(item.index),
	}));
	const output = {
		...manifest,
		downloaded: selected,
		selectedCount: selected.filter((item) => item.selected).length,
		totalCount: selected.length,
	};
	const outPath = options.out || inputPath;
	await writeJson(outPath, output);
	return { ...output, outputPath: outPath };
}

async function runUpload(inputPath, options) {
	const manifest = await readJson(inputPath);
	const downloaded = Array.isArray(manifest.downloaded) ? manifest.downloaded : [];
	const hasSelections = downloaded.some((item) => item.selected === true);
	const itemsToUpload = hasSelections
		? downloaded.filter((item) => item.selected === true)
		: downloaded;
	const uploaded = [];
	const failed = [];

	for (const item of itemsToUpload) {
		const args = ["dineway", "media", "upload", item.path, "--url", options.url, "--json"];
		if (item.alt) args.push("--alt", item.alt);
		if (item.caption) args.push("--caption", item.caption);
		const result = spawnSync("npx", args, { encoding: "utf8" });
		if (result.status !== 0) {
			failed.push({
				path: item.path,
				reason: result.stderr.trim() || result.stdout.trim() || `exit ${result.status}`,
			});
			continue;
		}
		try {
			const mediaItem = parseUploadOutput(result.stdout);
			uploaded.push({
				localPath: item.path,
				sourceUrl: item.sourceUrl,
				mediaItem,
				mediaValue: mediaValueFromItem(mediaItem, item),
			});
		} catch (error) {
			failed.push({
				path: item.path,
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}

	const output = {
		sourceManifest: inputPath,
		restaurant: manifest.restaurant ?? null,
		dinewayUrl: options.url,
		uploaded,
		failed,
	};
	if (options.out) await writeJson(options.out, output);
	return output;
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		process.stdout.write(`${usage()}\n`);
		return;
	}

	let output;
	if (options.command === "summarize") {
		const payload = await readJson(options.input);
		output = summarize(payload, options.input);
		if (options.out) await writeJson(options.out, output);
	} else if (options.command === "download") {
		output = await runDownload(options.input, options);
	} else if (options.command === "select") {
		output = await runSelect(options.input, options);
	} else if (options.command === "upload") {
		output = await runUpload(options.input, options);
	}
	process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
});
