# Dineway Querying and Rendering

Use this reference for Dineway runtime mechanics in restaurant sites. Examples are mechanics only; adapt collection names, routes, metadata, and copy to the target restaurant's actual schema and enriched place data.

## Content Queries

All query functions are imported from `"dineway"`.

### getDinewayCollection

Fetch multiple entries from a collection. Returns `{ entries, error, cacheHint, nextCursor }`.

```typescript
import { getDinewayCollection } from "dineway";

// Basic
const { entries: posts } = await getDinewayCollection("posts");

// With options
const { entries: posts, cacheHint } = await getDinewayCollection("posts", {
	status: "published",
	limit: 10,
	orderBy: { published_at: "desc" },
	where: { category: "news" },
});
```

Options:

- `status` -- filter by status (`"published"`, `"draft"`, etc.)
- `limit` -- max entries
- `cursor` -- opaque cursor for keyset pagination (pass `nextCursor` from a previous result)
- `orderBy` -- `{ field: "asc" | "desc" }` (default: `{ created_at: "desc" }`)
- `where` -- filter by field values or taxonomy terms. Supports arrays for OR: `{ category: ["news", "featured"] }`
- `locale` -- filter by locale (when i18n is configured)

### getDinewayEntry

Fetch a single entry by slug. Returns `{ entry, error, isPreview, cacheHint }`.

```typescript
import { getDinewayEntry } from "dineway";

const { entry: post, cacheHint } = await getDinewayEntry("posts", slug);

if (!post) {
	return Astro.redirect("/404");
}
```

### Entry Shape

```typescript
interface ContentEntry<T> {
	id: string; // The slug (used in URLs)
	data: T; // All fields, including system fields
	edit: EditProxy; // Visual editing attributes (spread onto elements)
}

// data includes system fields plus your custom fields:
interface PostData {
	id: string; // Database ULID (use for taxonomy lookups, etc.)
	slug: string;
	status: string;
	title: string;
	featured_image?: {
		id: string;
		src?: string;
		alt?: string;
		width?: number;
		height?: number;
	};
	content?: PortableTextBlock[];
	createdAt: Date;
	updatedAt: Date;
	publishedAt: Date | null;
	// Bylines (eagerly loaded)
	byline: BylineSummary | null; // Primary author
	bylines: ContentBylineCredit[]; // All credits (with roleLabel, source)
	// ... your custom fields
}
```

**Important:** `entry.id` is the slug (for URLs), `entry.data.id` is the database ULID (for API calls like `getEntryTerms`).

### Caching

Query results include a `cacheHint` for Astro's Route Caching:

```astro
---
const { entries: posts, cacheHint } = await getDinewayCollection("posts");
Astro.cache.set(cacheHint);
---
```

Always call `Astro.cache.set(cacheHint)` -- it enables automatic cache invalidation when content changes.

## Restaurant Modules and Expanded Collections

Follow [restaurant-model.md](restaurant-model.md) for page/collection ownership. `/menu`, `/reviews`, and `/gallery` are independent pages even when their records also appear on Home. Do not assume a collection entry has a detail URL: embedded reviews, images, menu rows, and tips can be rendered directly on parent pages without entry URL helpers or synthetic detail links.

- Query published `highlights` for Advantages and special touches, resolving their real supporting review references. Reuse the same records for Reviews/Advantages and Menu/Beyond the menu as appropriate; do not duplicate testimonial data or blindly reuse a single review for unrelated claims.
- Render Menu's supported popular/other-favorites selections from distinct menu records, with additional menu data where available. Beyond the menu comes from experience/special-touch records, not a duplicate dish list.
- Combine repeated content through shared components and real record IDs. A saved reference is not automatically an expanded review; resolve it through the runtime's supported queries and preserve original attribution. Missing/broken references are validation failures, not permission to generate replacement reviews.
- Register cache dependencies for all queried collections/records using the supported Astro cache API, including records resolved for another module. Avoid a hand-built long-lived cache that leaves embedded reviews or tips stale. Verify a local edit reaches every placement and restore the edited value.

### Reviews and Gallery Pagination

Use `getDinewayCollection` cursor pagination rather than silently displaying only the default batch. A reasonable first page is 20 entries, adjusted to the layout and runtime limits. Pass the returned `nextCursor` to the next request, keep filtering and sort order consistent, and use a stable tie-breaker through the runtime's pagination semantics.

Server-render the first batch and provide an ordinary, properly URL-encoded continuation link to the same public page with its cursor and theme query parameters. Optional load-more controls can enhance that link but must not make content accessible only through client JavaScript. When a theme changes, reset its cursor. Stop only when there is no `nextCursor`; do not loop on an unchanged cursor or treat a query error as an empty successful collection.

Resolve Advantage-linked reviews independently of which review page is currently visible. Selected menu/supporting evidence must not disappear just because its review is beyond the current batch. Fetch only the related records needed for the current view, not the entire review/photo collection on every request.

Gallery thumbnails use appropriately sized media with dimensions and lazy loading; retrieve larger images only when needed for viewing. Preserve actual credits and content relationships from the selected media manifest when seeding. A successful media upload alone does not transfer all provenance/credit fields automatically.

Validation must include a collection larger than the chosen batch: follow continuation links, check that records are neither lost nor repeated, change/reset a theme, and inspect the last page. Confirm shared records remain consistent after a local CMS edit and that the five core navigation links still resolve.

## Rendering Portable Text

### PortableText component

```astro
---
import { PortableText } from "dineway/ui";
---
<PortableText value={post.data.content} />
```

Renders standard blocks (paragraphs, headings, lists, blockquotes, code blocks, images) and inline marks (bold, italic, code, strikethrough, links).

### Custom block types

For custom PT blocks (e.g., marketing components), pass a `components` prop:

```astro
---
import { PortableText } from "dineway/ui";
import Hero from "./blocks/Hero.astro";
import Features from "./blocks/Features.astro";

const customTypes = {
	"marketing.hero": Hero,
	"marketing.features": Features,
};
---
<PortableText value={page.data.content} components={{ type: customTypes }} />
```

Each custom component receives the block data as props.

## Image Component

**Always use the Dineway Image component for CMS images.** Image fields are objects, not strings.

```astro
---
import { Image } from "dineway/ui";
---

{/* Correct -- passes the image object */}
<Image image={post.data.featured_image} />

{/* Also works with explicit props */}
{post.data.featured_image?.src && (
	<img src={post.data.featured_image.src} alt={post.data.featured_image.alt || ""} />
)}
```

**Common mistake:**

```astro
{/* WRONG -- image is an object, not a string */}
<img src={post.data.featured_image} />
```

## Visual Editing Attributes

Entries include `edit` attributes for inline editing. Spread them onto the element that displays the field:

```astro
<h1 {...post.edit.title}>{post.data.title}</h1>
<p {...post.edit.excerpt}>{post.data.excerpt}</p>
<div {...post.edit.featured_image}>
	<Image image={post.data.featured_image} />
</div>
```

When an admin is logged in and views the site, these attributes enable click-to-edit functionality.

## Common Page Patterns

### List page (e.g., `/posts/index.astro`)

```astro
---
import { getDinewayCollection, getEntryTerms } from "dineway";
import { Image } from "dineway/ui";
import Base from "../../layouts/Base.astro";

const { entries: posts, cacheHint } = await getDinewayCollection("posts", {
	orderBy: { published_at: "desc" },
});
Astro.cache.set(cacheHint);

const sortedPosts = posts.toSorted((a, b) => {
	const dateA = a.data.publishedAt?.getTime() ?? 0;
	const dateB = b.data.publishedAt?.getTime() ?? 0;
	return dateB - dateA;
});
---
<Base title="Posts">
	{sortedPosts.map(post => (
		<article>
			{post.data.featured_image && <Image image={post.data.featured_image} />}
			<a href={`/posts/${post.id}`}>{post.data.title}</a>
			{post.data.excerpt && <p>{post.data.excerpt}</p>}
		</article>
	))}
</Base>
```

### Detail page (e.g., `/posts/[slug].astro`)

```astro
---
import { getDinewayEntry, getEntryTerms, getSeoMeta } from "dineway";
import { Image, PortableText } from "dineway/ui";
import Base from "../../layouts/Base.astro";

const { slug } = Astro.params;
if (!slug) return Astro.redirect("/404");

const { entry: post, cacheHint } = await getDinewayEntry("posts", slug);
if (!post) return Astro.redirect("/404");

Astro.cache.set(cacheHint);

const seo = getSeoMeta(post, {
	siteTitle: "My Blog",
	siteUrl: Astro.url.origin,
	path: `/posts/${slug}`,
});

const tags = await getEntryTerms("posts", post.data.id, "tag");
---
<Base title={seo.title} description={seo.description}>
	<article>
		{post.data.featured_image && (
			<div {...post.edit.featured_image}>
				<Image image={post.data.featured_image} />
			</div>
		)}
		<h1 {...post.edit.title}>{post.data.title}</h1>
		<PortableText value={post.data.content} />
		{tags.length > 0 && (
			<div>
				{tags.map(t => <a href={`/tag/${t.slug}`}>{t.label}</a>)}
			</div>
		)}
	</article>
</Base>
```

### Taxonomy archive (e.g., `/category/[slug].astro`)

```astro
---
import { getTerm, getDinewayCollection } from "dineway";
import Base from "../../layouts/Base.astro";

const { slug } = Astro.params;
const term = slug ? await getTerm("category", slug) : null;
if (!term) return Astro.redirect("/404");

const { entries: posts } = await getDinewayCollection("posts", {
	where: { category: term.slug },
	orderBy: { published_at: "desc" },
});
---
<Base title={`${term.label} posts`}>
	<h1>{term.label}</h1>
	{posts.map(post => (
		<a href={`/posts/${post.id}`}>{post.data.title}</a>
	))}
</Base>
```

### RSS feed (e.g., `/rss.xml.ts`)

```typescript
import type { APIRoute } from "astro";
import { getDinewayCollection } from "dineway";

const siteTitle = "My Site";

export const GET: APIRoute = async ({ url }) => {
	const siteUrl = url.origin;
	const { entries: posts } = await getDinewayCollection("posts", {
		orderBy: { published_at: "desc" },
		limit: 20,
	});

	const items = posts
		.filter((p) => p.data.publishedAt)
		.map((post) => {
			const postUrl = `${siteUrl}/posts/${post.id}`;
			return `    <item>
      <title>${escapeXml(post.data.title)}</title>
      <link>${postUrl}</link>
      <guid isPermaLink="true">${postUrl}</guid>
      <pubDate>${post.data.publishedAt!.toUTCString()}</pubDate>
      <description>${escapeXml(post.data.excerpt || "")}</description>
    </item>`;
		})
		.join("\n");

	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(siteTitle)}</title>
    <link>${siteUrl}</link>
    <atom:link href="${siteUrl}/rss.xml" rel="self" type="application/rss+xml"/>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`,
		{
			headers: {
				"Content-Type": "application/rss+xml; charset=utf-8",
				"Cache-Control": "public, max-age=3600",
			},
		},
	);
};

function escapeXml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}
```

### 404 page (`/404.astro`)

```astro
---
import Base from "../layouts/Base.astro";
---
<Base title="Not Found">
	<h1>Page not found</h1>
	<p>The page you're looking for doesn't exist.</p>
	<a href="/">Go home</a>
</Base>
```

### Empty state

When a collection has no content, show a helpful empty state:

```astro
{posts.length === 0 ? (
	<section>
		<h2>No posts yet</h2>
		<p>Create your first post in the admin panel.</p>
		<a href="/_dineway/admin/content/posts/new">Create a post</a>
	</section>
) : (
	/* ... render posts ... */
)}
```

## Pagination

`getDinewayCollection` supports cursor-based keyset pagination. Pass `cursor` from a previous result's `nextCursor` to get the next page:

```astro
---
const cursor = Astro.url.searchParams.get("cursor") ?? undefined;
const { entries, nextCursor, cacheHint } = await getDinewayCollection("posts", {
	limit: 10,
	cursor,
	orderBy: { published_at: "desc" },
});
Astro.cache.set(cacheHint);
---
{entries.map(post => (
	<a href={`/posts/${post.id}`}>{post.data.title}</a>
))}
{nextCursor && <a href={`?cursor=${nextCursor}`}>Next page</a>}
```

`nextCursor` is `undefined` when there are no more results.

## Date Formatting

Dates come as `Date` objects. Use `toLocaleDateString` or `Intl.DateTimeFormat`:

```typescript
const formatted = post.data.publishedAt?.toLocaleDateString("en-US", {
	year: "numeric",
	month: "long",
	day: "numeric",
});
```
