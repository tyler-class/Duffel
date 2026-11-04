// Secrets aren't in wrangler.jsonc, so `wrangler types` can't see them.
declare namespace Cloudflare {
  interface Env {
    /** The household password. Set with `wrangler secret put APP_PASSWORD`. */
    APP_PASSWORD?: string;
  }
}
