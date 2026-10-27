import type { IssueSeverity, PageAudit, PageIssue, SeoAudit, SiteProfile } from "../types";
import { clamp, mean } from "../util";

const PENALTY: Record<IssueSeverity, number> = { critical: 25, warning: 10, info: 3 };

export function auditSeo(profile: SiteProfile): SeoAudit {
  const titleCount = new Map<string, number>();
  const metaCount = new Map<string, number>();
  for (const p of profile.pages) {
    if (p.title) titleCount.set(p.title.toLowerCase(), (titleCount.get(p.title.toLowerCase()) ?? 0) + 1);
    if (p.metaDescription) metaCount.set(p.metaDescription.toLowerCase(), (metaCount.get(p.metaDescription.toLowerCase()) ?? 0) + 1);
  }

  const pages: PageAudit[] = profile.pages.map((p) => {
    const issues: PageIssue[] = [];
    const add = (id: string, severity: IssueSeverity, message: string) => issues.push({ id, severity, message });
    const isHome = p.depth === 0;

    if (!p.title) add("no-title", "critical", "No title tag");
    else {
      if (p.title.length < 25) add("title-length", "warning", `Title is short (${p.title.length} characters)`);
      else if (p.title.length > 65) add("title-length", "warning", `Title is long (${p.title.length} characters) and may be cut off in results`);
      if ((titleCount.get(p.title.toLowerCase()) ?? 0) > 1) add("dup-title", "warning", "Same title as another page");
    }
    if (!p.metaDescription) add("no-meta", "warning", "No meta description");
    else if (p.metaDescription.length < 70 || p.metaDescription.length > 165) add("meta-length", "info", `Meta description is ${p.metaDescription.length} characters (aim for 70 to 160)`);
    if ((metaCount.get(p.metaDescription.toLowerCase()) ?? 0) > 1 && p.metaDescription) add("dup-meta", "info", "Same meta description as another page");
    if (p.h1.length === 0) add("no-h1", "critical", "No H1 heading");
    else if (p.h1.length > 1) add("multi-h1", "info", `${p.h1.length} H1 headings`);
    if (!isHome && p.wordCount < 250 && !p.jsShell) add("thin", "warning", `Thin content (${p.wordCount} words)`);
    if (p.jsShell) add("js-shell", "critical", "Almost no text in the server HTML. Search and AI crawlers that skip JavaScript see an empty page");
    if (p.imagesNoAlt > 0) add("img-alt", "warning", `${p.imagesNoAlt} of ${p.images} images have no alt attribute`);
    if (!p.viewport) add("no-viewport", "critical", "No mobile viewport tag");
    if (!p.canonical) add("canonical", "info", "No canonical URL");
    if (p.robotsMeta && /noindex/i.test(p.robotsMeta)) add("noindex", "critical", "Page is set to noindex");
    if (!p.og && isHome) add("og", "info", "No Open Graph tags (affects link previews)");
    if (!p.url.startsWith("https://")) add("https", "critical", "Not served over HTTPS");

    const score = clamp(100 - issues.reduce((s, i) => s + PENALTY[i.severity], 0));
    const top = Object.entries(p.terms)
      .map(([k, s]) => [p.surf[k] ?? k, (s.t ? 5 : 0) + (s.h1 ? 5 : 0) + (s.h2 ?? 0) * 2 + s.b * 0.3] as const)
      .filter(([k]) => k.includes(" "))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k);
    return {
      url: p.url,
      path: p.path,
      title: p.title,
      wordCount: p.wordCount,
      score,
      issues,
      topTerms: top,
      aeo: { questionHeadings: p.questionHeadings, answerBlocks: p.answerBlocks, schema: p.schemaTypes },
    };
  });

  const siteIssues: PageIssue[] = [];
  if (!profile.sitemapFound) siteIssues.push({ id: "no-sitemap", severity: "warning", message: "No XML sitemap found at the usual locations" });
  if (!profile.robots.exists) siteIssues.push({ id: "no-robots", severity: "info", message: "No robots.txt found" });
  if (profile.robots.blocksAll) siteIssues.push({ id: "robots-block-all", severity: "critical", message: "robots.txt blocks all crawlers" });

  const sitePenalty = siteIssues.reduce((s, i) => s + PENALTY[i.severity] * 0.5, 0);
  const score = Math.round(clamp(mean(pages.map((p) => p.score)) - sitePenalty));
  const all = [...pages.flatMap((p) => p.issues), ...siteIssues];
  return {
    domain: profile.domain,
    score,
    pages,
    siteIssues,
    counts: {
      critical: all.filter((i) => i.severity === "critical").length,
      warning: all.filter((i) => i.severity === "warning").length,
      info: all.filter((i) => i.severity === "info").length,
    },
  };
}
