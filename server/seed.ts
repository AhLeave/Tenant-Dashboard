import { storage } from "./storage";
import { drizzle } from "drizzle-orm/node-postgres";
import { tenants } from "@shared/schema";

const db = drizzle(process.env.DATABASE_URL!);

export async function seedDatabase() {
  const existing = await db.select().from(tenants);
  if (existing.length > 0) return;

  const tenant1 = await storage.createTenant({
    name: "Acme Healthcare",
    logoUrl: null,
    subdomain: "acme-health",
  });

  const tenant2 = await storage.createTenant({
    name: "MedSupply Corp",
    logoUrl: null,
    subdomain: "medsupply",
  });

  const user1 = await storage.createUser({ tenantId: tenant1.id, role: "SuperAdmin", email: "admin@acmehealth.com" });
  const user2 = await storage.createUser({ tenantId: tenant1.id, role: "TenantAdmin", email: "manager@acmehealth.com" });
  const user3 = await storage.createUser({ tenantId: tenant1.id, role: "WardManager", email: "ward@acmehealth.com" });
  const user4 = await storage.createUser({ tenantId: tenant1.id, role: "Warehouse", email: "warehouse@acmehealth.com" });
  await storage.createUser({ tenantId: tenant2.id, role: "SuperAdmin", email: "admin@medsupply.com" });
  await storage.createUser({ tenantId: tenant2.id, role: "TenantAdmin", email: "ops@medsupply.com" });

  const loc1 = await storage.createLocation({ tenantId: tenant1.id, name: "Main Hospital - Floor 1" });
  const loc2 = await storage.createLocation({ tenantId: tenant1.id, name: "East Wing Pharmacy" });
  const loc3 = await storage.createLocation({ tenantId: tenant1.id, name: "Central Warehouse" });
  const loc4 = await storage.createLocation({ tenantId: tenant1.id, name: "ICU Supply Room" });
  await storage.createLocation({ tenantId: tenant2.id, name: "Distribution Center A" });
  await storage.createLocation({ tenantId: tenant2.id, name: "Distribution Center B" });

  await storage.createProduct({ tenantId: tenant1.id, name: "Surgical Gloves (Box)", sku: "SG-001", price: 2499 });
  await storage.createProduct({ tenantId: tenant1.id, name: "Disposable Syringes (100pk)", sku: "DS-100", price: 4599 });
  await storage.createProduct({ tenantId: tenant1.id, name: "N95 Respirator Masks (50pk)", sku: "N95-050", price: 8999 });
  await storage.createProduct({ tenantId: tenant1.id, name: "Sterile Bandages (Roll)", sku: "SB-010", price: 1299 });
  await storage.createProduct({ tenantId: tenant1.id, name: "IV Fluid Bags (1L)", sku: "IV-1000", price: 3750 });
  await storage.createProduct({ tenantId: tenant2.id, name: "Blood Pressure Monitor", sku: "BP-200", price: 12999 });
  await storage.createProduct({ tenantId: tenant2.id, name: "Digital Thermometer", sku: "DT-050", price: 2499 });

  await storage.createOrder({ tenantId: tenant1.id, locationId: loc1.id, userId: user1.id, status: "delivered" });
  await storage.createOrder({ tenantId: tenant1.id, locationId: loc2.id, userId: user2.id, status: "processing" });
  await storage.createOrder({ tenantId: tenant1.id, locationId: loc3.id, userId: user3.id, status: "pending" });
  await storage.createOrder({ tenantId: tenant1.id, locationId: loc1.id, userId: user4.id, status: "shipped" });
  await storage.createOrder({ tenantId: tenant1.id, locationId: loc4.id, userId: user1.id, status: "cancelled" });

  console.log("Database seeded successfully");
}
