// Worker entry. OAuthProvider sits in front so AI assistants can connect over MCP:
//   /mcp            → MCP server (needs an OAuth token)
//   /authorize      → consent page (approve with the household password)
//   /oauth/*, /.well-known/* → handled by the provider
//   /api/*          → the app's REST API (cookie session)
import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import { app } from './app';
import { handleAuthorize } from './consent';
import { mcpApiHandler } from './mcp';

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

export default {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    return providerFor(new URL(request.url).origin).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Cloudflare.Env>;
