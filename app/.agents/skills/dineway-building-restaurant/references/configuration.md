# Dineway Configuration

Use this for the Dineway configuration mechanics needed by `dineway-building-restaurant`. Do not load or inspect Dineway demos or templates while applying it.

## astro.config.mjs

### Node.js (local development / self-hosted)

```javascript
import node from "@astrojs/node";
import react from "@astrojs/react";
import { seoGraphPlugin } from "@dineway-ai/plugin-seo-graph";
import { defineConfig } from "astro/config";
import dineway, { local, s3 } from "dineway/astro";
import { libsql } from "dineway/db";

const databaseUrl = process.env.DINEWAY_DATABASE_URL || "file:./data.db";
const databaseAuthToken = process.env.DINEWAY_DATABASE_AUTH_TOKEN;
const storage = local({
	directory: "./uploads",
	baseUrl: "/_dineway/api/media/file",
});

export default defineConfig({
	output: "server",
	adapter: node({ mode: "standalone" }),
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		dineway({
			database: libsql({ url: databaseUrl, authToken: databaseAuthToken }),
			storage,
			plugins: [seoGraphPlugin()],
		}),
	],
	devToolbar: { enabled: false },
});
```

### Reverse proxy

When behind a TLS-terminating reverse proxy, `Astro.url` returns the internal address (e.g. `http://localhost:4321`) instead of the public one (`https://mysite.example.com`). This breaks passkeys, CSRF, OAuth, redirects, and more.

**Step 1:** Declare allowed public hosts via [`security.allowedDomains`](https://docs.astro.build/en/reference/configuration-reference/#securityalloweddomains) so Astro reconstructs the URL from `X-Forwarded-*` headers. In dev, add matching **`vite.server.allowedHosts`** or Vite rejects the proxy `Host`.

**Step 2:** If the reconstructed URL still disagrees with the browser (common with TLS termination), set **`siteUrl`**:

```javascript
dineway({
	siteUrl: "https://mysite.example.com",
	// ...
});
```

Or via environment variable (useful for container deployments):

```bash
DINEWAY_SITE_URL=https://mysite.example.com
# or: SITE_URL=https://mysite.example.com
```

`siteUrl` replaces `passkeyPublicOrigin` (which only fixed passkeys). It applies to passkeys, CSRF origin matching, OAuth redirects, login redirects, MCP discovery, snapshot exports, sitemap, robots.txt, schemamap, and JSON-LD structured data. Production restaurant builds must set `siteUrl` or `DINEWAY_SITE_URL` whenever the request origin is not the public browser-facing origin.

With TLS terminated in front, **`astro dev --host 127.0.0.1`** (loopback) is usually enough: the proxy reaches the dev server locally while **`siteUrl`** matches the browser’s HTTPS origin -- without opening the Node port on the LAN.

### Forgeway deploy and admin bootstrap

When deploying a Dineway restaurant project to Forgeway:

```bash
npx dineway deploy forgeway
```

- Use the prompt label and language **Dineway account email**.
- A project can start from a shadow user, but Forgeway does not allow shadow users to deploy. The CLI reuses cached verified formal Dineway account credentials when available, or upgrades the shadow grant through email verification when needed.
- The Dineway account email becomes the initial deployed-site admin email.
- After a successful deploy, the CLI writes `DINEWAY_SITE_URL` and `DINEWAY_TOKEN` to project `.env`, adds `.env` to `.gitignore`, and avoids printing the raw admin API token.
- Follow-up remote CLI commands should work from the project directory, for example `npx dineway whoami` and `npx dineway content list posts`.
- First browser admin access should use the printed setup link, then register a passkey. Normal passkey login requires at least one registered passkey.
- Magic link login requires a site email provider. Forgeway admin bootstrap does not require one.
- If the setup link expires or is exposed, regenerate it with `npx dineway auth setup-link` from the project directory.

### Plugins

Register plugins in `astro.config.mjs`:

```javascript
import { auditLogPlugin } from "@dineway-ai/plugin-audit-log";
import { seoGraphPlugin } from "@dineway-ai/plugin-seo-graph";

dineway({
	database: sqlite({ url: "file:./data.db" }),
	storage: local({ directory: "./uploads", baseUrl: "/_dineway/api/media/file" }),
	plugins: [seoGraphPlugin(), auditLogPlugin()],
}),
```

`seoGraphPlugin()` is required for the schema-map API. Add a public Astro route at `src/pages/schemamap.xml.ts` that proxies `POST /_dineway/api/plugins/seo-graph/schema/map`, then validate `/schemamap.xml` alongside `/robots.txt` and `/sitemap.xml`.

## live.config.ts

Every Dineway site needs this file at `src/live.config.ts`. It's boilerplate -- the same in every project:

```typescript
import { defineLiveCollection } from "astro:content";
import { dinewayLoader } from "dineway/runtime";

export const collections = {
	_dineway: defineLiveCollection({ loader: dinewayLoader() }),
};
```

This registers Dineway's live content collections with Astro. All content types are served through the single `_dineway` collection -- you query specific types using `getDinewayCollection("posts")` etc.

## dineway-env.d.ts

Auto-generated at the project root when the dev server starts. Provides TypeScript types for your collections. This is the file your `tsconfig.json` includes.

```typescript
/// <reference types="dineway/locals" />

import type { PortableTextBlock } from "dineway";

export interface Post {
	id: string;
	slug: string | null;
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
	excerpt?: string;
	createdAt: Date;
	updatedAt: Date;
	publishedAt: Date | null;
}

declare module "dineway" {
	interface DinewayCollections {
		posts: Post;
	}
}
```

The dev server regenerates this file automatically when schema changes. You can also generate it manually:

## Type Generation

```bash
# From local dev server (writes dineway-env.d.ts at project root)
npx dineway types

# From remote instance
npx dineway types --url https://my-site.example.com

# Custom output path
npx dineway types --output src/types/cms.ts
```

The CLI also writes `.dineway/schema.json` with the raw schema for tooling.

## package.json

Key dependencies for a standalone Node.js site:

```json
{
	"dependencies": {
		"@astrojs/node": "^10.1.0",
		"@astrojs/react": "^5.0.0",
		"astro": "^6.3.0",
		"dineway": "^0.2.24",
		"react": "^18.0.0",
		"react-dom": "^18.0.0"
	}
}
```

## Dev Server

```bash
npx dineway dev              # Start dev server (runs migrations, applies seed)
npx dineway dev --types      # Start and generate types from schema
```

The admin UI is at `http://localhost:4321/_dineway/admin`. On first run, you'll go through setup to create an admin account.
