import { describe, expect, it } from "vitest";
import { parseDuckHtml } from "../src/lib/server/websearch";

const HTML = `<html><body><div class="results">
<div class="result results_links web-result"><h2 class="result__title"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.elare.in%2Fcollections%2Fnecklaces&amp;rut=abc">Necklaces | Elare</a></h2><a class="result__snippet">Shop</a></div>
<div class="result result--ad"><h2><a class="result__a" href="https://duckduckgo.com/y.js?ad_provider=x&amp;u3=1">Sponsored</a></h2></div>
<div class="result results_links web-result"><h2 class="result__title"><a class="result__a" href="https://trovelle.in/products/ring">Ring - Trovelle</a></h2></div>
<div class="result"><h2><a class="result__a" href="javascript:alert(1)">bad</a></h2></div>
</div></body></html>`;

describe("parseDuckHtml", () => {
  it("unwraps redirect links, skips ads and non-http links, numbers positions", () => {
    const hits = parseDuckHtml(HTML);
    expect(hits.map((h) => h.domain)).toEqual(["elare.in", "trovelle.in"]);
    expect(hits[0].url).toBe("https://www.elare.in/collections/necklaces");
    expect(hits.map((h) => h.position)).toEqual([1, 2]);
  });
  it("returns nothing for a block page", () => {
    expect(parseDuckHtml("<html><body>anomaly detected</body></html>")).toEqual([]);
  });
});
