/** Old source selections resolve to the independent collection database. */
export function canonicalDataUrl(href: string): URL {
  const url = new URL(href);
  url.searchParams.set("data", "data");
  return url;
}

const featurePages = ["water-index", "water-index-map", "water-forecast", "livecam", "tide", "first-swim", "water-quality"];

export function pageFromHash(hash: string): string {
  const page = hash.replace(/^#/, "");
  if (page === "info" || page === "collector") return "info";
  return featurePages.includes(page) ? page : "data";
}
