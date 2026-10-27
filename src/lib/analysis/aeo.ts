import { AI_RETRIEVAL_BOTS } from "../text";
import type { AeoAudit, CheckResult, PageData, SiteProfile } from "../types";
import { clamp, median } from "../util";

const CONTENT_SCHEMA = /^(Article|BlogPosting|NewsArticle|Product|FAQPage|HowTo|LocalBusiness|Service|Recipe|Event|Course|ItemList|CollectionPage|ProfilePage|QAPage|SoftwareApplication|Offer|Review)$/;
const ENTITY_SCHEMA = /^(Organization|WebSite|LocalBusiness|Corporation|Person|OnlineStore|Store)$/;

const share = (pages: PageData[], pred: (p: PageData) => boolean) => (pages.length ? pages.filter(pred).length / pages.length : 0);

export function auditAeo(profile: SiteProfile): AeoAudit {
  const pages = profile.pages;
  const inner = pages.filter((p) => p.depth > 0);
  const content = inner.length ? inner : pages;
  const checks: CheckResult[] = [];
  const add = (c: Omit<CheckResult, "ratio"> & { ratio: number }) => checks.push({ ...c, ratio: clamp(c.ratio, 0, 1) });

  const blocked = AI_RETRIEVAL_BOTS.filter((b) => profile.robots.bots[b] === "blocked");
  add({
    id: "ai-crawlers",
    label: "AI search crawlers can read the site",
    weight: 15,
    ratio: 1 - blocked.length / AI_RETRIEVAL_BOTS.length,
    detail: blocked.length ? `robots.txt blocks ${blocked.join(", ")}` : "robots.txt does not block ChatGPT, Perplexity or Claude search crawlers",
    fix: "Remove Disallow rules for OAI-SearchBot, ChatGPT-User, PerplexityBot, Claude-SearchBot and Claude-User. Blocking training crawlers (GPTBot, ClaudeBot) is a separate choice and does not affect answer citations.",
    ease: 90,
    effortHrs: 0.5,
  });

  const jsPages = pages.filter((p) => p.jsShell).length;
  add({
    id: "server-rendered",
    label: "Content is in the server HTML",
    weight: 12,
    ratio: 1 - jsPages / Math.max(1, pages.length),
    detail: jsPages ? `${jsPages} of ${pages.length} pages return almost no text without JavaScript` : "Pages return readable text without running JavaScript",
    fix: "Server-render or statically generate key pages. Most AI crawlers do not execute JavaScript, so client-only content is invisible to them.",
    ease: 25,
    effortHrs: 16,
  });

  const withLd = share(pages, (p) => p.schemaTypes.length > 0);
  add({
    id: "structured-data",
    label: "Structured data (JSON-LD) on pages",
    weight: 10,
    ratio: withLd,
    detail: `${Math.round(withLd * pages.length)} of ${pages.length} pages have structured data`,
    fix: "Add JSON-LD to every template: Organization on the home page, BreadcrumbList site-wide, and a content type on inner pages.",
    ease: 60,
    effortHrs: 4,
  });

  const entity = pages.some((p) => p.schemaTypes.some((t) => ENTITY_SCHEMA.test(t)) && p.hasSameAs);
  const entityPartial = pages.some((p) => p.schemaTypes.some((t) => ENTITY_SCHEMA.test(t)));
  add({
    id: "entity",
    label: "Clear entity: Organization schema with sameAs links",
    weight: 8,
    ratio: entity ? 1 : entityPartial ? 0.5 : 0,
    detail: entity ? "Organization schema with sameAs found" : entityPartial ? "Organization schema found but no sameAs links" : "No Organization or WebSite schema found",
    fix: "Add Organization schema on the home page with name, logo, url and sameAs links to your LinkedIn, Wikipedia/Wikidata, Google Business and social profiles. This is how engines tie your site to one entity.",
    ease: 80,
    effortHrs: 1.5,
  });

  const typed = share(content, (p) => p.schemaTypes.some((t) => CONTENT_SCHEMA.test(t)));
  add({
    id: "content-schema",
    label: "Content-type schema on inner pages",
    weight: 8,
    ratio: typed,
    detail: `${Math.round(typed * content.length)} of ${content.length} inner pages use Article, Product, Service, FAQPage or similar`,
    fix: "Mark up articles as Article, products as Product, services as Service, and Q&A sections as FAQPage.",
    ease: 55,
    effortHrs: 4,
  });

  const qh = pages.reduce((s, p) => s + p.questionHeadings, 0);
  add({
    id: "question-headings",
    label: "Question-style headings",
    weight: 12,
    ratio: Math.min(1, qh / 6),
    detail: qh ? `${qh} question-style headings across ${pages.length} pages` : "No headings phrased as questions",
    fix: "Turn the questions customers actually ask into H2/H3 headings, one per question, on the page that is best placed to answer it.",
    ease: 75,
    effortHrs: 3,
  });

  const ab = pages.reduce((s, p) => s + p.answerBlocks, 0);
  add({
    id: "direct-answers",
    label: "Direct answers under those headings",
    weight: 12,
    ratio: Math.min(1, ab / 5),
    detail: ab ? `${ab} concise answer blocks (25 to 90 words) directly under a question` : "No short, direct answer found under any question heading",
    fix: "Start each answer with a 40 to 55 word self-contained reply, then expand. Assistants quote the first clean answer they find.",
    ease: 70,
    effortHrs: 3,
  });

  const struct = share(content, (p) => p.lists > 0 || p.tables > 0);
  add({
    id: "extractable",
    label: "Lists and tables that can be quoted",
    weight: 6,
    ratio: Math.min(1, struct / 0.5),
    detail: `${Math.round(struct * content.length)} of ${content.length} inner pages have a list or table`,
    fix: "Use real HTML lists for steps and options, and real tables for comparisons and specs.",
    ease: 70,
    effortHrs: 2,
  });

  const byline = share(content, (p) => p.hasAuthor || !!p.datePublished || !!p.dateModified);
  add({
    id: "authorship",
    label: "Authors and dates are visible",
    weight: 8,
    ratio: byline,
    detail: `${Math.round(byline * content.length)} of ${content.length} inner pages show an author or date`,
    fix: "Show who wrote or reviewed each page and when it was last updated, and mirror it in schema (author, datePublished, dateModified).",
    ease: 65,
    effortHrs: 3,
  });

  const med = median(content.map((p) => p.wordCount));
  add({
    id: "depth",
    label: "Pages go deep enough to be useful",
    weight: 7,
    ratio: Math.min(1, med / 700),
    detail: `Median inner page has ${med} words`,
    fix: "Expand thin pages with specifics: numbers, examples, comparisons, and the questions people ask next.",
    ease: 40,
    effortHrs: 6,
  });

  add({
    id: "llms-txt",
    label: "llms.txt file",
    weight: 2,
    ratio: profile.llmsTxt ? 1 : 0,
    detail: profile.llmsTxt ? "llms.txt found" : "No llms.txt",
    fix: "Optional and low priority. Major AI search providers have not confirmed they use it, but it is cheap to publish: a plain-text index of your best pages.",
    ease: 85,
    effortHrs: 1,
  });

  const total = checks.reduce((s, c) => s + c.weight, 0);
  const score = Math.round((checks.reduce((s, c) => s + c.weight * c.ratio, 0) / total) * 100);
  return { domain: profile.domain, score, checks };
}
