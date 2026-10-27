/** Shared types. Everything here is JSON-serialisable so it can cross the API boundary and live in localStorage. */

export type Confidence = "measured" | "crawled" | "estimated";
export type Intent = "informational" | "commercial" | "transactional" | "navigational" | "general";

/** Where a term appears on one page. t/h1/m are flags, h2/h3 are heading counts, b is body occurrences. */
export interface TermStat {
  t?: 1;
  h1?: 1;
  h2?: number;
  h3?: number;
  m?: 1;
  b: number;
}

export interface PageData {
  url: string;
  path: string;
  depth: number;
  status: number;
  title: string;
  metaDescription: string;
  h1: string[];
  h2: string[];
  h3: string[];
  wordCount: number;
  canonical: string | null;
  lang: string | null;
  robotsMeta: string | null;
  viewport: boolean;
  og: boolean;
  schemaTypes: string[];
  hasSameAs: boolean;
  hasAuthor: boolean;
  datePublished: string | null;
  dateModified: string | null;
  questionHeadings: number;
  answerBlocks: number;
  lists: number;
  tables: number;
  images: number;
  imagesNoAlt: number;
  internalLinks: number;
  externalLinks: number;
  jsShell: boolean;
  /** Top terms on the page, keyed by stemmed phrase. */
  terms: Record<string, TermStat>;
  /** stemmed phrase -> readable surface form, only where they differ. */
  surf: Record<string, string>;
}

export type BotAccess = "allowed" | "blocked" | "unspecified";

export interface RobotsInfo {
  exists: boolean;
  sitemaps: string[];
  /** bot name -> access to "/" */
  bots: Record<string, BotAccess>;
  /** true when "*" disallows everything */
  blocksAll: boolean;
}

export interface SiteProfile {
  origin: string;
  domain: string;
  fetchedAt: string;
  pages: PageData[];
  robots: RobotsInfo;
  llmsTxt: boolean;
  sitemapFound: boolean;
  sitemapUrls: number;
  brandTokens: string[];
  errors: string[];
  lang: string | null;
  country: string;
}

export interface SerpOrganic {
  position: number;
  url: string;
  domain: string;
  title: string;
  snippet: string;
}

export interface SerpResult {
  query: string;
  organic: SerpOrganic[];
  paa: { question: string; snippet?: string; domain?: string }[];
  related: string[];
  answerBox?: { domain?: string; title?: string; snippet?: string };
}

export interface GscRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SuggestedCompetitor {
  domain: string;
  appearances: number;
  avgPosition: number;
  source: "serp" | "ai";
  reason?: string;
}

export interface AiQuestion {
  q: string;
  topic: string;
}

export interface RunInput {
  url: string;
  competitors: string[];
  country: string;
  language: string;
  serpBudget: number;
  maxPages: number;
  autoDiscover: boolean;
}

/** Everything collected from the network. The report is derived from this, deterministically. */
export interface RawData {
  version: 1;
  input: RunInput;
  collectedAt: string;
  own: SiteProfile;
  competitors: SiteProfile[];
  competitorSource: "manual" | "serp" | "ai" | "none";
  suggested: SuggestedCompetitor[];
  competitorErrors: { domain: string; error: string }[];
  serp: Record<string, SerpResult>;
  aiQuestions: AiQuestion[];
  gsc: GscRow[];
  gscMonths: number;
}

export interface Capabilities {
  serp: boolean;
  ai: boolean;
  passcodeRequired: boolean;
  authorized: boolean;
}

/* ---------- Derived report ---------- */

export interface SiteTerm {
  key: string;
  label: string;
  ngram: number;
  score: number;
  norm: number;
  pages: number;
  inTitle: number;
  inH1: number;
  inH2: number;
  inMeta: number;
  body: number;
  bestPage: string | null;
  prominentUrls: { url: string; title: string }[];
}

export type RankSource = "gsc" | "serp";

export interface KeywordRow {
  key: string;
  label: string;
  intent: Intent;
  branded: boolean;
  norm: number;
  pages: number;
  inTitle: boolean;
  inH1: boolean;
  inH2: boolean;
  inMeta: boolean;
  bestPage: string | null;
  position: number | null;
  rankSource: RankSource | null;
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  prevPosition: number | null;
}

export type GapStatus = "missing" | "weak" | "covered" | "strength";

export interface GapRow {
  key: string;
  label: string;
  intent: Intent;
  status: GapStatus;
  priority: number;
  compCoverage: number;
  compTotal: number;
  compStrength: number;
  ownNorm: number;
  ownPage: string | null;
  competitors: { domain: string; prominent: boolean; url: string | null; title: string | null }[];
  position: number | null;
}

export interface CheckResult {
  id: string;
  label: string;
  weight: number;
  ratio: number;
  detail: string;
  fix: string;
  ease: number;
  effortHrs: number;
}

export interface AeoAudit {
  domain: string;
  score: number;
  checks: CheckResult[];
}

export type IssueSeverity = "critical" | "warning" | "info";

export interface PageIssue {
  id: string;
  severity: IssueSeverity;
  message: string;
}

export interface PageAudit {
  url: string;
  path: string;
  title: string;
  wordCount: number;
  score: number;
  issues: PageIssue[];
  topTerms: string[];
  aeo: { questionHeadings: number; answerBlocks: number; schema: string[] };
}

export interface SeoAudit {
  domain: string;
  score: number;
  pages: PageAudit[];
  siteIssues: PageIssue[];
  counts: { critical: number; warning: number; info: number };
}

export type OppType =
  | "striking"
  | "ctr"
  | "onpage"
  | "content-gap"
  | "aeo-question"
  | "snippet"
  | "technical"
  | "aeo-infra";

export type Phase = "Foundations" | "Quick wins" | "Content build" | "Measure";

export interface Opportunity {
  id: string;
  type: OppType;
  phase: Phase;
  title: string;
  keyword?: string;
  why: string;
  evidence: string[];
  actions: string[];
  impact: number;
  ease: number;
  score: number;
  quickWin: boolean;
  effortHrs: number;
  confidence: Confidence;
  basis: string;
  targetUrl?: string | null;
  /** Estimated extra clicks per month (only when GSC impressions exist). */
  extraClicks?: number;
}

export interface QuestionRow {
  q: string;
  source: "serp" | "ai" | "pattern";
  topic: string;
  answered: boolean;
  matchedUrl: string | null;
  answeredBy: string[];
}

export interface Brief {
  id: string;
  keyword: string;
  intent: Intent;
  mode: "new-page" | "optimise";
  targetUrl: string | null;
  titleOptions: string[];
  h1: string;
  metaDescription: string;
  outline: { h2: string; source: "competitor" | "question" | "template" }[];
  questions: string[];
  schema: string[];
  wordCountTarget: number;
  internalLinks: { url: string; title: string }[];
  competitorPages: { domain: string; url: string; title: string; words: number }[];
  snippetHint: string;
}

export interface CompetitorSummary {
  domain: string;
  pages: number;
  seoScore: number;
  aeoScore: number;
  medianWords: number;
  topTerms: string[];
  sharedKeywords: number;
  schemaTypes: string[];
  retrievalBotsBlocked: string[];
}

export interface PlanTask {
  id: string;
  oppId: string;
  title: string;
  phase: Phase;
  type: OppType | "measure";
  effortHrs: number;
  startWeek: number;
  endWeek: number;
  score: number;
}

export interface Plan {
  tasks: PlanTask[];
  backlog: PlanTask[];
  weeks: { n: number; start: string; hours: number }[];
  hoursPerWeek: number;
}

export interface Report {
  generatedAt: string;
  domain: string;
  hasSerp: boolean;
  hasGsc: boolean;
  hasCompetitors: boolean;
  ownSeo: SeoAudit;
  ownAeo: AeoAudit;
  competitorSeo: SeoAudit[];
  competitorAeo: AeoAudit[];
  competitors: CompetitorSummary[];
  keywords: KeywordRow[];
  gaps: GapRow[];
  differentiators: KeywordRow[];
  ideas: { query: string; from: string }[];
  questions: QuestionRow[];
  opportunities: Opportunity[];
  briefs: Brief[];
  plan: Plan;
  topTerms: string[];
}
