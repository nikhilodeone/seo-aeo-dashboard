# SEO and AEO dashboard

Enter a website address and get a dashboard built from that site: the keywords it is built around, how competitors compare, the gaps worth closing first, how ready it is to be quoted by AI answer engines (AEO), content briefs, and a 12-week plan.

## How it works

1. You enter your URL (and, optionally, competitor domains).
2. The server reads your home page, `robots.txt`, `llms.txt`, the sitemap and a sample of pages (default 12). It does the same for each competitor (8 pages each).
3. The analysis runs in your browser from that raw data: keyword strength per site, gaps against competitors, a site-health audit, an AEO checklist, scored opportunities, briefs and a schedule.
4. Results are saved in your browser (`localStorage`, last 4 runs per site) so you can see progress when you re-run.

Nothing is stored on a server. There is no database.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

Type a site address on the first screen. It works with no keys at all (crawl-only mode).

## Finding competitors

Automatic discovery works from what your site sells: it picks a few broad head terms from your headings and titles (for example "designer", "dress"), searches them with your country ("designer online india"), and counts which sites keep appearing. After reading those sites it drops any whose pages do not cover the same topics as yours. This uses up to 6 extra Serper searches per run. Brand-name searches such as "brands like X" were tested and return nothing useful, so they are not used.

The most reliable way is to type 1 to 5 competitor domains on the setup screen. If you leave them blank, the app tries, in order: Google results (needs `SERPER_API_KEY`), a free web search (no key, may be blocked), then AI suggestions (needs `ANTHROPIC_API_KEY`). With none of those working you are told, and asked to enter competitors.

## Optional connections

Copy `.env.example` to `.env.local` and fill in what you want.

| Variable | What it unlocks |
| --- | --- |
| `SERPER_API_KEY` | Real Google rankings for your keywords, People Also Ask questions, and automatic competitor discovery (serper.dev). `SERPER_NUM` sets results per query (default 20). |
| `ANTHROPIC_API_KEY` | AI competitor suggestions, AI question ideas and "Draft with AI" content briefs. `ANTHROPIC_MODEL` overrides the model (default `claude-sonnet-5-5`). |
| `KEYLESS_SEARCH` | On by default. Without a Serper key the app tries a free web search to suggest competitors. It is best effort (it can be blocked from cloud servers) and never supplies rankings. Set to `false` to turn it off. |
| `DASHBOARD_PASSCODE` | Protects the server routes that use your keys. Set it on any public deployment. Visitors enter it once per browser session. |
| `CRAWLER_USER_AGENT` | Override the crawler's user agent. |
| `CRAWL_IGNORE_ROBOTS` | `true` to ignore robots.txt. Only use on sites you own. |
| `ALLOW_PRIVATE_HOSTS` | `true` to allow localhost and private IPs. Development only. |

Also upload your Google Search Console **Queries.csv** (Data and settings tab) to replace estimates with your real impressions, clicks and positions.

## Deploy to GitHub and Vercel

```bash
git init
git add .
git commit -m "SEO and AEO dashboard"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Then in Vercel: **Add New, Project**, import the repo (framework is detected as Next.js), open **Settings, Environment Variables**, add the variables you want (at least `DASHBOARD_PASSCODE` if you add API keys), and deploy.

The crawl routes use up to 60 seconds (`maxDuration = 60`). That is the limit on Vercel's Hobby plan; it is plenty for the default page counts, and large sites should keep "pages to read" modest.

## What the labels mean

- **Measured**: from Search Console or live Google results.
- **Crawled**: read from the pages themselves.
- **Estimated**: modelled (for example click gains from a generic click-through curve).

## Limits

- No search volume or keyword difficulty. Those need a paid keyword database, so they are not shown or guessed.
- Only a sample of pages per site is read. Content rendered only by JavaScript is read as a non-JS crawler sees it.
- Phrase extraction is tuned for English.
- "Answer-engine readiness" measures how easy pages are to read and quote. It does not measure real citations; the Answer engines tab gives you test questions to check by hand.
- Saved analyses live in one browser. Use Export and Import to move them.
- With only one or two competitors, "covered by competitors" signals are weak; three or more is better.

## Security notes

The crawler refuses private and internal addresses (including after redirects and DNS resolution), caps response size and time, and respects robots.txt. AI prompts treat crawled text as untrusted data.

## Development

```bash
npm run typecheck
npm test                 # engine tests against local fixture sites
npm run build && E2E=1 npm test   # also runs the end-to-end test against a built server
```
