import { drizzle } from "drizzle-orm/node-postgres";
import XLSX from "xlsx";
import * as path from "path";
import { tenants, users, locations, products, orders } from "@shared/schema";

const db = drizzle(process.env.DATABASE_URL!);

export async function seedDatabase() {
  console.log("Wiping existing data...");

  await db.delete(orders);
  await db.delete(products);
  await db.delete(locations);
  await db.delete(users);
  await db.delete(tenants);

  console.log("All tables cleared.");

  const [tenant] = await db.insert(tenants).values({
    name: "Cork University Hospital",
    subdomain: "cuh",
    cutoffTime: "07:00",
    logoUrl: null,
  }).returning();

  console.log(`Created tenant: ${tenant.name} (id=${tenant.id})`);

  await db.insert(users).values({
    tenantId: tenant.id,
    role: "TENANT_ADMIN",
    email: "admin@cuh.ie",
  });

  console.log("Created admin user: admin@cuh.ie");

  const xlsxPath = path.resolve(process.cwd(), "attached_assets/cuh_data_1772636502743.xlsx");
  const wb = XLSX.readFile(xlsxPath);

  const locWs = wb.Sheets["Locations"];
  const locRows = XLSX.utils.sheet_to_json<Record<string, string>>(locWs, { defval: "" });

  const locationNames: string[] = locRows
    .map((r) => String(r["Locations"] || "").trim())
    .filter((n) => n.length > 0);

  const BATCH = 50;
  let totalLocations = 0;

  for (let i = 0; i < locationNames.length; i += BATCH) {
    const batch = locationNames.slice(i, i + BATCH);
    await db.insert(locations).values(batch.map((name) => ({ tenantId: tenant.id, name })));
    totalLocations += batch.length;
  }

  console.log(`Inserted ${totalLocations} locations.`);

  const prodWs = wb.Sheets["ProductsImport"];
  const prodRows = XLSX.utils.sheet_to_json<Record<string, string | number>>(prodWs, { defval: "" });

  const productValues = prodRows
    .map((r) => {
      const name = String(r["Product Name"] || "").trim();
      const sku = String(r["SKU"] || "").trim();
      const rawPrice = Number(r["Price per Unit"]) || 0;
      const group = String(r["Product Group"] || "").trim() || null;
      return { tenantId: tenant.id, name, sku, price: Math.round(rawPrice * 100), group };
    })
    .filter((p) => p.name && p.sku);

  for (let i = 0; i < productValues.length; i += BATCH) {
    await db.insert(products).values(productValues.slice(i, i + BATCH));
  }

  console.log(`Inserted ${productValues.length} products.`);
  console.log("Database seeded successfully");
}
