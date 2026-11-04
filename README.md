# Duffel

A calm, simple packing list for families. Plan what everyone needs, pack it into the right bags, and tick things off together from your phones.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/tyler-class/Duffel)

- **Per-person lists.** Every item belongs to someone (or is shared), with quantities that scale with trip length: “1 T-shirt per day, at most 7”.
- **Bags.** Put things in specific bags. Carry-on is a property of the bag, so the carry-on view is always right. Car seats and strollers go under “No bag”.
- **Templates and past trips.** Start a trip from a template, copy last year’s trip (everything starts unpacked), or save any trip as a new template.
- **Built for phones.** Install it to your home screen. The last trip you opened works offline, and check-offs sync when you’re back online.
- **Pack together.** Everyone in the household signs in with one shared password and sees changes within seconds.
- **AI assistants.** Connect Claude, ChatGPT or any MCP-capable assistant and ask it to build or update your lists.
- **Yours.** It runs on your own Cloudflare account. The free plan is plenty. Your data stays in your database.

One deployment is one household.

## Deploy

### One click

1. Click **Deploy to Cloudflare** above and sign in to Cloudflare (a free account works).
2. Cloudflare copies this repo to your GitHub or GitLab account, creates the database and storage, and asks for **APP_PASSWORD**. That’s the password everyone in your household will use. Pick something long.
3. When the deploy finishes, open the `*.workers.dev` link. Sign in, add the people you pack for, or load the sample data to look around.

The deploy runs the database migrations for you (`npm run deploy`).

### By hand

```sh
git clone https://github.com/tyler-class/Duffel.git && cd Duffel
npm install
npx wrangler login
npx wrangler secret put APP_PASSWORD
npm run deploy
```

`npm run deploy` builds the app, deploys the Worker and applies migrations to the remote database. Wrangler creates the D1 database and KV namespace on the first deploy and writes their ids into `wrangler.jsonc`. If your Wrangler version asks you to create them yourself, run `npx wrangler d1 create duffel` and `npx wrangler kv namespace create OAUTH_KV`, then add the ids it prints.

## Use it on your phone

Open your Duffel link on the phone, then:

- **iPhone:** in Safari, tap Share, then **Add to Home Screen**.
- **Android:** in Chrome, open the menu and tap **Install app**.

It opens full screen like a regular app.

## Connect an AI assistant

Duffel includes an [MCP](https://modelcontextprotocol.io) server at `https://<your-duffel>/mcp`. In Duffel, open **More → Connect an AI assistant** to copy your URL and see steps for Claude, ChatGPT, Claude Code and others. When an assistant connects, Duffel shows a sign-in page; enter your household password to approve it. **More → Connect an AI assistant → Disconnect all** revokes every connected assistant.

## Change the password

Set a new `APP_PASSWORD`, either in the Cloudflare dashboard under **Workers & Pages → duffel → Settings → Variables and Secrets**, or with:

```sh
npx wrangler secret put APP_PASSWORD
```

Everyone is signed out and signs in again with the new password. Connected AI assistants keep working until you disconnect them.

## Back up and restore

**More → Settings → Download backup** saves everything as one JSON file. **Restore from backup** replaces everything with a backup’s contents. Use it to move to a new deployment, too.

## Update your copy

If you deployed with the button, your copy lives in your own GitHub account. To get new versions, open it on GitHub and click **Sync fork** (or merge from `tyler-class/Duffel`). Cloudflare redeploys automatically and runs any new migrations.

## Local development

```sh
npm install
cp .dev.vars.example .dev.vars    # then set APP_PASSWORD
npm run db:migrate:local
npm run db:seed:sample:local      # optional: a sample household
npm run dev
```

| Script                       | What it does                                       |
| ---------------------------- | -------------------------------------------------- |
| `npm run dev`                | Vite dev server with the Worker running in workerd |
| `npm run build` / `preview`  | Production build / serve the build locally         |
| `npm test`                   | Unit tests and Workers-runtime API tests (Vitest)  |
| `npm run typecheck` / `lint` | TypeScript, ESLint and Prettier                    |
| `npm run deploy`             | Build, deploy, migrate the remote database         |
| `npm run db:migrate:local`   | Apply migrations to the local database             |
| `npm run db:migrate:remote`  | Apply migrations to the deployed database          |

### How it’s built

- **Cloudflare Workers** with static assets. **Hono** serves the API under `/api`, and **D1** (SQLite) stores everything. SQL migrations live in `migrations/`.
- **React**, **TypeScript**, **Vite**, **Tailwind CSS**, **TanStack Query** and **React Router**, with a service worker from `vite-plugin-pwa`.
- `src/shared` holds the packing logic (quantities, building trips from templates, copying trips, bag fit), used by both the Worker and the app and covered by unit tests.
- Sign-in uses one password per instance: a signed, HttpOnly session cookie, rate-limited attempts, and sessions that end when the password changes.
- AI assistants connect over MCP with OAuth 2.1 (`@cloudflare/workers-oauth-provider`). Tokens are stored in KV.

See [docs/](docs) for importing from Airtable and other notes.

## Support

Duffel is free and built by [Tyler Class](https://tylerclass.net). If you want to say thank you, coffee is my love language: [ko-fi.com/tylerclass](https://ko-fi.com/tylerclass) ☕

## License

[MIT](LICENSE)
