# SEO, Guest-Facing Design, and Copy

Use the shared [JTBD content foundation](jtbd-and-content-enrichment.md) and [restaurant model](restaurant-model.md) to determine what each page helps a guest decide. The foundation informs design; its internal labels are not the site's voice.

## Information Architecture and Visual Direction

Require Home, Menu, Reviews, Gallery, and Visit at `/`, `/menu`, `/reviews`, `/gallery`, and `/visit`. Keep Reviews and Gallery independent even when Home uses their content. Primary navigation and footer link to all four non-home core pages. Experience and Journal are enabled only when supported material warrants them; do not force Blog/News.

Invoke `$dineway-brainstorming` to compare 2–3 directions within those constraints and automatically choose the best-supported option. Before implementation, record `Design Comparison` and `Site Architecture` in `findings.md`, including routes, modules, CTAs, media coverage, and CMS reuse. Use `$dineway-frontend-design` for the visible Astro implementation.

Choose hierarchy from actual jobs and inspected imagery, for example:

- Fast takeaway evidence: menu and arrival/order information are prominent; practical portion choice may be more useful than a long atmospheric hero.
- Supported group or celebration experiences: explain the dining setup, relevant food choices, and real booking guidance with appropriate photos and reviews.
- A distinctive sensory or interactive experience: use the relevant images and Beyond the menu content to explain what makes the meal memorable.
- Sparse evidence: concise, fact-led pages with the same core navigation; do not compensate with exaggerated claims or invented optional columns.

These are design examples, not category-to-service assumptions. Use a restrained 60-30-10 color balance, legible mobile typography, appropriate image density, and distinctive composition grounded in the venue. Do not impose a generic six-card layout, fake imagery, or a CMS-shaped wireframe.

Reviews must visually connect Advantages to their supporting real reviews, followed by broader themed evidence. Menu distinguishes Most popular items, Other favorites, and Beyond the menu, rendering only supported selections. Gallery uses meaningful groups and more than a token preview when useful media exists. Larger collections need responsive images and accessible continuation, not all full-resolution files loaded at once.

## Local SEO and Discovery

Every public page needs one `<h1>`, a page-specific title/description, crawlable links, a mobile-first layout, and lazy-loaded non-critical images. Keep the restaurant identity and location consistent without repeating a generic paragraph across pages.

Use `Restaurant` JSON-LD when the business is clearly a restaurant/cafe/food venue, or an appropriate `LocalBusiness` type otherwise. Include only supported factual properties, such as name, address, phone, coordinates, public URL, and observed hours. Sources may be the saved place data, official-page facts, or direct observations of the identified Maps listing recorded in planning.

- Include menu details, cuisine, price range, opening hours, reservation status, offers, social profiles, or `sameAs` only when the actual value is supported. JTBD inferences and missing booleans do not create schema facts.
- If displaying a Google rating/count, retain a pair from the same source observation. Neither the number of captured reviews nor a newly averaged selected sample replaces the business aggregate. Do not imply the site's curated reviews are exhaustive.
- Images must resolve to real local/uploaded assets on a public origin. No Google resource names, expired remote URLs, or fabricated media.
- Use address descriptors and actual map/directions links for useful local context and CTAs. Do not invent walking times, free parking, or accessibility guarantees.
- Use business status as a guardrail; do not advertise a closed venue as currently open. A capture timestamp is not a live opening-state check.

Dineway requirements:

- Configure a production public origin using `siteUrl` or `DINEWAY_SITE_URL`.
- Render `DinewayHead` from the shared layout using a public page context.
- Routable CMS entries use SEO support, a real matching `urlPattern`, and `content: { collection, id, slug }` in their page context. Embedded records do not require fabricated detail URLs; their parent pages have page-level SEO.
- Register `seoGraphPlugin()` and the public `/schemamap.xml` proxy according to [configuration.md](configuration.md).
- Validate actual content/discovery at `/robots.txt`, `/sitemap.xml`, and `/schemamap.xml`, not just successful HTTP responses. Ensure core Astro routes and selected detail routes are discoverable, and no non-existent embedded-record URLs are advertised.

## Brand Voice and Copy Tone

Before writing public copy or seeds, record `Brand Voice & Copy Tone Brief` in `findings.md`: restaurant-specific voice, first-person usage, warmth, confidence bounded by evidence, description length, and rules for transforming guest evidence into owned copy. Use official brand context plus the observed customer language, not an imported case-study voice.

- Use first-person restaurant perspective where natural for owned promotional copy, menu introductions, CTAs, and stories. Keep structured facts and attributed reviews in an appropriate neutral/quoted form.
- Transform supported themes into specific, concise copy. An observed individual-portion option can support a direct portion-choice statement; a pleasant review cannot support an award claim or a permanent service guarantee.
- Write confidently only within the evidence's limits. Do not make uncertain claims definitive by deleting qualifications. Narrow the claim, keep it within an accurate attributed experience, or omit it. Useful factual conditions such as published booking terms or dates are allowed.
- Distinguish a published menu fact from a review mention. Do not turn historical dishes, single complimentary gifts, quick visits, or accommodation anecdotes into current offerings, guaranteed speed, or dietary safety promises.
- Keep quotations short, exact, contextual, and attributed when names are available. Do not invent authors/avatars. Identify translations appropriately; a paraphrase is not a verbatim quote.
- Prefer short paragraphs, specific descriptions, and varied relevant evidence over repeated generic praise. Match the language of the site; translate the Menu lens labels faithfully without changing their responsibilities.
- Keep the voice consistent across Home, Menu, Reviews, Gallery, Visit, optional Experience/Journal, SEO, and CMS excerpts. Let the page's purpose change density, not the restaurant's identity.

## Customer Visibility Filter

Apply this before each public title, excerpt, body, review treatment, caption, CTA, and metadata string:

| Decision          | Treatment                                                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer-safe     | Specific food/experience information, useful arrival guidance, real review attribution, appropriate photo credit, factual dates/conditions, and substantiated stories/updates          |
| Internal-only     | Evidence IDs, source-field names, extraction method, confidence scores, incomplete coverage, prompt/tool language, planning hypotheses, selection rationales, and implementation notes |
| Reject or rewrite | Unsupported superlatives or policies, fake recency, placeholder text, audit-style explanations, and language that turns a source limitation into a guest-facing promise                |

Ask: would this information be useful and appropriate for a restaurant guest, and does its public phrasing stay within the evidence? If not, rewrite only if a useful supported fact remains; otherwise omit it. Never use the filter as a reason to hide legitimate attribution, remove a factual condition, or reverse a review's meaning.

Record `Customer Visibility Filter` in `findings.md` with customer-safe themes, internal-only notes, and rejected phrasing patterns. During validation search for phrases such as "review-visible facts", "not verified", "placeholder", "extracted", "scraped", "source field", "based on public review text", and implementation TODOs. Inspect matches in context: a legitimate credit or review source link is not leaked planning prose.

## Verification Scenarios

Review the final pages with the source index open:

- Every Advantage is concrete, appropriately differentiated, and supported by its displayed review.
- Popular/other food selections are distinct and grounded; Beyond the menu contains supported experience details rather than hidden-menu inventions.
- Different restaurant evidence changes visual hierarchy, module emphasis, and action priorities while preserving the five core pages.
- Gallery and Reviews let guests browse the expanded selected material, including later batches and actual theme controls; mobile interactions remain usable.
- Source-limited sections are omitted honestly, not padded. Required pages do not disappear; complete absence of real reviews/photos remains a documented blocker.
- Titles, descriptions, JSON-LD, visible copy, and CMS content agree on factual details and do not expose the internal enrichment process.
