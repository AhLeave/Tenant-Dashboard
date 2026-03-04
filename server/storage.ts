import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  type Tenant, type InsertTenant, tenants,
  type User, type InsertUser, users,
  type Location, type InsertLocation, locations,
  type Product, type InsertProduct, products,
  type Order, type InsertOrder, orders,
  type OrderItem, type InsertOrderItem, orderItems,
  type InsertProductAvailability, productAvailabilities,
} from "@shared/schema";

export interface IStorage {
  getTenants(): Promise<Tenant[]>;
  getTenant(id: number): Promise<Tenant | undefined>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;

  getUsersByTenant(tenantId: number): Promise<User[]>;
  getUser(id: number): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getLocationsByTenant(tenantId: number): Promise<Location[]>;
  getLocation(id: number): Promise<Location | undefined>;
  createLocation(location: InsertLocation): Promise<Location>;
  updateLocation(locationId: number, data: { name: string }): Promise<Location>;
  deleteLocation(locationId: number): Promise<{ success: boolean; message?: string }>;

  getProductsByTenant(tenantId: number): Promise<Product[]>;
  getProductsByLocation(tenantId: number, locationId: number): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  bulkCreateProducts(products: InsertProduct[]): Promise<Product[]>;
  bulkCreateProductAvailabilities(entries: InsertProductAvailability[]): Promise<void>;

  getProductLocations(productId: number): Promise<number[]>;
  createProductWithLocations(product: InsertProduct, locationIds: number[]): Promise<Product>;
  updateProductWithLocations(productId: number, data: Partial<InsertProduct>, locationIds: number[]): Promise<Product>;
  deleteProductById(productId: number): Promise<{ success: boolean; message?: string }>;

  getOrdersByTenant(tenantId: number): Promise<Order[]>;
  getOrdersByLocation(tenantId: number, locationId: number): Promise<Order[]>;
  getOrder(id: number): Promise<Order | undefined>;
  createOrder(order: InsertOrder): Promise<Order>;

  getOrderItemsByOrder(orderId: number): Promise<OrderItem[]>;
  createOrderItem(item: InsertOrderItem): Promise<OrderItem>;
}

const db = drizzle(process.env.DATABASE_URL!);

export class DatabaseStorage implements IStorage {
  async getTenants(): Promise<Tenant[]> {
    return db.select().from(tenants);
  }

  async getTenant(id: number): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant;
  }

  async createTenant(tenant: InsertTenant): Promise<Tenant> {
    const [created] = await db.insert(tenants).values(tenant).returning();
    return created;
  }

  async getUsersByTenant(tenantId: number): Promise<User[]> {
    return db.select().from(users).where(eq(users.tenantId, tenantId));
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async getLocationsByTenant(tenantId: number): Promise<Location[]> {
    return db.select().from(locations).where(eq(locations.tenantId, tenantId));
  }

  async getLocation(id: number): Promise<Location | undefined> {
    const [location] = await db.select().from(locations).where(eq(locations.id, id));
    return location;
  }

  async createLocation(location: InsertLocation): Promise<Location> {
    const [created] = await db.insert(locations).values(location).returning();
    return created;
  }

  async updateLocation(locationId: number, data: { name: string }): Promise<Location> {
    const [updated] = await db
      .update(locations)
      .set(data)
      .where(eq(locations.id, locationId))
      .returning();
    return updated;
  }

  async deleteLocation(locationId: number): Promise<{ success: boolean; message?: string }> {
    const existingOrders = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.locationId, locationId))
      .limit(1);

    if (existingOrders.length > 0) {
      return {
        success: false,
        message: "Cannot delete location with existing orders.",
      };
    }

    await db.delete(productAvailabilities).where(eq(productAvailabilities.locationId, locationId));
    await db.delete(locations).where(eq(locations.id, locationId));
    return { success: true };
  }

  async getProductsByTenant(tenantId: number): Promise<Product[]> {
    return db.select().from(products).where(eq(products.tenantId, tenantId));
  }

  async getProductsByLocation(tenantId: number, locationId: number): Promise<Product[]> {
    return db
      .select({
        id: products.id,
        tenantId: products.tenantId,
        name: products.name,
        sku: products.sku,
        price: products.price,
        group: products.group,
      })
      .from(products)
      .innerJoin(productAvailabilities, eq(products.id, productAvailabilities.productId))
      .where(and(eq(products.tenantId, tenantId), eq(productAvailabilities.locationId, locationId)))
      .orderBy(products.name);
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [created] = await db.insert(products).values(product).returning();
    return created;
  }

  async bulkCreateProducts(productList: InsertProduct[]): Promise<Product[]> {
    if (productList.length === 0) return [];
    return db.insert(products).values(productList).returning();
  }

  async bulkCreateProductAvailabilities(entries: InsertProductAvailability[]): Promise<void> {
    if (entries.length === 0) return;
    const BATCH = 200;
    for (let i = 0; i < entries.length; i += BATCH) {
      await db.insert(productAvailabilities).values(entries.slice(i, i + BATCH));
    }
  }

  async getProductLocations(productId: number): Promise<number[]> {
    const rows = await db
      .select({ locationId: productAvailabilities.locationId })
      .from(productAvailabilities)
      .where(eq(productAvailabilities.productId, productId));
    return rows.map((r) => r.locationId);
  }

  async createProductWithLocations(product: InsertProduct, locationIds: number[]): Promise<Product> {
    const [created] = await db.insert(products).values(product).returning();
    if (locationIds.length > 0) {
      await db.insert(productAvailabilities).values(
        locationIds.map((locationId) => ({ productId: created.id, locationId }))
      );
    }
    return created;
  }

  async updateProductWithLocations(
    productId: number,
    data: Partial<InsertProduct>,
    locationIds: number[]
  ): Promise<Product> {
    const [updated] = await db
      .update(products)
      .set(data)
      .where(eq(products.id, productId))
      .returning();
    await db.delete(productAvailabilities).where(eq(productAvailabilities.productId, productId));
    if (locationIds.length > 0) {
      await db.insert(productAvailabilities).values(
        locationIds.map((locationId) => ({ productId, locationId }))
      );
    }
    return updated;
  }

  async deleteProductById(productId: number): Promise<{ success: boolean; message?: string }> {
    const refs = await db
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(eq(orderItems.productId, productId))
      .limit(1);

    if (refs.length > 0) {
      return {
        success: false,
        message: "This product is referenced by existing orders and cannot be deleted.",
      };
    }

    await db.delete(products).where(eq(products.id, productId));
    return { success: true };
  }

  async getOrdersByTenant(tenantId: number): Promise<Order[]> {
    return db.select().from(orders).where(eq(orders.tenantId, tenantId));
  }

  async getOrdersByLocation(tenantId: number, locationId: number): Promise<Order[]> {
    return db
      .select()
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), eq(orders.locationId, locationId)));
  }

  async getOrder(id: number): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order;
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const [created] = await db.insert(orders).values(order).returning();
    return created;
  }

  async getOrderItemsByOrder(orderId: number): Promise<OrderItem[]> {
    return db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  }

  async createOrderItem(item: InsertOrderItem): Promise<OrderItem> {
    const [created] = await db.insert(orderItems).values(item).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
