import http from "node:http";
import type { AddressInfo } from "node:net";

type Routes = Record<string, { type?: string; body: string; status?: number }>;

export function page(opts: { title: string; desc?: string; h1: string; body: string; ld?: unknown; lang?: string }): string {
  return `<!doctype html><html lang="${opts.lang ?? "en"}"><head><meta charset="utf-8"><title>${opts.title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
${opts.desc ? `<meta name="description" content="${opts.desc}">` : ""}
${opts.ld ? `<script type="application/ld+json">${JSON.stringify(opts.ld)}</script>` : ""}
</head><body><nav><a href="/">Home</a> <a href="/about">About</a> <a href="/contact">Contact us</a></nav>
<main><h1>${opts.h1}</h1>${opts.body}</main><footer>Copyright 2026 all rights reserved</footer></body></html>`;
}

export async function serve(host: string, build: (origin: string) => Routes, listenPort = 0): Promise<{ origin: string; close: () => Promise<void> }> {
  let routes: Routes = {};
  const server = http.createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0];
    const r = routes[url];
    if (!r) {
      res.writeHead(404, { "content-type": "text/html" });
      res.end("<html><body>not found</body></html>");
      return;
    }
    res.writeHead(r.status ?? 200, { "content-type": r.type ?? "text/html; charset=utf-8" });
    res.end(r.body);
  });
  await new Promise<void>((resolve) => server.listen(listenPort, host, resolve));
  const { port } = server.address() as AddressInfo;
  const origin = port === 80 ? `http://${host}` : `http://${host}:${port}`;
  routes = build(origin);
  return { origin, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

const p = (s: string) => `<p>${s}</p>`;
const filler = (topic: string, n = 6) =>
  Array.from({ length: n }, (_, i) => p(`${topic} matters because buyers compare ${topic} options before they decide, and the details of ${topic} change with budget, terrain and riding style. Point ${i + 1} explains ${topic} in plain language for first time buyers.`)).join("");

export function ownRoutes(origin: string): Routes {
  const sitemap = `<?xml version="1.0"?><urlset>${["/", "/road-bikes", "/mountain-bikes", "/service", "/about"].map((u) => `<url><loc>${origin}${u}</loc></url>`).join("")}</urlset>`;
  return {
    "/robots.txt": { type: "text/plain", body: `User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\n\nSitemap: ${origin}/sitemap.xml` },
    "/sitemap.xml": { type: "application/xml", body: sitemap },
    "/llms.txt": { body: "<!doctype html><html><body>spa fallback</body></html>" },
    "/": { body: page({ title: "Acme Cycles | Bicycle Shop", desc: "Acme Cycles sells road bikes and mountain bikes.", h1: "Bicycles for every rider", body: filler("bicycle", 4) + `<a href="/road-bikes">Road bikes</a><a href="/mountain-bikes">Mountain bikes</a><a href="/service">Service</a>` }) },
    "/road-bikes": { body: page({ title: "Road Bikes for Beginners | Acme Cycles", desc: "Choose your first road bike.", h1: "Road bikes for beginners", body: filler("road bike") }) },
    "/mountain-bikes": { body: page({ title: "Mountain Bikes | Acme Cycles", h1: "Mountain bikes", body: filler("mountain bike") }) },
    "/service": { body: page({ title: "Bicycle Repair and Service | Acme Cycles", h1: "Bicycle repair", body: filler("bicycle repair", 5) }) },
    "/about": { body: page({ title: "About | Acme Cycles", h1: "About Acme Cycles", body: p("We started in 2012. We sell a road bike range and a mountain bike range.") }) },
  };
}

export function compRoutes(origin: string): Routes {
  const faq = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", name: "Velo World", sameAs: ["https://www.linkedin.com/company/veloworld"] },
      { "@type": "FAQPage", mainEntity: [] },
      { "@type": "Article", author: { "@type": "Person", name: "Sam" }, datePublished: "2026-03-01", dateModified: "2026-09-01" },
    ],
  };
  const answer = "An electric bike has a battery and a motor that assist your pedalling so you travel further with less effort, and most models assist up to a legal speed limit while still requiring you to pedal, which keeps you fit and keeps range high on hills.";
  return {
    "/robots.txt": { type: "text/plain", body: `User-agent: PerplexityBot\nDisallow: /\n\nUser-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml` },
    "/llms.txt": { type: "text/plain", body: "# Velo World\n> Electric bikes and fitting guides\n- /electric-bikes: buying guide" },
    "/": { body: page({ title: "Velo World | Electric Bikes and Road Bikes", desc: "Electric bikes, e-bike batteries and road bikes.", h1: "Electric bikes and road bikes", ld: faq, body: filler("electric bike", 3) + `<a href="/electric-bikes">Electric bikes</a><a href="/e-bike-battery-life">Battery</a><a href="/bike-fitting">Fitting</a><a href="/road-bikes">Road</a>` }) },
    "/electric-bikes": { body: page({ title: "Electric Bikes: A Complete Buying Guide | Velo World", desc: "How electric bikes work and how to choose one.", h1: "Electric bikes buying guide", ld: faq, body: `<h2>How does an electric bike work?</h2><p>${answer}</p><h2>How much does an electric bike cost?</h2><p>${answer}</p><h2>Electric bike motor types</h2><ul><li>Hub</li><li>Mid drive</li><li>Friction</li></ul>${filler("electric bike")}` }) },
    "/e-bike-battery-life": { body: page({ title: "E-Bike Battery Life Explained | Velo World", h1: "E-bike battery life", ld: faq, body: `<h2>How long does an e-bike battery last?</h2><p>${answer}</p>${filler("e-bike battery")}` }) },
    "/bike-fitting": { body: page({ title: "Bike Fitting Guide | Velo World", h1: "Bike fitting", ld: faq, body: filler("bike fitting") }) },
    "/road-bikes": { body: page({ title: "Road Bikes: How to Choose | Velo World", h1: "Road bikes", ld: faq, body: `<h2>How to choose a road bike</h2><p>${answer}</p>${filler("road bike")}` }) },
  };
}
