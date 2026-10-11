import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { createApp } from "../server/app";
async function fixture(t: TestContext) {
  const { app, db } = createApp(":memory:", false),
    server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing port");
  return async (
    path: string,
    method = "GET",
    body?: unknown,
    headers?: Record<string, string>,
  ) => {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api${path}`,
      {
        method,
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    return {
      status: response.status,
      data: response.status === 204 ? null : await response.json(),
    };
  };
}
test("inventory rejects duplicate SKU and fractional quantities", async (t) => {
  const call = await fixture(t),
    payload = { sku: "C-1", name: "Cable", quantity: 5, threshold: 2 };
  assert.equal((await call("/products", "POST", payload)).status, 201);
  assert.equal((await call("/products", "POST", payload)).status, 409);
  assert.equal(
    (await call("/products", "POST", { ...payload, sku: "C-2", quantity: 1.5 }))
      .status,
    400,
  );
});

test("insufficient stock rolls back both quantity and audit log", async (t) => {
  const call = await fixture(t),
    p = await call("/products", "POST", {
      sku: "D-1",
      name: "Dock",
      quantity: 3,
      threshold: 2,
    });
  assert.equal(
    (
      await call("/products/" + p.data.id + "/moves", "POST", {
        delta: -4,
        note: "Issue units",
      })
    ).status,
    409,
  );
  assert.equal((await call("/products")).data[0].quantity, 3);
  assert.equal((await call("/stock-moves")).data.length, 0);
  assert.equal(
    (
      await call("/products/" + p.data.id + "/moves", "POST", {
        delta: -2,
        note: "Workshop",
      })
    ).status,
    201,
  );
  assert.equal((await call("/products")).data[0].low_stock, 1);
  assert.equal((await call("/stock-moves")).data[0].delta, -2);
});
