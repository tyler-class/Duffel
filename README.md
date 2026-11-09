# Duffel

A calm, simple packing list for families. Plan what everyone needs, pack it into the right bags, and tick things off together from your phones.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/tyler-class/Duffel)

- **Per-person lists.** Every item belongs to someone (or is shared), with quantities that scale with trip length: “1 T-shirt per day, at most 7”. Set a custom number any time and it stays put.
- **Bags.** Bags belong to people (or are shared), and items land in the right one automatically. Carry-on is a property of the bag, so the carry-on view is always right. **Auto pack** sends an item to a type of bag: diapers into its person’s diaper bag, snacks into the cooler. Car seats and strollers go under “No bag”.
- **Groups.** Items sit under groups like Clothing, Documents or Food & drink, on every person and bag. Drag items and whole groups into the order you pack them (long-press on a phone).
- **To-dos.** Things to do before, during and after a trip, like booking the pet sitter. Give one a fixed date, or a relative one such as “3 days before the trip starts” that moves when the trip’s dates do. The trip’s bar tracks packing and pre-trip to-dos together, and once you’re away the trip opens on its to-dos.
- **Itinerary.** Each trip’s plan in order: travel sections (“Getting there”, “Lisbon → Porto”) and stays. Add flights, trains, buses, boats and drives with their departure and arrival, plus lodging, reservations and notes with booking numbers. Times are local, as on the ticket; type an airport code and the city and time zone fill in, and flight times and layovers are worked out across time zones. New entries go where their time falls; drag entries and sections to rearrange them, and connecting flights always stay back to back. Itineraries stay with their trip and aren’t copied.
- **Templates and past trips.** Start a trip from a template, copy last year’s trip (everything starts unpacked and undone), or save any trip as a new template. Lists, groups, bags and to-dos come along.
- **Built for phones.** Install it to your home screen. The last trip you opened works offline, and check-offs sync when you’re back online.
- **Pack together.** Everyone in the household signs in with one shared password and sees changes within seconds.
- **AI assistants.** Connect Claude, ChatGPT or any MCP-capable assistant and ask it to build or update your lists, groups, to-dos and itineraries. Connect your email to the same assistant and it can add bookings from confirmation emails.
- **Yours.** It runs on your own Cloudflare account. The free plan is plenty. Your data stays in your database.

One deployment is one household.

## Deploy

### One click

1. Click **Deploy to Cloudflare** above and sign in to Cloudflare (a free account works).
2. Cloudflare copies this repo to your GitHub or GitLab account, creates the database and storage, and asks for **APP_PASSWORD**. That’s the password everyone in your household will use. Pick something long.
3. When the deploy finishes, open the `*.workers.dev` link. Sign in, add the people you pack for, or load the sample data to look around.

Cloudflare runs the database migrations on every deploy (`npm run deploy`), before the new version goes live.

### By hand

```sh
git clone https://github.com/tyler-class/Duffel.git && cd Duffel
npm install
npx wrangler login
npx wrangler secret put APP_PASSWORD
npm run deploy
```

`npm run deploy` builds the app, applies migrations to the remote database and deploys the Worker. Wrangler creates the D1 database and KV namespace on the first deploy and writes their ids into `wrangler.jsonc`. If your Wrangler version asks you to create them yourself, run `npx wrangler d1 create duffel` and `npx wrangler kv namespace create OAUTH_KV`, then add the ids it prints.

## Use it on your phone

Open your Duffel link on the phone, then:

- **iPhone:** in Safari, tap Share, then **Add to Home Screen**.
- **Android:** in Chrome, open the menu and tap **Install app**.

It opens full screen like a regular app.

## Connect an AI assistant

Duffel includes an [MCP](https://modelcontextprotocol.io) server at `https://<your-duffel>/mcp`. In Duffel, open **Settings → Connect an AI assistant** to copy your URL and see steps for Claude, ChatGPT, Claude Code and others. When an assistant connects, Duffel shows a sign-in page; enter your household password to approve it. **Settings → Connect an AI assistant → Disconnect all** revokes every connected assistant.

Assistants can read and change trips, packing lists, groups, templates, to-dos and itineraries. Ask one “what can you do with Duffel?” and it calls `get_started`, which looks at your trips and suggests things to ask, such as:

- “Make a packing list for our trip to \<place>, \<start date> to \<end date>, from our \<template> template.”
- “What’s still not packed for \<trip>? Group it by person.”
- “Add to-dos for \<trip>: book the pet sitter two weeks before, hold the mail, and check in online the day before we leave.”

Ready-made prompts for longer jobs appear in the assistant’s prompt menu (the + menu in Claude): **Plan a trip**, **What’s left to pack**, **Add the usual to-dos**, **Add bookings to the itinerary** and **Organize into groups**. Settings lists more examples under **Try asking**, tap one to copy it.

## Change the password

Set a new `APP_PASSWORD`, either in the Cloudflare dashboard under **Workers & Pages → duffel → Settings → Variables and Secrets**, or with:

```sh
npx wrangler secret put APP_PASSWORD
```

Everyone is signed out and signs in again with the new password. Connected AI assistants keep working until you disconnect them.

## Back up and restore

**Settings → Backup → Download backup** saves everything as one JSON file. **Restore from backup** replaces everything with a backup’s contents. Use it to move to a new deployment, too.

## Update your copy

Updates come in two steps, both in your own accounts: Duffel's latest code goes into **your GitHub copy**, and Cloudflare deploys **your copy** whenever it changes. Duffel never deploys to your Cloudflare account directly.

- **Your copy → your Cloudflare** is already on. The Deploy button set Cloudflare to build and deploy every change to your copy's `main` branch (migrating the database first).
- **Duffel → your copy** needs one click to turn on. The Deploy button doesn't copy GitHub workflow files, so open **Settings → Updates** and choose **Set up automatic updates**. GitHub opens with the update workflow filled in; click **Commit changes**. That brings in the latest Duffel straight away, then every Monday.

To update before Monday, choose **Update now** in Settings and click **Run workflow** on GitHub. Settings also shows when a newer Duffel is out.

Your household’s data is in the database, not the repo, so updates don’t touch it. An update replaces the app’s code with Duffel’s, so changes you made to your copy’s code are overwritten. Two things are kept: your `.github/workflows` (GitHub doesn’t let a workflow change them, so if Duffel’s change, copy them over by hand) and a `wrangler.jsonc` that has your database id in it.

If you deployed by hand, `git pull` and `npm run deploy`.

## Anonymous usage counts

Once a day your copy tells Duffel’s developer that it exists: a random id it made for itself, its version, how many rows each table has (trips, items, bags, …) and whether automatic updates are on. Never names, lists, notes or anything you type, and no IP address is kept. It shows how many copies are in use. Turn it off in **Settings → Updates → Share anonymous usage counts**.

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
| `npm run deploy`             | Build, migrate the remote database, deploy         |
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

Airport data comes from [OurAirports](https://ourairports.com/data/) (public domain) and [mwgg/Airports](https://github.com/mwgg/Airports) (MIT). Refresh it with `npm run airports`.
