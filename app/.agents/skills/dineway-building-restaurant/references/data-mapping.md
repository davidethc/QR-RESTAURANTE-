# Enriched Place Data Mapping

The primary structured input is the JSON saved by `dineway-enrich-places`, normally `places/${placeId}.json`. Prefer `placeDetails`, then `selectedPlace`, then candidate summaries for fields absent above. Preserve this payload and supplement it with official-site notes and the separate browser artifact; do not mistake the endpoint sample for all available reviews/photos.

Read [Google Maps browser enrichment](google-maps-browser-enrichment.md) for acquisition and [JTBD enrichment](jtbd-and-content-enrichment.md) for normalization, evidence precedence, and analysis. Restaurant-owned current menu/policy facts require appropriate first-party support. Browser-observed review/photo material is additional evidence, not a reason to change identity or invent structured fields.

## Required Identity Fields

Map fields conservatively:

| Site concept     | Preferred enriched fields                                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Place id         | `placeDetails.placeId`, `selectedPlace.placeId`, `selectedPlace.id`, `search.selectedCandidate.placeId`, `search.selectedCandidate.id`   |
| Name             | `placeDetails.displayName.text`, `placeDetails.displayName`, `placeDetails.name`, `selectedPlace.displayName.text`, `selectedPlace.name` |
| Address          | `placeDetails.formattedAddress`, `placeDetails.shortFormattedAddress`, `selectedPlace.formattedAddress`, `selectedPlace.address`         |
| Phone            | `placeDetails.internationalPhoneNumber`, `placeDetails.nationalPhoneNumber`, `placeDetails.formatted_phone_number`                       |
| Rating           | `placeDetails.rating`, `selectedPlace.rating`                                                                                            |
| Review count     | `placeDetails.userRatingCount`, `placeDetails.user_ratings_total`, `selectedPlace.userRatingCount`                                       |
| Google Maps link | `placeDetails.googleMapsUri`, `placeDetails.url`, `selectedPlace.googleMapsUri`                                                          |
| Website          | `placeDetails.websiteUri` only if present                                                                                                |
| Categories       | `placeDetails.primaryCategories`, `placeDetails.categories`, `placeDetails.types`, `selectedPlace.types`                                 |
| Coordinates      | `placeDetails.latlon`, `placeDetails.location`, `placeDetails.geometry.location`, `selectedPlace.geometry.location`                      |
| Opening hours    | `placeDetails.regularOpeningHours.weekdayDescriptions`, `placeDetails.currentOpeningHours.weekdayDescriptions`                           |
| Reviews          | `placeDetails.reviews`                                                                                                                   |
| Images           | `placeDetails.photos`, `placeDetails.photoList`, `placeDetails.placeImageList`, `placeDetails.aiPhotoList`, selected-place fallbacks     |
| Menu             | `placeDetails.menuList`, `placeDetails.menuImages`                                                                                       |
| UGC posts        | `placeDetails.ugcPosts`                                                                                                                  |
| Other posts      | `placeDetails.posts`, `placeDetails.postList`, `placeDetails.placePostList`, selected-place post fallbacks                               |
| Videos           | `placeDetails.videos`, `placeDetails.videoList`, `placeDetails.placeVideoList`, `placeDetails.extraVideos`, selected-place fallbacks     |
| Review media     | `placeDetails.extImageReviews`, `placeDetails.reviewImageList`, `placeDetails.reviewVideoList`                                           |

## Useful Enriched Signals

Use these only when present:

- `businessStatus`
- `priceLevel`
- `placeType`, `categories`, `primaryCategories`, `primaryTypeDisplayName`, `googleMapsTypeLabel`
- `city`, `state`, `country`, `countryRegion`, `timeZone`, `utcOffsetMinutes`
- `postalAddress`, `addressComponents`, `addressDescriptor.areas`, `addressDescriptor.landmarks`, `viewport`
- `googleMapsLinks.placeUri`, `googleMapsLinks.photosUri`, `googleMapsLinks.reviewsUri`, `googleMapsLinks.directionsUri`, `googleMapsLinks.writeAReviewUri`
- `servesVegetarianFood`
- `dineIn`, `takeout`, `delivery`, `reservable`, `servesLunch`, `servesDinner`, `goodForGroups`, `restroom`, `goodForWatchingSports`, `liveMusic`, `pureServiceAreaBusiness`
- `paymentOptions.acceptsNfc`, `paymentOptions.acceptsDebitCards`, `paymentOptions.acceptsCreditCards`, `paymentOptions.acceptsCashOnly`
- `accessibilityOptions`
- `regularOpeningHours`
- `currentOpeningHours`
- `reviews[].text`, `reviews[].rating`, `reviews[].authorAttribution`, `reviews[].relativePublishTimeDescription`
- `numberReviews` when present as a separate enriched review count signal
- menu fields such as `menuList[].title`, `menuList[].items[].subTitle`, `menuList[].items[].desc`, `menuList[].items[].price`, `menuImages[]`
- post fields such as `ugcPosts[].text`, `title`, `imageUrls`, `videoUrls`, `videos`, `timeUtc`, `postUrl`, `userProfile`, `numLikes`, or `numComments`
- video fields such as title, description, thumbnail, transcript, caption, video URL, review link, or source URL when present
- review media fields such as `extImageReviews[].imageUrls`, `reviewImageList[].imageUrl`, `reviewVideoList[].videoUrl`, and their review/source links

These fields can shape content and page structure, but do not turn them into unsupported claims. For example, `takeout: true` supports a takeaway note; missing `delivery` means omit delivery claims.

## Data Utilization Matrix

Before design or content seeding, create `Data Utilization Matrix` in `.plan/<restaurant-slug>/findings.md`. For each present field family, record evidence references, the guest job/question, module/page, media/CTA needs, CMS ownership, and one of these outcomes:

- **Public page copy:** useful guest-facing facts for Home, Visit, About/Snapshot, CTA labels, review highlights, or visit guidance.
- **CMS content source:** raw material for Menu, Reviews, Gallery, Advantages, special touches, experiences, visit tips, or optional Journal.
- **Media source:** image/video candidates to download, upload, caption, or use as design inputs.
- **Local SEO/JSON-LD:** structured data, page metadata, internal links, map links, and location signals.
- **Design direction:** visual tone, layout density, color/accent choices, image emphasis, or section priority.
- **Internal guardrail:** fields that prevent unsupported claims, such as false service flags or missing hours.
- **Not used:** only allowed with a specific reason, such as empty value, unusable media URL, duplicate signal, not customer-safe, or unsupported by Dineway/runtime.

Include rows for official-site facts/media and the Google Maps browser supplement, with actual additional unique review/photo counts, coverage gaps, and stop/access reasons. Link normalized evidence IDs to the source records so the same item cannot be counted twice.

Do not force every field into visible copy. "Use" includes SEO, internal guardrails, media selection, and CMS source planning when that is the correct boundary.

## Field Family Usage Rules

- **Identity and status:** use `displayName`, category/type labels, `businessStatus`, city/country, and short/formatted address for hero, metadata, navigation context, and JSON-LD. Do not promote a closed/non-operational place as open.
- **Address and local context:** use `postalAddress`, `addressComponents`, `addressDescriptor.areas`, and `addressDescriptor.landmarks` to improve Visit, "getting here" copy, local SEO, and nearby-area phrasing. Landmarks should be concise guest guidance, not raw descriptor dumps.
- **Coordinates and viewport:** use `latlon`/`location` for maps links and JSON-LD. Use `viewport` only for map framing or internal context; do not render bounding coordinates as public copy.
- **Ratings and review counts:** use `rating`, `userRatingCount`, and `numberReviews` for trust modules and JSON-LD when consistent. Preserve a Google rating/count pair from the same observation. If the browser supplies a clearly newer pair, record that observation and use the pair together. Keep collected sample counts separate; do not derive a new business rating from curated reviews.
- **Reviews:** use full review text, rating, author attribution, publish time, and links to curate Reviews/Advantages, Menu support, experience themes, and trust snippets. Keep public quotes short and attributed; do not expose flag links.
- **Extended review media:** use `extImageReviews`, `reviewImageList`, and `reviewVideoList` to pair real customer themes with Gallery, Reviews, Menu, and visual proof. Download usable media first; never render remote review media URLs directly.
- **Menu data:** use `menuList` sections/items and `menuImages` for the Menu CMS column. Preserve exact item names and source-backed preparation notes. Do not invent prices when `price` is empty.
- **UGC posts:** treat `ugcPosts` as a primary enriched field family when present. Use text, title, timestamp, image/video media, post URL, user profile, likes, and comments for supported experience/story ideas, Gallery/media selection, and review-reputation context. UGC is not an official announcement or proof of a menu change. Do not collapse it into generic post counts in planning.
- **Other posts:** use `posts`, `postList`, and `placePostList` as optional Journal source material. Identify authorship and timing; only substantiated updates support update-style content.
- **Videos:** use `videoList`, `placeVideoList`, `extraVideos`, `reviewVideoList`, and post video fields as design/media inputs and Menu/Gallery/Reviews/Experience source context. If video cannot be downloaded or embedded safely, use it as internal content context and record that choice.
- **Place images:** use `photos`, `photoList`, `placeImageList`, and `aiPhotoList` for hero, atmosphere sections, Gallery, and image-informed visual direction. Inspect and select representative images instead of using the first N blindly.
- **Service flags:** use positive flags such as dine-in, takeout, reservable, lunch, dinner, groups, restroom, delivery, or vegetarian support for guest guidance only when true. A missing value means unknown, not false; neither a missing flag nor a false one supports a positive claim.
- **Payment and accessibility:** use payment and accessibility options in Visit sections when customer-safe and useful. Do not turn internal booleans into awkward raw labels.
- **Map action links:** use `googleMapsLinks.directionsUri` for "Get directions", `reviewsUri` for "Read reviews", `photosUri` for gallery/map-photo context, and `writeAReviewUri` only when a review CTA is appropriate. Prefer `placeUri`/`googleMapsUri` as the canonical same-as link.
- **Time zone and UTC offset:** use for interpreting post/review times or operational context. Do not render raw offsets unless it helps guests.
- **Icon/category colors:** `categoryIcon`, `iconMaskBaseUri`, and `iconBackgroundColor` may inform subtle design accents, but do not use remote icon resources as primary brand assets.

## Supplemental Evidence Mapping

| Source                              | Use and boundary                                                                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Official page notes                 | Brand, current menu and policies, real action links, stories/updates, and downloaded first-party images; retain page URLs and dates where present         |
| `google-maps-evidence.json` reviews | Expanded customer language, jobs, Advantages, food recommendations, and friction; retain exact text, attribution, capture context, and actual date labels |
| `google-maps-evidence.json` photos  | Gallery and content-specific media candidates; save known image bytes locally before public use                                                           |
| Combined `evidence.json`            | One deduplicated index across source families with links back to raw records; input to the Agent's JTBD Content Brief, not public CMS copy                |
| Merged media manifest               | Actual local files, identity/content deduplication, inspected subjects, credits, relationships, and selected/uploaded state                               |

The summary helper reads only the original place input. The Agent joins official/browser sources in planning; do not assume they appear automatically in its output or modify the original JSON to make them look like API fields.

## Content Planning Rules

- Follow [restaurant-model.md](restaurant-model.md): Home, Menu, Reviews, Gallery, and Visit are required separate pages; Experience and Journal depend on evidence. Menu, Reviews, and Gallery use real published CMS content.
- Reviews combines Advantages with supporting real reviews and a broader themed collection. Menu evaluates Most popular items, Other favorites, and Beyond the menu. Gallery combines inspected unique assets from all usable sources.
- Use independent positive mentions to select popular food, then corroborate current menu facts. Official menu presence alone is not popularity; review mentions alone do not establish current availability, price, ingredients, or dietary suitability.
- Beyond the menu uses specific experience/special-touch evidence, not invented off-menu dishes. Tips use supported answers to real guest concerns, not inferred operating policies.
- Consider all useful UGC text/media, but do not require a story or update from it. Omit thin optional content rather than turning every field into an article.
- Missing fields are omitted, not fabricated. Evidence-limited optional modules can be omitted with a reason; absent real material for required Reviews/Gallery remains an explicit content blocker.
- Keep factual details exact, quotes short and attributed, and analysis private. Do not invent hours, chefs, awards, links, FAQs, or update dates.

## Optional Summary Command

```bash
node skills/dineway-building-restaurant/scripts/restaurant_site_data.js \
  summarize places/PLACE_ID.json \
  --out .plan/restaurant-slug/site-summary.json
```

The summary is a planning aid. Inspect the original JSON before final decisions.
