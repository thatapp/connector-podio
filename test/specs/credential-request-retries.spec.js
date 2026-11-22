"use strict";
const assert = require("node:assert/strict");
const nock = require("nock").default;
const Podio = require("../../podio");
const { withPodioRetries } = require("../../helpers/request-retries");
const fields = require("../../component.json").credentials.fields;

describe("credential request retries", function () {
  const api = "https://api.podio.com";
  const cfg = { oauth: { access_token: "fixture" }, retries: 1, retryDelay: 0 };
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it("declares both optional numeric settings and applies their documented defaults", async () => {
    assert.equal(fields.retries.default, 5);
    assert.equal(fields.retryDelay.default, 10000);
    for (const field of [fields.retries, fields.retryDelay]) {
      assert.equal(field.viewClass, "NumberFieldView");
      assert.equal(field.required, false);
    }
    const waits = [];
    let calls = 0;
    const result = await withPodioRetries({}, 'GET', async () => {
      if (++calls <= 5) throw Object.assign(new Error('busy'), { statusCode: 503 });
      return 'ready';
    }, async ms => waits.push(ms));
    assert.equal(result, 'ready');
    assert.equal(calls, 6);
    assert.deepEqual(waits, Array(5).fill(10000));
  });

  it("rejects excessive counts before issuing a request", async () => {
    let calls = 0;
    await assert.rejects(withPodioRetries({ retries: 11, retryDelay: 0 }, "GET", () => { calls++; }), /Number of retries/);
    assert.equal(calls, 0);
  });

  it("returns the original rate limit when the next wait exceeds the host deadline", async () => {
    const provider = Object.assign(new Error("busy"), { statusCode: 420 });
    let waits = 0, calls = 0;
    const send = async () => { calls++; throw provider; };
    await assert.rejects(withPodioRetries({}, "GET", send, async () => { waits++; }, Date.now() + 100),
      error => error === provider && error.retry === false);
    assert.equal(calls, 1);
    assert.equal(waits, 0);
  });

  it("cannot issue another request after a late wake", async () => {
    const sinon = require("sinon"), clock = sinon.useFakeTimers({ now: 100, toFake: ["Date"] });
    try {
      const provider = Object.assign(new Error("busy"), { statusCode: 429 });
      let calls = 0;
      const send = async () => { calls++; throw provider; };
      await assert.rejects(withPodioRetries({ retryDelay: 10 }, "POST", send, async () => clock.tick(10000), 5000),
        error => error === provider && error.retry === false);
      assert.equal(calls, 1);
    } finally { clock.restore(); }
  });

  it("retries a transient provider read and returns the successful result", async () => {
    const server = nock(api).get("/item/5").reply(503, {}).get("/item/5").reply(200, { item_id: 5 });
    assert.equal((await new Podio(cfg).get("/item/5")).item_id, 5);
    assert.ok(server.isDone());
  });

  it("respects zero and does not replay writes with an ambiguous provider error", async () => {
    const server = nock(api).get("/item/5").reply(503, {}).post("/item/app/7").reply(503, {});
    await assert.rejects(new Podio({ ...cfg, retries: 0 }).get("/item/5"), e => e.statusCode === 503 && e.retry === false);
    await assert.rejects(new Podio(cfg).post("/item/app/7", {}), e => e.statusCode === 503 && e.retry === false);
    assert.ok(server.isDone());
  });

  it("retries an explicitly rate-limited write and rejects invalid settings before sending", async () => {
    const server = nock(api).post("/item/app/7").reply(429, {}).post("/item/app/7").reply(200, { item_id: 5 });
    assert.equal((await new Podio(cfg).post("/item/app/7", {})).item_id, 5);
    assert.ok(server.isDone());
    await assert.rejects(new Podio({ ...cfg, retries: "-1" }).get("/item/5"), /Number of retries/);
    await assert.rejects(new Podio({ ...cfg, retryDelay: 0.5 }).get("/item/5"), /Delay between retries/);
  });
});
