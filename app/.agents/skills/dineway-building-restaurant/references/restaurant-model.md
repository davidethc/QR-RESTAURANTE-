# Restaurant Pages, Content Modules, and CMS Ownership

Read this after the [JTBD content foundation](jtbd-and-content-enrichment.md) and before designing the site. A guest-facing page, an enrichment module, and a CMS collection are different things: one page can combine several collections, and one record can support several pages.

Use the real place payload, official-site notes, browser supplement, and inspected media. Do not load generic templates or demos as reference designs.

## Core Pages and Optional Extensions

| Page                     | Requirement                            | Guest decision                                                                     |
| ------------------------ | -------------------------------------- | ---------------------------------------------------------------------------------- |
| Home `/`                 | Required                               | Why choose this restaurant for this occasion, and what next?                       |
| Menu `/menu`             | Required, CMS-backed                   | What should I order, and what accompanies the meal?                                |
| Reviews `/reviews`       | Required, CMS-backed, independent page | Which concrete Advantages are supported by other guests' experiences?              |
| Gallery `/gallery`       | Required, CMS-backed, independent page | What do the food, space, arrival, and atmosphere actually look like?               |
| Visit `/visit`           | Required                               | How do I get there, plan the visit, and use available services?                    |
| Experience `/experience` | Optional                               | Is there enough distinct, supported experience content for a deeper decision page? |
| Journal `/journal`       | Optional                               | Are there substantive restaurant stories or actual updates worth reading?          |

Primary navigation and footer link to `/menu`, `/reviews`, `/gallery`, and `/visit`; the brand can link Home. Show optional routes only when populated. Homepage previews link to full pages; anchors are not substitutes for the required pages. Use `/visit` as the default arrival/contact route for new sites. Do not generate separate Blog and News merely because their source fields exist.

An optional page qualifies when it answers an additional guest question with enough independent evidence and useful content beyond a repeated homepage summary. Otherwise merge the material into an existing page or omit it. Do not require a fixed number of cards, reviews, images, articles, or optional pages.

## Page Responsibilities

### Home: Recognizable Value and Evidence

Use the primary job to prioritize a concise value proposition, specific reasons to visit, food/experience evidence, relevant concerns, and a real action. Adjust sequence and prominence to the restaurant. A takeaway may foreground menu/arrival; a celebration venue may foreground supported experience and booking context. Do not infer those services from a category alone.

Include contextual previews of Menu, Reviews/Advantages, and Gallery. Reuse their content records rather than separately writing the same evidence as homepage claims. Choose primary CTAs from actual published actions; a URL that happens to exist does not establish a service or booking availability.

### Menu: Three Complementary Lenses

Start with the available official/structured menu, useful categories, and source-supported factual details. Organize enrichment around these three explicitly evaluated lenses, using the following English labels or faithful translations in the site's language:

- **Most popular items:** prioritize distinct food/drink items supported by independent positive customer mentions. Check dish identity against current menu evidence. Explain the supported appeal with concise copy, an appropriate photo, and a real attributed excerpt when useful. This is a curated recommendation, not an invented sales chart. A menu alone does not prove popularity.
- **Other favorites:** give complementary choices such as additional dishes, drinks, desserts, or sides. Keep this selection disjoint from Most popular items, including aliases of the same dish. Do not demote a duplicate into this section just to fill space.
- **Beyond the menu:** show specific hospitality, interaction, rituals, or special touches that accompany the meal. It is experience content, not another list of food, an unsupported hidden menu, or a promise of free extras. Link to relevant reviews or the optional Experience page where useful.

Preserve exact menu names, prices/currency, and meaningful dietary/preparation information only when supported. Review-only or outdated dish names may remain in correctly attributed review context but must not become unverified currently orderable cards. Without current menu details, seed a concise supported menu introduction and use actual official-menu/contact links; do not invent a full menu.

Evaluate all three lenses and render the supported ones. Record an evidence-insufficient omission internally; do not publish an empty section, change the lens into generic filler, or invent popularity. The Menu page and its real CMS content remain required.

### Reviews: Advantages with Proof, Then Deeper Reviews

Build two connected layers:

1. **Advantages:** concrete reasons to choose the restaurant, selected from the JTBD model and inversion test. Pair each displayed Advantage with at least one supporting real review, available attribution, and a relevant inspected image when available. Multiple references can support a synthesis. Keep different dimensions complementary; six cards are not compulsory.
2. **Themed guest experiences:** a broader set of distinctive real reviews grouped by supported themes such as food, service, atmosphere, occasions, or practical experience. Allow readers to browse beyond the opening highlights; do not reduce the expanded evidence to the API's original few reviews.

Keep quotes in context. Do not manufacture names/avatars, turn critique into praise, or imply a curated subset represents all reviews. An Advantage must not claim more than its evidence supports. If none qualifies, retain the independent Reviews page with actual reviews and record why the Advantage module was omitted.

Use Google rating/count only as an observed pair from the identified listing. Do not average selected reviews into a replacement business rating. Normal platform attribution, original review links when available, and accurate translation labels are appropriate public content.

### Gallery: A Real Collection to Explore

Use representative images from the API, official website, and browser supplement, downloaded and inspected first. Group by actual subjects: food/drinks, space, exterior/arrival, atmosphere, or special details. Use captions and image relationships to connect Gallery with Menu, Reviews, and Experience.

Keep a strong opening selection and expose the rest through accessible pagination or progressive browsing. Do not load every full-resolution photo on first render, hide the collection behind an inaccessible carousel, or publish duplicates merely to increase count. See [media-pipeline.md](media-pipeline.md).

### Visit: Resolve Practical Friction

Combine supported NAP, hours, map/directions links, available contact/order/reservation actions, local arrival descriptors, and practical tips. Include payment/accessibility/service details only at the specificity actually supported. A reported queue does not justify a guaranteed queue-free time; a single accommodating visit does not establish an allergy policy.

Avoid raw booleans and planning caveats. State useful conditions accurately and omit unresolved claims. Keep sources and reasons for uncertainty in planning.

### Optional Experience and Journal

Experience expands supported occasions, space, rituals, or service details with additional depth. Beyond the menu can preview the same underlying records without duplicating them.

Journal combines substantive stories and actual updates using a `kind` distinction (`story` or `update`). An update requires evidence of the change/event and any claimed date; capture/publication time alone is not the event date. UGC may inspire a supported story but is not automatically an official announcement. Do not seed evergreen filler as news or require an article just because a post exists.

## CMS Boundary

Design the Astro experience freely, then wire reusable content into the planned boundaries. Do not stop after static output. Use these collection names as the default content vocabulary; create additional types only when selected, supported material uses them:

| Collection    | Content and reuse                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `menu`        | Required. Real menu items and/or supported menu introduction; selection grouping distinguishes popular/other favorites from the remaining menu |
| `reviews`     | Required. Real attributed reviews; referenced by Advantages, menu selections, and themed review browsing                                       |
| `gallery`     | Required. Selected uploaded media, subject/category, caption, available credit, and content relationships                                      |
| `highlights`  | Used for Advantages and special touches, distinguished by kind; shared by Home, Reviews, Menu/Beyond the menu, and Experience                  |
| `experiences` | Supported dining situations or deeper experience narratives reused in Home and optional Experience                                             |
| `visit_tips`  | Reusable practical guidance; referenced where the relevant concern arises                                                                      |
| `journal`     | Optional stories and substantiated updates; detail pages at `/journal/{slug}` when enabled                                                     |

Use explicit references for shared records where supported; use structured reference lists when a relationship is plural. The review's public attribution lives with the review; supporting quotes in Advantages point to it rather than fabricating a separate testimonial. Store audit evidence IDs and analysis in private planning, not in public marketing bodies.

Astro owns layouts, hero composition, one-off promotional text, and static contact facts unless ongoing editing requires a managed boundary. Do not create a generic `pages` collection just to place all layout in CMS.

Required `menu`, `reviews`, and `gallery` collections must have genuine published seed content, and corresponding pages must query and render it. Selected auxiliary collections must likewise be populated and used; do not create empty structures speculatively. When the required genuine material is absent after source attempts, record a content blocker rather than removing the page or manufacturing seed entries.

Only collections whose entries have real detail routes need a `urlPattern` and `supports: ["seo"]`. Embedded menu rows, photos, reviews, and tips can be published CMS records without artificial detail pages. Parent pages still need page-level SEO and discovery. Follow [schema-and-seed.md](schema-and-seed.md) and [querying-and-rendering.md](querying-and-rendering.md).

## Design and Completion Records

Before implementation, `findings.md` contains:

- `JTBD Content Brief` and the linked evidence index.
- `Data Utilization Matrix` connecting every source family to guest value, modules/pages, media, and CMS ownership or a non-use reason.
- `Design Comparison` with 2–3 options and the selected frontend direction.
- `Site Architecture` with five core routes, selected optional/detail routes, navigation/footer, modules, CTAs, collections, reuse relationships, and omission reasons.
- `Brand Voice & Copy Tone Brief` and `Customer Visibility Filter` from [seo-and-design.md](seo-and-design.md).

Completion means the planned routes, CMS queries, genuine seeds, selected media uploads, content relationships, and full collection browsing work together. Preserve the five core pages even for sparse data. Do not claim completion with a missing Reviews/Gallery collection, a static-only replacement, fabricated content, or unresolved absence of real source material.
