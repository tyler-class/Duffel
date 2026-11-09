// Worker entry. OAuthProvider sits in front so AI assistants can connect over MCP:
//   /mcp            → MCP server (needs an OAuth token)
//   /authorize      → consent page (approve with the household password)
//   /oauth/*, /.well-known/* → handled by the provider
//   /api/*          → the app's REST API (cookie session)
import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import { app } from './app';
import { handleAuthorize } from './consent';
import { mcpApiHandler } from './mcp';
import { checkIn } from './kit/telemetry';
import { version } from '../../package.json';

/** Tables whose row counts are sent in the anonymous daily check-in (counts only). */
export const USAGE_TABLES = [
  'people',
  'items',
  'suitcases',
  'templates',
  'template_items',
  'template_todos',
  'trips',
  'trip_items',
  'trip_bags',
  'trip_todos',
  'itinerary_sections',
  'itinerary_entries',
];

const defaultHandler = {
  fetch(
    request: Request,
    env: Cloudflare.Env,
    ctx: ExecutionContext,
  ): Response | Promise<Response> {
    if (new URL(request.url).pathname === '/authorize') return handleAuthorize(request, env);
    return app.fetch(request, env, ctx);
  },
};

// The public URL isn't known until deploy, so build one provider per origin the Worker is reached on.
const providers = new Map<string, OAuthProvider<Cloudflare.Env>>();
function providerFor(origin: string) {
  let p = providers.get(origin);
  if (!p) {
    p = new OAuthProvider<Cloudflare.Env>({
      apiRoute: '/mcp',
      apiHandler: mcpApiHandler,
      defaultHandler,
      authorizeEndpoint: '/authorize',
      tokenEndpoint: '/oauth/token',
      clientRegistrationEndpoint: '/oauth/register',
      scopesSupported: ['packing'],
      requiredScopes: ['packing'],
      resourceMetadata: { resource: `${origin}/mcp`, authorization_servers: [origin] },
      clientIdMetadataDocumentEnabled: true,
    });
    providers.set(origin, p);
  }
  return p;
}

/** OAuth needs HTTPS (or localhost). Plain http elsewhere only happens in local dev on a LAN. */
function oauthCapable(url: URL): boolean {
  return url.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

export default {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (!oauthCapable(url)) {
      // e.g. testing from a phone at http://192.168.x.x:5199: the app works, assistant connections don't.
      if (
        url.pathname.startsWith('/mcp') ||
        url.pathname.startsWith('/oauth/') ||
        url.pathname.startsWith('/.well-known/')
      ) {
        return Response.json(
          { error: 'https_required', message: 'Connecting assistants needs HTTPS.' },
          { status: 503 },
        );
      }
      return defaultHandler.fetch(request, env, ctx);
    }
    return providerFor(url.origin).fetch(request, env, ctx);
  },
  // Hourly; the check-in itself goes out at most once a day, and not at all if it's turned off.
  scheduled(_controller: ScheduledController, env: Cloudflare.Env, ctx: ExecutionContext) {
    ctx.waitUntil(checkIn(env.DB, { app: 'duffel', version, tables: USAGE_TABLES }));
  },
} satisfies ExportedHandler<Cloudflare.Env>;
