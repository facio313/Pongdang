import { test, expect } from "@playwright/test";

for (const [pageName, endpoint] of [["water-index", "water-index/assessments"], ["water-forecast", "water-forecast/forecasts"]]) {
  test(`${pageName} only requests dates from the current KST day through day seven`, async ({ page }) => {
    await page.clock.install({ time: new Date("2026-12-31T15:00:00Z") });
    const reads: URLSearchParams[] = [];
    await page.route("**/api/data/**", route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith(endpoint)) reads.push(url.searchParams);
      return route.fulfill({ json: { rows: [], total: 0 } });
    });
    await page.goto(`#${pageName}?spot_id=1&from=2026-12-31T00:00:00%2B09:00&until=2027-01-02T00:00:00%2B09:00`);
    await expect(page.getByRole("alert")).toContainText("한국시간 오늘부터 7일 뒤까지");
    expect(reads).toEqual([]);
    const from = page.getByLabel("시작 · KST");
    const until = page.getByLabel("종료 · KST");
    await expect(from).toHaveAttribute("min", "2027-01-01T00:00");
    await expect(until).toHaveAttribute("max", "2027-01-08T23:59");
    await from.fill("2027-01-01T00:00");
    await until.fill("2027-01-08T23:59");
    await expect.poll(() => reads.at(-1)?.get("until")).toBe("2027-01-08T14:59:00.000Z");
    const count = reads.length;
    await until.fill("2027-01-09T00:00");
    await expect(page.getByRole("alert")).toContainText("한국시간 오늘부터 7일 뒤까지");
    expect(reads.length).toBe(count);
  });
}
