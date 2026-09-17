# Restaurant Media Pipeline

Gallery is a required independent CMS-backed page. Build an expanded, curated collection from the place payload, official restaurant pages, and the [Google Maps browser supplement](google-maps-browser-enrichment.md). Download and inspect image bytes before using them in the site.

## Sources and Coverage

Consider all present sources: `placeImageList`, `photoList`, `photos`, `reviewImageList`, `extImageReviews`, `menuImages`, `ugcPosts`, `aiPhotoList`, usable video stills, selected-place fallbacks, first-party website images, and browser-observed Maps photos.

The API helper ranks known candidates by source priority and URL resolution hints. Ranking is an acquisition aid, not an instruction to select the first N. The current Agent adds official/browser material and judges actual image quality, guest value, and coverage. Inspect `aiPhotoList` candidates like any other source; a field name is neither proof of authenticity nor permission to present generated imagery as a real visit.

Cover food/drinks, interiors, exterior/arrival, atmosphere, and supported special details as available. Menu images can document menu facts when legible; review images can supply visual context; photos of tables or corridors cannot establish capacity, wheelchair measurements, allergy safety, or sound levels.

## 1. Download Source Batches

For the existing place payload:

```bash
node skills/dineway-building-restaurant/scripts/restaurant_site_data.js download \
  places/PLACE_ID.json \
  --out public/assets/restaurant-slug/place \
  --max 40 \
  --manifest .plan/restaurant-slug/place-media.json
```

`--max` controls this helper invocation, not the whole site. Its default remains a batch size; use an explicit value appropriate to the candidate pool. Browser supplementation initially targets about 30–50 distinct candidates across all sources when available. Neither that target nor the former 8–10-image selection is a fixed Gallery limit.

Download official/browser candidates with the available browser's supported save operation or a permitted download of a known rendered image URL. The helper does not consume `google-maps-evidence.json`; do not pass that artifact as a Places payload or pretend the helper already imported it. Keep these downloads under `public/assets/<restaurant-slug>/official/` and `.../maps/`, using unique filenames to avoid overwriting another batch.

- Validate the resulting file is an image, record actual dimensions and size, and inspect it. Reject failed downloads, HTML responses, tiny stretched thumbnails, unrelated businesses, and duplicates.
- If image bytes are unavailable, record the failure; a Maps UI screenshot or hotlinked image is not an acceptable substitute.
- Keep static assets in `public/assets/`, referenced publicly as `/assets/...`; do not use filesystem paths in generated HTML.
- Never put Google photo resource names, remote photo URLs, tokens, or scraping notes into site markup or CMS image fields.

## 2. Merge and Deduplicate the Manifest

Keep source manifests unchanged. Create `.plan/<restaurant-slug>/downloaded-media.json` with a `restaurant` identity object, a `downloaded` array, and a `skipped` array. Add all successful local files from API, official, and browser sources before selecting. This is a local Agent merge using the helper's existing manifest shape, not a new network service.

Each `downloaded` item needs:

| Field                                 | Purpose                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------- |
| `index`                               | Unique 1-based index in the merged array; reindex after merging                       |
| `path`                                | Existing local image path, consistently absolute or relative to the site workspace    |
| `sourceUrl`, `sourcePath`             | Observed image URL when available and source JSON/capture/page locator; never guessed |
| `mimeType`, `size`, `width`, `height` | Actual file properties; unavailable dimensions remain null                            |
| `alt`, `caption`                      | Specific customer-safe descriptions written after inspection                          |
| `intendedUse`                         | Planned page/module use, such as hero, gallery, menu, reviews, or experience          |

Retain additional context such as source page, evidence IDs, review/dish relationship, theme, capture time, and contributor/credit when available. Selection preserves these extra fields. Keep required public credit separate from internal source-analysis notes.

Deduplicate by known photo identity and downloaded content hash, then inspect near-identical crops/resolutions visually. URL equality alone misses the same photo at several sizes. Keep the best useful rendition and all source relationships. A photo can support multiple pages through the same media record; do not add it twice to Gallery because it was also selected as hero or attached to two sources.

The `skipped` array records source locators and concrete reasons such as download failure, duplicate, wrong branch, unusable size, or inappropriate content. Counts must distinguish candidates, downloaded files, unique images, selected images, and uploaded media.

## 3. Curate for the Guest's Questions

View the actual local images. Select by quality, subject diversity, useful resolution, and relevance to the JTBD/content plan. Use the strongest opening set and enough additional distinct photos for meaningful browsing. Do not pad to a target or arbitrarily stop at eight or ten when more useful material exists.

Write alt text from visible content and confirmed facts. Do not assign an exact dish name, ingredient, named person, or event from appearance alone. Preserve applicable contributor credits and source links in the appropriate public fields; do not invent attributions or erase visible watermarks to misrepresent ownership.

Mark actual selected indices with the helper, for example:

```bash
node skills/dineway-building-restaurant/scripts/restaurant_site_data.js select \
  .plan/restaurant-slug/downloaded-media.json \
  --pick 1,3,5,6,8,10,12,15 \
  --out .plan/restaurant-slug/selected-media.json
```

This list is illustrative, not a required selection count. Check that every chosen index maps to an inspected file and `selectedCount` is positive. Do not call upload for a zero-selection manifest; the helper treats a manifest without any `selected: true` as an unfiltered upload.

## 4. Upload and Wire the Selected Media

Start the local dev server with `bgproc` if needed, then upload:

```bash
bgproc start -n devserver -w -- pnpm dev
node skills/dineway-building-restaurant/scripts/restaurant_site_data.js upload \
  .plan/restaurant-slug/selected-media.json \
  --url http://localhost:4321 \
  --out .plan/restaurant-slug/uploaded-media.json
```

Use the returned `mediaValue` objects in CMS image fields and render with `Image` from `dineway/ui`. Static Astro promotional pages may use their real `/assets/...` files. Map upload results back to selected-manifest items by `localPath`; the upload result is not a replacement for the full source/credit/evidence manifest. Seed captions, themes, credits, and relationships from that manifest alongside the uploaded image object.

Only selected successful uploads can become published Gallery entries. For failures, retry the affected local files within the existing upload workflow; do not redownload or re-upload already successful items blindly. Keep unresolved upload errors visible in planning and do not claim a complete CMS Gallery until its planned files resolve.

## 5. Render and Verify the Gallery

- Keep `/gallery` independent and linked in navigation/footer even when Home has a preview.
- Group by actual subjects and expose the expanded collection through accessible pagination or progressive browsing. Server-render the first batch and provide crawlable continuation links; verify later batches as well as the opening grid.
- Use useful image sizes, explicit dimensions/aspect ratios, and lazy loading for non-critical images. Do not eagerly fetch all full-resolution assets for thumbnails or a lightbox.
- Verify captions, alt text, public credits, and Menu/Reviews relationships, with no unrelated stock/generated photos or repeated filler.
- If only a few good images exist, use those honestly. If none can be obtained after the available source attempts, record the blocker and request restaurant photos before final delivery. Do not remove Gallery, invent imagery, or report successful browser supplementation without saved evidence.
