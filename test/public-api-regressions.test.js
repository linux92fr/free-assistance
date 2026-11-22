import test from "node:test";
import assert from "node:assert/strict";
import { handleContact, handleNewsletterSubscribe, handleSurvey } from "../src/worker.js";

const origin = "https://fd.focom-iliad.fr";
const jsonHeaders = { Origin: origin, "Content-Type": "application/json" };
const request = (body, headers = jsonHeaders) => new Request("https://fd.focom-iliad.fr/api/test", {
  method: "POST",
  headers,
  body,
});

async function payload(response) {
  return { status: response.status, body: await response.json() };
}

test("contact rejects an unapproved origin before processing the body", async () => {
  const result = await payload(await handleContact(request("{}", { ...jsonHeaders, Origin: "https://evil.example" }), {}));
  assert.equal(result.status, 403);
  assert.equal(result.body.error, "INVALID_ORIGIN");
});

test("contact rejects non-JSON content types", async () => {
  const result = await payload(await handleContact(request("name=Bot", { Origin: origin, "Content-Type": "text/plain" }), {}));
  assert.equal(result.status, 415);
  assert.equal(result.body.error, "INVALID_CONTENT_TYPE");
});

test("contact rejects malformed JSON", async () => {
  const result = await payload(await handleContact(request("{")), {});
  assert.equal(result.status, 400);
  assert.equal(result.body.error, "INVALID_JSON");
});

test("contact honeypot accepts bot submissions without requiring database access", async () => {
  const result = await payload(await handleContact(request(JSON.stringify({ website: "https://spam.example" })), {}));
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
});

test("newsletter rejects an unapproved origin", async () => {
  const result = await payload(await handleNewsletterSubscribe(request("{}", { ...jsonHeaders, Origin: "https://evil.example" }), {}));
  assert.equal(result.status, 403);
  assert.equal(result.body.error, "INVALID_ORIGIN");
});

test("newsletter honeypot accepts bot submissions before rate limiting or database access", async () => {
  const result = await payload(await handleNewsletterSubscribe(request(JSON.stringify({ website: "spam" })), {}));
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
});

test("newsletter rejects malformed JSON", async () => {
  const result = await payload(await handleNewsletterSubscribe(request("{")), {});
  assert.equal(result.status, 400);
  assert.equal(result.body.error, "INVALID_JSON");
});

test("survey requires configured storage", async () => {
  const result = await payload(await handleSurvey(request(JSON.stringify({ website: "bot" })), {}));
  assert.equal(result.status, 503);
  assert.equal(result.body.error, "SURVEY_STORAGE_UNAVAILABLE");
});

test("survey rejects non-JSON content types", async () => {
  const result = await payload(await handleSurvey(request("conditions=5", { Origin: origin, "Content-Type": "text/plain" }), { SURVEYS_DB: {} }));
  assert.equal(result.status, 415);
  assert.equal(result.body.error, "INVALID_CONTENT_TYPE");
});

test("survey rejects an unapproved origin", async () => {
  const result = await payload(await handleSurvey(request("{}", { ...jsonHeaders, Origin: "https://evil.example" }), { SURVEYS_DB: {} }));
  assert.equal(result.status, 403);
  assert.equal(result.body.error, "INVALID_ORIGIN");
});

test("survey honeypot accepts bot submissions without writing a response", async () => {
  let writes = 0;
  const db = { prepare() { writes += 1; throw new Error("Unexpected database write"); } };
  const result = await payload(await handleSurvey(request(JSON.stringify({ website: "spam" })), { SURVEYS_DB: db }));
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(writes, 0);
});

test("survey rejects malformed JSON", async () => {
  const result = await payload(await handleSurvey(request("{"), { SURVEYS_DB: {} }));
  assert.equal(result.status, 400);
  assert.equal(result.body.error, "INVALID_JSON");
});
