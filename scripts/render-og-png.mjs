// Render public/og.svg → public/og.png (1200×630) for social previews.
// Some platforms (Facebook, some chat apps, some ATS/career tools) don't show
// SVG og:image previews — PNG is the lowest-common-denominator format.
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const svgPath = path.resolve(here, "../public/og.svg");
const outPath = path.resolve(here, "../public/og.png");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto("file://" + svgPath, { waitUntil: "load" });
// Give web fonts a beat to settle so Korean glyphs render in the snapshot.
await page.waitForTimeout(500);
await page.screenshot({
  path: outPath,
  clip: { x: 0, y: 0, width: 1200, height: 630 },
});
await browser.close();
console.log("OG PNG written to", outPath);
