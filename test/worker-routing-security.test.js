import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/worker.js";

const origin = "https://fa.focom-iliad.fr";

test("GET requests are served by the static asset binding", async () => {
  let requestedPath = "";
  const env = {
    ASSETS: {
      async fetch(request) {
        requestedPath = new URL(request.url).pathname;
        return new Response("cover", {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      },
    },
  };

  const response = await worker.fetch(new Request(origin + "/"), env);

  assert.equal(response.status, 200);
  assert.equal(requestedPath, "/");
  assert.equal(await response.text(), "cover");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.match(response.headers.get("Content-Security-Policy") || "", /script-src 'none'/);
});

test("write methods fail closed without reaching the asset binding", async () => {
  let assetWasCalled = false;
  const env = {
    ASSETS: {
      async fetch() {
        assetWasCalled = true;
        return new Response("unexpected");
      },
    },
  };

  const response = await worker.fetch(
    new Request(origin + "/", { method: "POST", body: "test" }),
    env,
  );

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "GET, HEAD");
  assert.equal(assetWasCalled, false);
});
