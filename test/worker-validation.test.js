import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const pageUrl = new URL("../index.html", import.meta.url);

test("the public cover page contains no navigation or interactive feature", async () => {
  const html = await readFile(pageUrl, "utf8");

  assert.doesNotMatch(html, /<nav\b/i);
  assert.doesNotMatch(html, /<form\b/i);
  assert.doesNotMatch(html, /<button\b/i);
  assert.doesNotMatch(html, /<a\b/i);
  assert.doesNotMatch(html, /<script\b/i);
});

test("the cover page is responsive and respects reduced motion", async () => {
  const html = await readFile(pageUrl, "utf8");

  assert.match(html, /@media \(max-width: 900px\)/);
  assert.match(html, /@media \(max-width: 520px\)/);
  assert.match(html, /prefers-reduced-motion: reduce/);
});
