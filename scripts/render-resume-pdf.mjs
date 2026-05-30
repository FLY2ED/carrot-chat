// Render resume.html → PDF using the Chromium that Playwright already installed.
// Run from anywhere: `node carrot-chat/scripts/render-resume-pdf.mjs`
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(here, "../../resume/resume.html");
const pdfPath = path.resolve(here, "../../resume/박성재_이력서_당근채팅팀.pdf");

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("file://" + htmlPath, { waitUntil: "networkidle" });
await page.pdf({
  path: pdfPath,
  format: "A4",
  printBackground: true,
  margin: { top: "0", bottom: "0", left: "0", right: "0" },
});

// Also export a full-page PNG preview for visual QA.
await page.setViewportSize({ width: 794, height: 1123 });
await page.screenshot({
  path: path.resolve(here, "../../resume/resume-preview.png"),
  fullPage: true,
});

await browser.close();
console.log("PDF written to", pdfPath);
