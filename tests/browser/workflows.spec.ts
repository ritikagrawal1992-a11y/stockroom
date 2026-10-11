import { test, expect } from "@playwright/test";
test("Stockroom reports insufficient stock, then records a receipt", async ({
  page,
}) => {
  await page.goto("/#inventory");
  await page
    .getByLabel("Product", { exact: true })
    .selectOption({ label: "USB-C docking station (3 in stock)" });
  await page.getByLabel("Quantity change", { exact: false }).fill("-10");
  await page.getByLabel("Reason", { exact: true }).fill("Outbound batch");
  await page.getByRole("button", { name: "Save movement" }).click();
  await expect(page.getByRole("alert")).toHaveText("Insufficient stock.");
  await page.getByLabel("Quantity change", { exact: false }).fill("5");
  await page.getByRole("button", { name: "Save movement" }).click();
  await expect(page.locator("tr").filter({ hasText: "DS-204" })).toContainText(
    "Healthy",
  );
  await page.screenshot({
    path: "docs/screenshots/stockroom.png",
    fullPage: true,
  });
});
