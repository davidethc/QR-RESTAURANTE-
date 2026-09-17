---
name: dineway-building-restaurant
description: "Build Astro-first Dineway restaurant sites from place data, official-site facts, and Google Maps reviews and photos supplemented through a browser. Use when a user provides a restaurant name and city, optionally a placeId, and wants a polished restaurant website. Apply local Agent JTBD enrichment to Menu, Reviews with Advantages, a standalone Gallery, and visit guidance; integrate reusable content with Dineway CMS."
---

# Building a Restaurant Site

Build around the decisions guests need to make: why visit, what to order, what the experience feels like, and how to get there. Use one evidence-grounded JTBD model across the site, with richer reviews and photos than the initial place response alone provides.

## Inputs and Boundaries

- Require restaurant name and city, region, or city/country. Ask for missing values before fetching data or creating site files. A Google/Dineway `placeId` is optional.
- Keep the existing `$dineway-enrich-places` lookup and official-website extraction. Supplement Google Maps through normal browser interaction; do not add enrichment APIs, hidden Maps endpoints, external model calls, or batch generation services. The current Agent performs all new analysis and synthesis.
- Require distinct crawlable pages at `/`, `/menu`, `/reviews`, `/gallery`, and `/visit`. Reviews and Gallery cannot be replaced by homepage sections. Experience and Journal are evidence-dependent additions.
- Menu, Reviews, and Gallery must query real published Dineway content. Reusable Advantages, special touches, experiences, and tips also belong in CMS when used. Astro owns layout and one-off promotional copy.
- Do not inspect, copy, or adapt Dineway `templates/` or `demos/` unless the user explicitly requests that exact source. Existing demo-like target files are replaceable implementation files, not a design reference.

## Required Workflow

### 1. Establish the evidence and planning workspace

- Use `$dineway-enrich-places` with name, city, and the optional authoritative place id. Inspect its returned `placeDetailsPath`, including reviews, menu data, UGC, posts, videos, service flags, and media. Preserve the original JSON.
- Maintain `.plan/<restaurant-slug>/task_plan.md`, `findings.md`, and `progress.md` for the complete run, including source gaps and validation results.
- Read [data-mapping.md](references/data-mapping.md) for field coverage. The optional `summarize` helper supplies factual planning inputs; it does not decide the site structure or perform JTBD enrichment.

### 2. Extract official restaurant context

- When `placeDetails.websiteUri` exists, validate it as HTTP(S), confirm restaurant identity, and fetch it before content planning. Start with the homepage and useful linked Menu, About, Visit/Contact, Reservations, Order, Catering, Events, Gallery, or announcement pages; normally 6–10 pages are enough.
- Stay on the restaurant origin except for intentionally linked ordering, reservation, menu, or social destinations needed for guest actions.
- Extract brand voice, published menu names/descriptions/prices, contact details, hours, action links, operational policies, first-party images, and actual stories or announcements. Paraphrase marketing prose; preserve exact factual strings and short attributed quotations where needed.
- Save page URLs, facts, media candidates, and failures in `official-website.md` under the planning directory. If unavailable or unrelated, record the reason and continue unless identity remains unresolved.
- Prefer current first-party evidence for restaurant-owned offerings and policies. Use the identified Google listing for its rating/count and Maps links; record source and observation time. Resolve conflicting NAP, hours, or menu information before publication; omit unresolved details rather than guessing. A review or photograph does not override a current official policy.

### 3. Supplement Google Maps through the browser

- Read [google-maps-browser-enrichment.md](references/google-maps-browser-enrichment.md) and use an available browser controller according to its own documentation.
- Attempt supplementation on the exact restaurant listing even when the place response already has a few reviews/photos. Browse expanded review text, multiple available sort modes, and relevant photo categories through the visible UI.
- Save `google-maps-evidence.json` separately from the original Places payload. Record identity, sources, captured evidence, counts, coverage, and stop reason; deduplicate against API material before interpreting frequency or selecting media.
- Aim for broader decision coverage and usable display material, not exhaustive scraping. Access blocks are recorded limitations, never a reason to bypass controls or claim successful supplementation.

### 4. Build the JTBD content foundation

- Read [jtbd-and-content-enrichment.md](references/jtbd-and-content-enrichment.md) in full. Apply its theory, evidence rules, and ordered analysis steps using the current Agent.
- Normalize combined evidence into the private planning index; write a concise `JTBD Content Brief` in `findings.md` covering customer language, jobs, outcomes, four forces, differentiators, inversion tests, and content selections with evidence references.
- Explicitly evaluate **Advantages**, **Most popular items**, **Other favorites**, **Beyond the menu**, and practical visit tips. Render supported selections; record evidence-insufficient omissions without inventing replacements.
- Extend `Data Utilization Matrix` with evidence references, guest questions/jobs, public modules/pages, media needs, and CMS ownership. Cover every present field family, official-site context, and browser supplementation, including intentional non-use.

### 5. Inspect media and decide the site design

- Read [media-pipeline.md](references/media-pipeline.md). Download and inspect candidates from all sources before committing to the visual design. Combine them into one deduplicated manifest; keep image-to-review/dish/experience relationships.
- Choose quantity by quality and coverage. The helper's download batch size is not a site-wide limit, and Gallery is not limited to 8–10 images. Never use remote Google photo URLs or resource names in site markup.
- Use inspected media to refine the JTBD brief. Images prove visible details, not service policies or invisible qualities.
- Read [restaurant-model.md](references/restaurant-model.md) and invoke `$dineway-brainstorming` to compare 2–3 information architecture, visual direction, and CMS options within the required five-page framework. Automatically adopt the strongest supported recommendation.
- Read `$dineway-frontend-design` before implementing visible layout, components, or CSS. Do not merely imitate its process.
- Before implementation, `findings.md` must contain `Design Comparison` with the selected recommendation and frontend execution notes, plus `Site Architecture` with routes, navigation, page modules, CTAs, collections, reusable records, and reasons for optional-page omissions.
- Read [seo-and-design.md](references/seo-and-design.md). Before public copy or seeds, record `Brand Voice & Copy Tone Brief` and `Customer Visibility Filter`. Apply the filter to every title, description, quotation treatment, caption, CTA, and metadata string.

### 6. Build the Astro-first experience

- Build Home, Menu, Reviews, Gallery, Visit, and selected optional routes using the agreed content and design. Homepage previews link to full pages.
- Primary navigation and footer must link to `/menu`, `/reviews`, `/gallery`, and `/visit`; do not substitute homepage anchors. Show optional links only for real pages with meaningful content.
- Reviews combines Advantages with supporting attributed reviews and a broader themed review collection. Menu combines the three specified content lenses with actual menu information. Gallery presents an expanded, curated collection with useful thematic grouping.
- Keep mobile layouts, shared navigation, footer, and page metadata consistent. Use progressive browsing for larger collections with server-rendered initial content and accessible continuation links.
- Configure a production public origin with `siteUrl` or `DINEWAY_SITE_URL`. Register `seoGraphPlugin()`, proxy its schema-map endpoint at `/schemamap.xml`, and render `DinewayHead` from shared layouts. Follow [configuration.md](references/configuration.md).
- This is not a stopping point: complete the CMS integration next.

### 7. Integrate reusable content with Dineway

- Read [schema-and-seed.md](references/schema-and-seed.md), [querying-and-rendering.md](references/querying-and-rendering.md), and relevant [site-features.md](references/site-features.md) guidance.
- Create and seed required `menu`, `reviews`, and `gallery` collections and the other content types selected in the architecture. Query and render their published content on the intended pages; schemas or hardcoded substitutes alone are incomplete.
- Reuse Advantages, special touches, experiences, and tips across pages through shared records/references. Do not duplicate independent copies of the same review or insight for each page.
- Give `supports: ["seo"]` and a matching `urlPattern` only to collections with real detail routes. Embedded records do not need artificial review, image, or tip detail pages. Page-level SEO remains required.
- Upload selected local media before seeding CMS image fields and render those media objects with `dineway/ui` `Image`. Preserve source attribution as appropriate; keep analysis metadata out of public copy.
- Journal is optional. Only actual update evidence supports update-style entries; UGC is not automatically an official announcement. Do not force Blog or News collections.

### 8. Validate the full result

- Validate all five core routes and every optional/detail route in `Site Architecture`, plus `/robots.txt`, `/sitemap.xml`, and `/schemamap.xml`. Check actual primary navigation and footer links in the browser, not just response status.
- Confirm each selected collection contains genuine published content and its target pages render it. Check all review/gallery pagination, topic controls, linked evidence displays, and menu sections; do not silently truncate to the first query batch.
- Verify every Advantage has appropriate supporting evidence and a real review; inspect quote meaning and attribution. Verify popularity uses independent positive evidence, the two food selections do not overlap, and Beyond the menu contains supported experience details rather than invented hidden dishes.
- Check the browser supplementation report against saved material: same branch, deduplication, actual additional counts, representative coverage, and accurate completion/limitation claims.
- Verify local media and CMS uploads resolve, images are not repeated merely to pad Gallery, and meaningful alt text and any required credits survive rendering.
- Change one reused CMS record in the local test site and confirm all intended placements update with the documented cache behavior; restore the test value. Check static promotional content still renders without CMS records, but do not accept an empty final CMS-backed page.
- Use only supported facts in JSON-LD. Do not infer business-wide ratings from the selected review sample or put analysis labels into structured data.
- Search rendered copy for internal-rule language from `Customer Visibility Filter` and remove it. Normal review/photo attribution and useful factual qualifications are allowed.
- Run applicable typecheck/lint checks; use `bgproc` for dev servers and browser-test desktop/mobile behavior. Menu, Reviews, Gallery, CMS integration, and available source-based enrichment are completion requirements. If real reviews or images are entirely unavailable, report the unresolved content blocker instead of inventing content, dropping the page, or claiming completion.

## Helper Script

```bash
# Factual inputs only; inspect raw and supplemental sources yourself.
node skills/dineway-building-restaurant/scripts/restaurant_site_data.js summarize places/PLACE_ID.json

# Download a candidate batch from the place payload; adjust to available quality.
node skills/dineway-building-restaurant/scripts/restaurant_site_data.js download places/PLACE_ID.json \
  --out public/assets/restaurant-name/place \
  --max 40 \
  --manifest .plan/restaurant/place-media.json

# After adding browser/official assets to the merged manifest and inspecting them:
# --pick lists the actual selected indices; this is an example, not a count limit.
node skills/dineway-building-restaurant/scripts/restaurant_site_data.js select \
  .plan/restaurant/downloaded-media.json \
  --pick 1,3,5,6,8,10,12,15 \
  --out .plan/restaurant/selected-media.json

node skills/dineway-building-restaurant/scripts/restaurant_site_data.js upload \
  .plan/restaurant/selected-media.json \
  --url http://localhost:4321 \
  --out .plan/restaurant/uploaded-media.json
```

The helper reads the place payload for summarization/downloads, and a media manifest for selection/upload. It does not browse Google Maps, ingest the browser evidence file, or generate enrichment.

## Reference Documents

| Reference                                                                      | Read when                                                       |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| [Data mapping](references/data-mapping.md)                                     | Inspecting place, official, and supplemental evidence           |
| [Google Maps browser enrichment](references/google-maps-browser-enrichment.md) | Supplementing reviews and photos before content planning        |
| [JTBD and content enrichment](references/jtbd-and-content-enrichment.md)       | Building the shared decision model before IA and copy           |
| [Restaurant model](references/restaurant-model.md)                             | Selecting modules, routes, navigation, and CMS ownership        |
| [Media pipeline](references/media-pipeline.md)                                 | Downloading, deduplicating, inspecting, and uploading photos    |
| [SEO and design](references/seo-and-design.md)                                 | Defining voice, visual direction, and public visibility         |
| [Configuration](references/configuration.md)                                   | Configuring Astro/Dineway runtime and discovery                 |
| [Schema and seed](references/schema-and-seed.md)                               | Modeling and seeding the selected content                       |
| [Querying and rendering](references/querying-and-rendering.md)                 | Rendering reusable content and larger collections               |
| [Site features](references/site-features.md)                                   | Using settings, navigation, taxonomies, search, and SEO helpers |
