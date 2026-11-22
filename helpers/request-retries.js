"use strict";

function setting(value, fallback, name, max = Number.MAX_SAFE_INTEGER) {
  if (value == null || value === "") return fallback;
  if (!["string", "number"].includes(typeof value) || !/^\d+$/.test(String(value))) {
    throw new Error(name + " must be a nonnegative whole number.");
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number > max) throw new Error(name + " is outside the supported range.");
  return number;
}

const networkErrors = new Set(["ECONNRESET", "ETIMEDOUT", "ESOCKETTIMEDOUT", "EAI_AGAIN", "ECONNREFUSED"]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function withPodioRetries(cfg, method, send, wait = sleep, deadline = Date.now() + 60000) {
  const retries = setting(cfg?.retries, 5, "Number of retries", 10);
  const delay = setting(cfg?.retryDelay, 10000, "Delay between retries", 2147483647);
  for (let attempt = 0; ; attempt++) {
    try {
      return await send();
    } catch (error) {
      const status = Number(error?.statusCode || error?.status);
      const refused = status === 420 || status === 429 || error?.kind === "RATE_LIMIT";
      const transient = (status >= 500 && status < 600) || networkErrors.has(error?.code);
      // A disconnected or failed write may already have reached Podio.
      const repeat = refused || (method === "GET" && transient);
      // Leave time to return the actual provider error to the caller. A late wake
      // (event-loop pressure, suspended worker) must not start another request.
      const retryCutoff = deadline - 1000;
      if (!repeat || attempt >= retries || Date.now() + delay >= retryCutoff) {
        if (error && typeof error === "object" && (repeat || transient)) error.retry = false;
        throw error;
      }
      await wait(delay);
      if (Date.now() >= retryCutoff) {
        if (error && typeof error === "object") error.retry = false;
        throw error;
      }
    }
  }
}

module.exports = { withPodioRetries };
