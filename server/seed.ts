import { storage } from "./storage";
import { drizzle } from "drizzle-orm/node-postgres";
import { tenants, users, locations, products, orders } from "@shared/schema";

const db = drizzle(process.env.DATABASE_URL!);

export async function seedDatabase() {
  let [tenant1, tenant2] = await db.select().from(tenants);

  if (!tenant1) {
    tenant1 = await storage.createTenant({ name: "Acme Healthcare", logoUrl: null, subdomain: "acme-health", cutoffTime: "07:00" });
    tenant2 = await storage.createTenant({ name: "MedSupply Corp", logoUrl: null, subdomain: "medsupply", cutoffTime: "09:30" });
  } else if (tenant1 && !tenant2) {
    tenant2 = await storage.createTenant({ name: "MedSupply Corp", logoUrl: null, subdomain: "medsupply", cutoffTime: "09:30" });
  }

  const existingUsers = await db.select().from(users);
  let user1: any, user2: any, user3: any, user4: any;
  if (existingUsers.length === 0) {
    user1 = await storage.createUser({ tenantId: tenant1.id, role: "SUPER_ADMIN", email: "admin@acmehealth.com" });
    user2 = await storage.createUser({ tenantId: tenant1.id, role: "TENANT_ADMIN", email: "manager@acmehealth.com" });
    user3 = await storage.createUser({ tenantId: tenant1.id, role: "WARD_MANAGER", email: "ward@acmehealth.com" });
    user4 = await storage.createUser({ tenantId: tenant1.id, role: "WAREHOUSE", email: "warehouse@acmehealth.com" });
    await storage.createUser({ tenantId: tenant2.id, role: "SUPER_ADMIN", email: "admin@medsupply.com" });
    await storage.createUser({ tenantId: tenant2.id, role: "TENANT_ADMIN", email: "ops@medsupply.com" });
  } else {
    [user1, user2, user3, user4] = existingUsers;
  }

  let [loc1, loc2, loc3, loc4] = await db.select().from(locations).limit(4);
  if (!loc1) {
    loc1 = await storage.createLocation({ tenantId: tenant1.id, name: "Main Hospital - Floor 1" });
    loc2 = await storage.createLocation({ tenantId: tenant1.id, name: "East Wing Pharmacy" });
    loc3 = await storage.createLocation({ tenantId: tenant1.id, name: "Central Warehouse" });
    loc4 = await storage.createLocation({ tenantId: tenant1.id, name: "ICU Supply Room" });
    await storage.createLocation({ tenantId: tenant2.id, name: "Distribution Center A" });
    await storage.createLocation({ tenantId: tenant2.id, name: "Distribution Center B" });
  }

  let [prod1, prod2, prod3, prod4, prod5] = await db.select().from(products).limit(5);
  if (!prod1) {
    prod1 = await storage.createProduct({ tenantId: tenant1.id, name: "Surgical Gloves (Box)", sku: "SG-001", price: 2499 });
    prod2 = await storage.createProduct({ tenantId: tenant1.id, name: "Disposable Syringes (100pk)", sku: "DS-100", price: 4599 });
    prod3 = await storage.createProduct({ tenantId: tenant1.id, name: "N95 Respirator Masks (50pk)", sku: "N95-050", price: 8999 });
    prod4 = await storage.createProduct({ tenantId: tenant1.id, name: "Sterile Bandages (Roll)", sku: "SB-010", price: 1299 });
    prod5 = await storage.createProduct({ tenantId: tenant1.id, name: "IV Fluid Bags (1L)", sku: "IV-1000", price: 3750 });
    await storage.createProduct({ tenantId: tenant2.id, name: "Blood Pressure Monitor", sku: "BP-200", price: 12999 });
    await storage.createProduct({ tenantId: tenant2.id, name: "Digital Thermometer", sku: "DT-050", price: 2499 });
  }

  const existingOrders = await db.select().from(orders);
  if (existingOrders.length === 0) {
    const ord1 = await storage.createOrder({ tenantId: tenant1.id, locationId: loc1.id, userId: user1.id, status: "delivered" });
    const ord2 = await storage.createOrder({ tenantId: tenant1.id, locationId: loc2.id, userId: user2.id, status: "processing" });
    const ord3 = await storage.createOrder({ tenantId: tenant1.id, locationId: loc3.id, userId: user3.id, status: "pending" });
    const ord4 = await storage.createOrder({ tenantId: tenant1.id, locationId: loc1.id, userId: user4.id, status: "shipped" });
    const ord5 = await storage.createOrder({ tenantId: tenant1.id, locationId: loc4.id, userId: user1.id, status: "cancelled" });

    await storage.createOrderItem({ orderId: ord1.id, productId: prod1.id, quantity: 5 });
    await storage.createOrderItem({ orderId: ord1.id, productId: prod3.id, quantity: 2 });
    await storage.createOrderItem({ orderId: ord2.id, productId: prod2.id, quantity: 10 });
    await storage.createOrderItem({ orderId: ord2.id, productId: prod4.id, quantity: 4 });
    await storage.createOrderItem({ orderId: ord3.id, productId: prod5.id, quantity: 8 });
    await storage.createOrderItem({ orderId: ord4.id, productId: prod1.id, quantity: 3 });
    await storage.createOrderItem({ orderId: ord4.id, productId: prod2.id, quantity: 6 });
    await storage.createOrderItem({ orderId: ord5.id, productId: prod3.id, quantity: 1 });
  }

  console.log("Database seeded successfully");
}
