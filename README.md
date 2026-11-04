# Duffel

A calm, simple packing list for families. Plan what everyone needs, pack it into the right bags, and tick things off together from your phones.

Duffel runs on your own Cloudflare account (the free plan is plenty). One deployment is one household, protected by a single shared password.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/tyler-class/Duffel)

> Duffel is under active development. Full setup docs are coming soon.

## Local development

```sh
npm install
cp .dev.vars.example .dev.vars   # then set APP_PASSWORD
npm run db:migrate:local
npm run dev
```

## License

MIT
