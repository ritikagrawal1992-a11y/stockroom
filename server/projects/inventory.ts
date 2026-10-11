import type { Express } from "express";
import type { Store } from "../store";
import { fail, text, integer } from "../validation";

export function registerInventory(
  app: Express,
  { all, one, run, transaction }: Store,
) {
  app.get("/api/products", (_req, res) =>
    res.json(
      all(
        "SELECT *, quantity<=threshold AS low_stock FROM products ORDER BY id",
      ),
    ),
  );
  app.post("/api/products", (req, res) => {
    const sku = text(req.body.sku, "SKU", 40),
      name = text(req.body.name, "Product");
    const quantity = integer(req.body.quantity, "Quantity"),
      threshold = integer(req.body.threshold, "Threshold");
    if (one("SELECT id FROM products WHERE sku=?", sku))
      fail(409, "That SKU already exists.");
    const result = run(
      "INSERT INTO products(sku,name,quantity,threshold) VALUES(?,?,?,?)",
      sku,
      name,
      quantity,
      threshold,
    );
    res
      .status(201)
      .json(
        one(
          "SELECT * FROM products WHERE id=?",
          Number(result.lastInsertRowid),
        ),
      );
  });
  app.get("/api/stock-moves", (_req, res) =>
    res.json(
      all(
        "SELECT m.*,p.name FROM stock_moves m JOIN products p ON p.id=m.product_id ORDER BY m.id DESC LIMIT 100",
      ),
    ),
  );
  app.post("/api/products/:id/moves", (req, res) => {
    const id = integer(Number(req.params.id), "Product ID", 1);
    const delta = req.body.delta;
    if (
      !Number.isSafeInteger(delta) ||
      delta === 0 ||
      Math.abs(delta) > 100_000_000
    )
      fail(400, "Stock change must be a nonzero whole number.");
    const note = text(req.body.note, "Movement reason");
    transaction(() => {
      const product = one("SELECT * FROM products WHERE id=?", id);
      if (!product) fail(404, "Product not found.");
      const quantity = Number(product.quantity) + delta;
      if (quantity < 0) fail(409, "Insufficient stock.");
      integer(quantity, "Resulting quantity");
      run("UPDATE products SET quantity=? WHERE id=?", quantity, id);
      run(
        "INSERT INTO stock_moves(product_id,delta,note) VALUES(?,?,?)",
        id,
        delta,
        note,
      );
    });
    res.status(201).json(one("SELECT * FROM products WHERE id=?", id));
  });
}
