import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const pageUrl = new URL("../index.html", import.meta.url);

test("the public cover page introduces Free Assistance", async () => {
  const html = await readFile(pageUrl, "utf8");

  assert.match(html, /<title>Free Assistance/);
  assert.match(html, /fa\.focom-iliad\.fr/);
  assert.match(html, /01\.08\.2026/);
});

test("the cover page identifies every integrated entity", async () => {
  const html = await readFile(pageUrl, "utf8");

  for (const entity of ["Protelco", "UES MCRA", "Centrapel", "Certicall", "Equaline"]) {
    assert.match(html, new RegExp(entity));
  }
});
