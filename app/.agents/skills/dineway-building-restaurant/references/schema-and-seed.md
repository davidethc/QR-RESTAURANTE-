# Dineway Schema and Seed Files

The seed file (`seed/seed.json`) defines the site's entire schema and initial restaurant content. It's applied on first run or via `npx dineway seed seed/seed.json`.

Use this reference for mechanics and [restaurant-model.md](restaurant-model.md) for content ownership. Seed genuine published content for the required `menu`, `reviews`, and `gallery` collections, plus auxiliary types actually selected in `Site Architecture`. Schema-only or static-only replacements are incomplete. Do not force Blog/News or create empty optional collections.

The primary navigation menu links to `/menu`, `/reviews`, `/gallery`, and `/visit`, with optional routes only when enabled. Homepage anchors may supplement these links but cannot replace them.

Use reusable records for Advantages, special touches, experiences, and visit tips. Public data contains editorial copy, real attributions, media and content references; the private planning index holds evidence audit metadata. For an evidence-limited menu, a supported CMS menu introduction is preferable to invented dishes. A lack of real reviews or usable photos remains a content blocker, not permission to seed fake entries.

## Seed File Structure

```json
{
	"$schema": "https://dineway.foodism.ai/seed.schema.json",
	"version": "1",
	"meta": {
		"name": "My Site",
		"description": "A description of this site",
		"author": "Author Name"
	},
	"settings": { ... },
	"collections": [ ... ],
	"taxonomies": [ ... ],
	"menus": [ ... ],
	"widgetAreas": [ ... ],
	"sections": [ ... ],
	"bylines": [ ... ],
	"content": { ... }
}
```

## Collections

Collections define content types. Each collection becomes a database table (`ec_{slug}`).

```json
{
	"slug": "posts",
	"label": "Posts",
	"labelSingular": "Post",
	"urlPattern": "/posts/{slug}",
	"supports": ["drafts", "revisions", "search", "seo"],
	"commentsEnabled": true,
	"fields": [ ... ]
}
```

Every routable restaurant collection must include:

- `supports` with `seo`, so `/sitemap.xml` includes published entries and editors can manage SEO fields.
- `urlPattern` with `{slug}`, matching a real public detail route, such as `/journal/{slug}`. Do not advertise routes that the site does not implement.

Embedded collections can omit `urlPattern` and SEO support. A review, photo, menu row, or tip does not need a standalone detail page merely because it is CMS-managed. The independent parent pages still require page-level SEO and discovery. Do not call entry URL helpers or emit sitemap links for records that have no public detail route.

### Collection Supports

| Support     | Description               |
| ----------- | ------------------------- |
| `drafts`    | Draft/published workflow  |
| `revisions` | Revision history          |
| `search`    | Full-text search indexing |
| `seo`       | SEO meta fields in admin  |

### Slug Rules

- Lowercase alphanumeric + underscores: `/^[a-z][a-z0-9_]*$/`
- Max 63 characters
- Cannot conflict with reserved slugs

## Field Types

| Type           | Column type | Runtime shape                         | Notes                        |
| -------------- | ----------- | ------------------------------------- | ---------------------------- |
| `string`       | TEXT        | `string`                              | Single line text             |
| `text`         | TEXT        | `string`                              | Multi-line text (textarea)   |
| `number`       | REAL        | `number`                              | Floating point               |
| `integer`      | INTEGER     | `number`                              | Whole numbers                |
| `boolean`      | INTEGER     | `boolean`                             | Stored as 0/1                |
| `datetime`     | TEXT        | `Date`                                | ISO 8601 string in DB        |
| `image`        | TEXT        | `{ id, src?, alt?, width?, height? }` | **Object, not a string**     |
| `reference`    | TEXT        | `string` (ID)                         | Reference to another entry   |
| `portableText` | JSON        | `PortableTextBlock[]`                 | Rich text as structured JSON |
| `json`         | JSON        | `any`                                 | Arbitrary JSON data          |

### Field Definition

```json
{
	"slug": "title",
	"label": "Title",
	"type": "string",
	"required": true,
	"searchable": true
}
```

Fields can have:

- `slug` (required) -- field identifier
- `label` (required) -- display label in admin
- `type` (required) -- one of the types above
- `required` -- validation
- `searchable` -- include in full-text search index

### Common Field Patterns

**Optional Journal entry:**

```json
"urlPattern": "/journal/{slug}",
"supports": ["drafts", "revisions", "search", "seo"],
"fields": [
	{ "slug": "title", "label": "Title", "type": "string", "required": true, "searchable": true },
	{ "slug": "featured_image", "label": "Featured Image", "type": "image" },
	{ "slug": "content", "label": "Content", "type": "portableText", "searchable": true },
	{ "slug": "excerpt", "label": "Excerpt", "type": "text" }
]
```

**Reusable Advantage or special touch (embedded `highlights` collection):**

```json
"supports": ["drafts", "revisions"],
"fields": [
	{ "slug": "title", "label": "Title", "type": "string", "required": true },
	{ "slug": "kind", "label": "Kind", "type": "string", "required": true },
	{ "slug": "description", "label": "Description", "type": "text" },
	{ "slug": "supporting_review", "label": "Supporting review", "type": "reference", "options": { "collection": "reviews" } },
	{ "slug": "image", "label": "Image", "type": "image" }
]
```

Use `kind` values `advantage` or `special_touch` in this model. Before publishing an Advantage, require a genuine supporting review and ensure the copy does not overstate it. A special touch also needs evidence in the private index but does not require a fabricated testimonial. Extend with additional real relationships only where the selected design needs them. Use existing seed reference syntax below; do not copy independent review records into each page's content.

**Page (minimal):**

```json
"fields": [
	{ "slug": "title", "label": "Title", "type": "string", "required": true, "searchable": true },
	{ "slug": "content", "label": "Content", "type": "portableText", "searchable": true }
]
```

## Taxonomies

Taxonomies are tag/category systems attached to collections.

```json
{
	"name": "category",
	"label": "Categories",
	"labelSingular": "Category",
	"hierarchical": true,
	"collections": ["posts"],
	"terms": [
		{ "slug": "development", "label": "Development" },
		{ "slug": "design", "label": "Design" }
	]
}
```

- `hierarchical: true` -- tree structure (like WordPress categories)
- `hierarchical: false` -- flat list (like WordPress tags)
- `collections` -- which collections this taxonomy applies to
- `terms` -- pre-defined terms to create

## Menus

Navigation menus, managed from the admin UI.

```json
{
	"name": "primary",
	"label": "Primary Navigation",
	"items": [
		{ "type": "custom", "label": "Home", "url": "/" },
		{ "type": "custom", "label": "About", "url": "/pages/about" },
		{ "type": "custom", "label": "Posts", "url": "/posts" }
	]
}
```

Menu item types:

- `custom` -- arbitrary URL
- Content references are resolved at render time

## Widget Areas

Named regions where editors can add configurable widgets.

```json
{
	"name": "sidebar",
	"label": "Sidebar",
	"description": "Widget area displayed on single post pages",
	"widgets": [
		{
			"type": "component",
			"componentId": "core:search",
			"title": "Search"
		},
		{
			"type": "component",
			"componentId": "core:categories",
			"title": "Categories"
		},
		{
			"type": "component",
			"componentId": "core:tags",
			"title": "Tags"
		},
		{
			"type": "component",
			"componentId": "core:recent-posts",
			"title": "Recent Posts",
			"settings": { "count": 5, "showDate": true }
		},
		{
			"type": "component",
			"componentId": "core:archives",
			"title": "Archives",
			"settings": { "type": "monthly", "limit": 6 }
		},
		{
			"type": "content",
			"title": "About",
			"content": [
				{
					"_type": "block",
					"style": "normal",
					"children": [{ "_type": "span", "text": "Some rich text content." }]
				}
			]
		}
	]
}
```

### Widget types

| Type        | Description               | Key fields                |
| ----------- | ------------------------- | ------------------------- |
| `content`   | Rich text (Portable Text) | `content`                 |
| `menu`      | Navigation menu           | `menuName`                |
| `component` | Core or custom component  | `componentId`, `settings` |

### Core widget components

- `core:search` -- search form
- `core:categories` -- category list with counts
- `core:tags` -- tag cloud
- `core:recent-posts` -- latest posts list
- `core:archives` -- monthly archive links

## Sections (Reusable Blocks)

Reusable content blocks that editors can insert via `/section` slash command in the editor.

```json
{
	"slug": "newsletter-signup",
	"title": "Newsletter Signup",
	"description": "A call-to-action block for newsletter subscriptions",
	"keywords": ["newsletter", "subscribe", "email", "cta"],
	"source": "theme",
	"content": [
		{
			"_type": "block",
			"style": "h3",
			"children": [{ "_type": "span", "text": "Stay in the loop" }]
		},
		{
			"_type": "block",
			"style": "normal",
			"children": [{ "_type": "span", "text": "Get notified when new posts are published." }]
		}
	]
}
```

## Bylines

Named author profiles, independent of user accounts.

```json
{
	"id": "byline-editorial",
	"slug": "dineway-editorial",
	"displayName": "Dineway Editorial"
}
```

Guest bylines:

```json
{
	"id": "byline-guest",
	"slug": "guest-contributor",
	"displayName": "Guest Contributor",
	"isGuest": true
}
```

## Settings

Site-wide settings:

```json
"settings": {
	"title": "My Blog",
	"tagline": "Thoughts on building for the web"
}
```

Available keys: `title`, `tagline`, `logo`, `favicon`, `social`, `timezone`, `dateFormat`.

## Content

Sample content organized by collection slug:

```json
"content": {
	"posts": [
		{
			"id": "post-1",
			"slug": "hello-world",
			"status": "published",
			"data": {
				"title": "Hello World",
				"excerpt": "My first post.",
				"featured_image": {
					"$media": {
						"url": "https://images.unsplash.com/photo-xxx?w=1200&h=800&fit=crop",
						"alt": "Description of image",
						"filename": "hello-world.jpg"
					}
				},
				"content": [
					{
						"_type": "block",
						"style": "normal",
						"children": [{ "_type": "span", "text": "This is the body text." }]
					}
				]
			},
			"bylines": [
				{ "byline": "byline-editorial" }
			],
			"taxonomies": {
				"category": ["development"],
				"tag": ["webdev", "opinion"]
			}
		}
	],
	"pages": [
		{
			"id": "about",
			"slug": "about",
			"status": "published",
			"data": {
				"title": "About",
				"content": [
					{
						"_type": "block",
						"style": "normal",
						"children": [{ "_type": "span", "text": "About this site." }]
					}
				]
			}
		}
	]
}
```

### Media references in seed content

Use `$media` for image fields -- Dineway downloads and stores the image:

```json
"featured_image": {
	"$media": {
		"url": "https://images.unsplash.com/photo-xxx?w=1200&h=800&fit=crop",
		"alt": "Description",
		"filename": "my-image.jpg"
	}
}
```

For external images without downloading:

```json
"featured_image": "https://images.unsplash.com/photo-xxx?w=1200"
```

### Reference fields in seed content

Use `$ref:id` format to reference other entries:

```json
"author": "$ref:byline-editorial"
```

### Portable Text in seed content

Content fields of type `portableText` are arrays of blocks:

```json
[
	{
		"_type": "block",
		"style": "normal",
		"children": [{ "_type": "span", "text": "A paragraph." }]
	},
	{
		"_type": "block",
		"style": "h2",
		"children": [{ "_type": "span", "text": "A heading" }]
	},
	{
		"_type": "block",
		"style": "blockquote",
		"children": [{ "_type": "span", "text": "A quote." }]
	}
]
```

Inline marks (bold, italic, links):

```json
{
	"_type": "block",
	"style": "normal",
	"children": [
		{ "_type": "span", "text": "This is " },
		{ "_type": "span", "text": "bold", "marks": ["strong"] },
		{ "_type": "span", "text": " and " },
		{ "_type": "span", "text": "italic", "marks": ["em"] }
	]
}
```

Block styles: `normal`, `h1`-`h6`, `blockquote`.

### Draft content

Set `"status": "draft"` to create unpublished content:

```json
{
	"id": "post-draft",
	"slug": "work-in-progress",
	"status": "draft",
	"data": { ... }
}
```

## Validation

```bash
npx dineway seed seed/seed.json --validate
```

Catches:

- Image fields with raw URLs (should use `$media`)
- Reference fields with raw IDs (should use `$ref:id`)
- PortableText not an array or missing `_type`
- Type mismatches (string vs number, etc.)

For restaurant sites, verify the required collections and every selected auxiliary collection have genuine published content and are queried by their intended pages. With the default names on local SQLite:

```bash
sqlite3 .dineway/data.db "
select 'menu', count(*) from ec_menu where status = 'published'
union all select 'reviews', count(*) from ec_reviews where status = 'published'
union all select 'gallery', count(*) from ec_gallery where status = 'published';
"
```

Every required count must be greater than zero. Also inspect the actual rows and rendered output: a nonzero count alone does not prove authenticity or correct integration. Validate supporting-review references, disjoint popular/other-favorites food selections, special-touch content, uploaded images, and applicable credits. Check `highlights`, `experiences`, `visit_tips`, and `journal` when the architecture selects them; unused types need not exist.

Validate `/`, `/menu`, `/reviews`, `/gallery`, `/visit`, and every actual optional/detail route in the architecture. Embedded records need no artificial detail route; routable records must resolve and have matching SEO/discovery configuration. Test later review/gallery batches, not just the first query result. Modify and restore a shared record in a local test site to verify that its consumers stay consistent.

## Applying Seeds

```bash
npx dineway seed seed/seed.json              # Apply with content
npx dineway seed seed/seed.json --no-content  # Schema only (no sample content)
```

## Exporting Seeds

```bash
npx dineway export-seed                      # Schema only
npx dineway export-seed --with-content       # Schema + all content
npx dineway export-seed --with-content=posts,pages  # Specific collections
```
