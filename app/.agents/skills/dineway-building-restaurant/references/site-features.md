# Dineway Site Features

Use these site-feature mechanics only when they fit the restaurant's real content model. Do not add menus, taxonomies, widgets, search, comments, or plugins just because examples exist here.

## Site Settings

```typescript
import { getSiteSettings, getSiteSetting } from "dineway";

// All settings
const settings = await getSiteSettings();
settings.title; // "My Site"
settings.tagline; // "A description"
settings.logo?.url; // Resolved media URL
settings.favicon?.url;

// Single setting
const title = await getSiteSetting("title");
```

Available keys: `title`, `tagline`, `logo`, `favicon`, `social`, `timezone`, `dateFormat`.

Use these instead of hard-coding site name, logo, etc.

## Navigation Menus

```typescript
import { getMenu, getMenus } from "dineway";

// Fetch a named menu
const menu = await getMenu("primary");

// List all menus
const menus = await getMenus();
```

### Rendering a menu

```astro
---
import { getMenu } from "dineway";
const primaryMenu = await getMenu("primary");
---
<nav>
	{primaryMenu?.items.map(item => (
		<a href={item.url} target={item.target}>{item.label}</a>
	))}
</nav>
```

### Nested menus (dropdowns)

```astro
{primaryMenu?.items.map(item => (
	<li>
		<a href={item.url}>{item.label}</a>
		{item.children.length > 0 && (
			<ul class="submenu">
				{item.children.map(child => (
					<li><a href={child.url}>{child.label}</a></li>
				))}
			</ul>
		)}
	</li>
))}
```

### MenuItem shape

```typescript
interface MenuItem {
	id: string;
	label: string;
	url: string; // Resolved URL
	target?: string; // "_blank" etc.
	children: MenuItem[];
}
```

## Taxonomies

```typescript
import { getTaxonomyTerms, getTerm, getEntryTerms, getEntriesByTerm } from "dineway";

// All terms in a taxonomy (name must match your seed's "name" field exactly)
const categories = await getTaxonomyTerms("category");
const tags = await getTaxonomyTerms("tag");

// Single term by slug
const term = await getTerm("category", "news");
// { id, name, slug, label, children, count }

// Terms for a specific entry (use data.id, not entry.id!)
const postCategories = await getEntryTerms("posts", post.data.id, "category");
const postTags = await getEntryTerms("posts", post.data.id, "tag");

// Entries with a specific term
const newsPosts = await getEntriesByTerm("posts", "category", "news");
```

**Important:** The taxonomy name argument must match exactly what your seed defines in `"name"`. The blog seed uses `"category"` and `"tag"` (singular). Using `"categories"` returns empty results with no error.

**Important:** `getEntryTerms` takes the database ULID (`post.data.id`), not the slug (`post.id`).

### Displaying post terms

```astro
---
const tags = await getEntryTerms("posts", post.data.id, "tag");
---
{tags.map(t => (
	<a href={`/tag/${t.slug}`}>{t.label}</a>
))}
```

### Filtering by taxonomy

```astro
---
const { entries: posts } = await getDinewayCollection("posts", {
	where: { category: term.slug },
	orderBy: { published_at: "desc" },
});
---
```

## Widget Areas

Render a named widget area:

```astro
---
import { WidgetArea } from "dineway/ui";
---
<aside>
	<WidgetArea name="sidebar" />
</aside>
```

The `WidgetArea` component automatically renders all widgets in the area (search, categories, tags, recent posts, rich text, etc.) with appropriate HTML and CSS classes.

### Manual widget rendering

For more control, use the `getWidgetArea` function:

```astro
---
import { getWidgetArea } from "dineway";
import { PortableText } from "dineway/ui";

const sidebar = await getWidgetArea("sidebar");
---
{sidebar?.widgets.map(widget => (
	<div class="widget">
		{widget.title && <h3>{widget.title}</h3>}
		{widget.type === "content" && widget.content && (
			<PortableText value={widget.content} />
		)}
	</div>
))}
```

## Search

### LiveSearch component (instant search)

```astro
---
import LiveSearch from "dineway/ui/search";
---
<LiveSearch
	placeholder="Search..."
	collections={["posts", "pages"]}
/>
```

Customizable CSS classes:

```astro
<LiveSearch
	placeholder="Search..."
	class="site-search"
	inputClass="site-search-input"
	resultsClass="site-search-results"
	resultClass="site-search-result"
	collections={["posts", "pages"]}
	expandOnFocus={{ collapsed: "180px", expanded: "280px" }}
/>
```

Theme via CSS variables:

```css
:root {
	--dineway-search-bg: var(--color-bg);
	--dineway-search-text: var(--color-text);
	--dineway-search-muted: var(--color-muted);
	--dineway-search-border: var(--color-border);
	--dineway-search-hover: var(--color-surface);
	--dineway-search-highlight: var(--color-text);
}
```

### Programmatic search

```typescript
import { search } from "dineway";

const results = await search("hello world", {
	collections: ["posts", "pages"],
	status: "published",
	limit: 20,
});
// { results: SearchResult[], total, nextCursor? }
```

Each result has: `collection`, `id`, `title`, `slug`, `snippet` (HTML with `<mark>` highlights), `score`.

### Search page

```astro
---
import LiveSearch from "dineway/ui/search";
import Base from "../layouts/Base.astro";

const query = Astro.url.searchParams.get("q") || "";
---
<Base title="Search">
	<h1>Search</h1>
	<LiveSearch
		placeholder="Search posts..."
		collections={["posts", "pages"]}
	/>
</Base>
```

### Keyboard shortcut

Add Cmd+K / Ctrl+K to focus search:

```html
<script>
	document.addEventListener("keydown", (e) => {
		if ((e.metaKey || e.ctrlKey) && e.key === "k") {
			e.preventDefault();
			document.querySelector(".site-search-input")?.focus();
		}
	});
</script>
```

### Search prerequisites

Search requires per-collection enablement:

1. In admin: Edit Content Type -> check "Search" in Features
2. Mark fields as `"searchable": true` in the seed file
3. Only searchable fields of searchable collections are indexed

## SEO Meta

Generate SEO meta from content entries:

```typescript
import { getSeoMeta } from "dineway";

const seo = getSeoMeta(post, {
	siteTitle: "My Blog",
	siteUrl: Astro.url.origin,
	path: `/posts/${slug}`,
	defaultOgImage: featuredImageUrl, // Optional fallback
});

// Returns: { title, description, canonical, ogImage, robots }
```

Use in your layout's `<head>`:

```astro
<title>{seo.title}</title>
<meta name="description" content={seo.description} />
<link rel="canonical" href={seo.canonical} />
<meta property="og:image" content={seo.ogImage} />
{seo.robots && <meta name="robots" content={seo.robots} />}
```

## Sitemap and Schema Map

Dineway provides `/sitemap.xml` from collections that have `supports` including `seo`. The SEO Graph plugin provides the schema-map data endpoint; expose it through a public `src/pages/schemamap.xml.ts` route and register `seoGraphPlugin()` in `astro.config.mjs`.

Requirements for every routable restaurant CMS collection:

- `supports` includes `seo`
- `urlPattern` matches the rendered Astro route and contains `{slug}`
- The public detail route renders the collection entry and passes `content: { collection, id, slug }` to `createPublicPageContext`

Embedded restaurant records (reviews, Gallery images, menu rows, Advantages, and tips) need no artificial detail routes or SEO support. Keep SEO on their real parent pages and on optional Journal/Experience detail entries that actually have routes. Verify discovery does not advertise default entry URLs for non-routable records.

Production requirements:

- Set `siteUrl` or `DINEWAY_SITE_URL` when the public origin differs from the request origin.
- Validate `/robots.txt`, `/sitemap.xml`, and `/schemamap.xml`.

## Comments

Built-in comments system:

```astro
---
import { Comments, CommentForm } from "dineway/ui";
---
<Comments collection="posts" contentId={post.data.id} threaded />
<CommentForm collection="posts" contentId={post.data.id} />
```

Comments are enabled per-collection in the seed: `"commentsEnabled": true`.

## Page Contributions (Plugin Head/Body Injection)

Plugins can inject content into the `<head>` and `<body>` of pages. To support this, use the page contribution components:

```astro
---
import { DinewayHead, DinewayBodyStart, DinewayBodyEnd } from "dineway/ui";
import { createPublicPageContext } from "dineway/page";

const pageCtx = createPublicPageContext({
	Astro,
	kind: content ? "content" : "custom",
	pageType: "article",
	title: fullTitle,
	pageTitle: post.data.title,
	description,
	canonical,
	image,
	content: { collection: "posts", id: post.data.id, slug },
});
---
<html>
	<head>
		<!-- your meta tags -->
		<DinewayHead page={pageCtx} />
	</head>
	<body>
		<DinewayBodyStart page={pageCtx} />
		<!-- your content -->
		<DinewayBodyEnd page={pageCtx} />
	</body>
</html>
```

This enables plugins (analytics, tracking pixels, structured data, etc.) to contribute to any page.

## Bylines

Bylines are author profiles, independent of user accounts. They support guest authors and multi-author attribution with role labels.

### Eagerly loaded on entries

Bylines are automatically attached to every entry by the query layer:

```astro
{/* Primary author */}
{post.data.byline && (
	<span>{post.data.byline.displayName}</span>
)}

{/* All credits (includes roleLabel for co-authors, guest essays, etc.) */}
{post.data.bylines?.map(credit => (
	<span>
		{credit.byline.displayName}
		{credit.roleLabel && <em> ({credit.roleLabel})</em>}
	</span>
))}
```

- `entry.data.byline` -- primary `BylineSummary` or `null`
- `entry.data.bylines` -- array of `ContentBylineCredit` (each has `.byline`, `.roleLabel`, `.source`)

### Standalone query functions

```typescript
import { getEntryBylines, getByline, getBylineBySlug, getBylinesForEntries } from "dineway";

// Bylines for a single entry
const credits = await getEntryBylines("posts", post.data.id);

// Batch-fetch for a list page (avoids N+1)
const ids = entries.map((e) => e.data.id);
const bylinesMap = await getBylinesForEntries("posts", ids);
// bylinesMap.get(entryId) => ContentBylineCredit[]

// Look up a specific byline
const byline = await getBylineBySlug("jane-doe");
```

### BylineSummary shape

```typescript
interface BylineSummary {
	id: string;
	slug: string;
	displayName: string;
	bio: string | null;
	avatarMediaId: string | null;
	websiteUrl: string | null;
	isGuest: boolean;
}
```

### ContentBylineCredit shape

```typescript
interface ContentBylineCredit {
	byline: BylineSummary;
	sortOrder: number;
	roleLabel: string | null; // e.g., "Guest essay", "Photographer"
	source?: "explicit" | "inferred"; // "inferred" = fallback from author_id
}
```

## Dark Mode Pattern

Cookie-based theme switching (no flash on load):

```html
<!-- In <head>, before styles load -->
<script is:inline>
	(function () {
		var c = document.cookie;
		var i = c.indexOf("theme=");
		var theme = i >= 0 ? c.slice(i + 6).split(";")[0] : null;
		if (theme === "dark" || theme === "light") {
			document.documentElement.classList.add(theme);
		} else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
			document.documentElement.classList.add("dark");
		}
	})();
</script>
```

Then use CSS variables that change based on `.dark` class:

```css
:root {
	--color-bg: #ffffff;
	--color-text: #1a1a1a;
}
:root.dark {
	--color-bg: #0d0d0d;
	--color-text: #ededed;
}
```

## Layout Pattern

A typical base layout:

```astro
---
import { getMenu, getDinewayCollection } from "dineway";
import { WidgetArea, DinewayHead, DinewayBodyStart, DinewayBodyEnd } from "dineway/ui";
import { createPublicPageContext } from "dineway/page";
import LiveSearch from "dineway/ui/search";

interface Props {
	title: string;
	description?: string | null;
	image?: string | null;
	content?: { collection: string; id: string; slug?: string | null };
}

const { title, pageTitle, description, image, content } = Astro.props;
const menu = await getMenu("primary");

const pageCtx = createPublicPageContext({
	Astro,
	kind: content ? "content" : "custom",
	pageType: "website",
	title,
	pageTitle: pageTitle ?? title,
	description,
	image,
	content,
});
---
<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>{title}</title>
		{description && <meta name="description" content={description} />}
		<DinewayHead page={pageCtx} />
	</head>
	<body>
		<DinewayBodyStart page={pageCtx} />
		<header>
			<nav>
				<a href="/">My Site</a>
				<LiveSearch placeholder="Search..." collections={["posts", "pages"]} />
				{menu?.items.map(item => (
					<a href={item.url}>{item.label}</a>
				))}
			</nav>
		</header>
		<main>
			<slot />
		</main>
		<footer>
			<WidgetArea name="footer" />
		</footer>
		<DinewayBodyEnd page={pageCtx} />
	</body>
</html>
```
