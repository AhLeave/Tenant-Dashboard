import { drizzle } from "drizzle-orm/node-postgres";
import XLSX from "xlsx";
import * as path from "path";
import bcrypt from "bcryptjs";
import { tenants, users, locations, products, orders, productAvailabilities } from "@shared/schema";

const db = drizzle(process.env.DATABASE_URL!);

const EXCEL_SKIP_COLS = new Set(["Product Group", "Product Name", "SKU", "Price per Unit", "ALL"]);
const SUFFIX_RE = /_\d+$/;

function getLocationColumns(row: Record<string, unknown>): string[] {
  return Object.keys(row).filter(
    (c) => !EXCEL_SKIP_COLS.has(c) && !SUFFIX_RE.test(c)
  );
}

export async function seedDatabase() {
  if (process.env.NODE_ENV === "production") {
    console.log("Seeding is disabled in production to prevent data loss.");
    return;
  }
  console.log("Wiping existing data...");

  await db.delete(orders);
  await db.delete(productAvailabilities);
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

  const defaultPasswordHash = await bcrypt.hash("password123", 10);

  await db.insert(users).values([
    {
      tenantId: null,
      role: "SUPER_ADMIN",
      email: "superadmin@cuh.ie",
      passwordHash: defaultPasswordHash,
    },
    {
      tenantId: tenant.id,
      role: "TENANT_ADMIN",
      email: "admin@cuh.ie",
      passwordHash: defaultPasswordHash,
    },
  ]);

  console.log("Created super admin user: superadmin@cuh.ie (password: password123)");
  console.log("Created admin user: admin@cuh.ie (password: password123)");

  const xlsxPath = path.resolve(process.cwd(), "attached_assets/cuh_data_1772636502743.xlsx");
  const wb = XLSX.readFile(xlsxPath);

  const locWs = wb.Sheets["Locations"];
  const locRows = XLSX.utils.sheet_to_json<Record<string, string>>(locWs, { defval: "" });
  const locationNames: string[] = locRows
    .map((r) => String(r["Locations"] || "").trim())
    .filter((n) => n.length > 0);

  const locationNameToId = new Map<string, number>();
  const BATCH = 50;

  for (let i = 0; i < locationNames.length; i += BATCH) {
    const batch = locationNames.slice(i, i + BATCH);
    const rows = await db
      .insert(locations)
      .values(batch.map((name) => ({ tenantId: tenant.id, name })))
      .returning();
    rows.forEach((loc) => locationNameToId.set(loc.name, loc.id));
  }

  console.log(`Inserted ${locationNameToId.size} locations.`);

  const prodWs = wb.Sheets["ProductsImport"];
  const prodRows = XLSX.utils.sheet_to_json<Record<string, string | number>>(prodWs, { defval: "" });

  const locationCols = getLocationColumns(prodRows[0] ?? {});
  console.log(`Detected ${locationCols.length} location columns in products sheet.`);

  const productValues = prodRows
    .map((r) => {
      const name = String(r["Product Name"] || "").trim();
      const sku = String(r["SKU"] || "").trim();
      const rawPrice = Number(r["Price per Unit"]) || 0;
      const group = String(r["Product Group"] || "").trim() || null;
      return { tenantId: tenant.id, name, sku, price: Math.round(rawPrice * 100), group };
    })
    .filter((p) => p.name && p.sku);

  const insertedProductIds: number[] = [];
  for (let i = 0; i < productValues.length; i += BATCH) {
    const inserted = await db
      .insert(products)
      .values(productValues.slice(i, i + BATCH))
      .returning({ id: products.id });
    insertedProductIds.push(...inserted.map((p) => p.id));
  }

  console.log(`Inserted ${insertedProductIds.length} products.`);

  const availabilities: { productId: number; locationId: number }[] = [];
  const validProdRows = prodRows.filter((r) => {
    const name = String(r["Product Name"] || "").trim();
    const sku = String(r["SKU"] || "").trim();
    return name && sku;
  });

  validProdRows.forEach((row, i) => {
    const productId = insertedProductIds[i];
    if (!productId) return;
    for (const col of locationCols) {
      const val = String(row[col] || "").toUpperCase().trim();
      if (val === "YES" || val === "Y") {
        const locationId = locationNameToId.get(col);
        if (locationId) {
          availabilities.push({ productId, locationId });
        }
      }
    }
  });

  const AV_BATCH = 200;
  for (let i = 0; i < availabilities.length; i += AV_BATCH) {
    await db.insert(productAvailabilities).values(availabilities.slice(i, i + AV_BATCH));
  }

  console.log(`Inserted ${availabilities.length} product-location availability mappings.`);
  console.log("Database seeded successfully");
}
