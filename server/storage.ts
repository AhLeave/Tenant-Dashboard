import { eq, and, isNull, inArray, gte, lte, isNotNull, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  type Tenant, type InsertTenant, tenants,
  type User, type InsertUser, users,
  type Location, type InsertLocation, locations,
  type Product, type InsertProduct, products,
  type Order, type InsertOrder, orders,
  type OrderItem, type InsertOrderItem, orderItems,
  type InsertProductAvailability, productAvailabilities,
  type WarehouseOrder,
} from "@shared/schema";

export type UserWithTenant = User & { tenantName: string };

export type ReportFilters = {
  startDate?: string;
  endDate?: string;
  locationIds?: number[];
  productGroups?: string[];
  statuses?: string[];
};

export type ReportRow = {
  orderId: number;
  date: Date;
  locationName: string;
  productName: string;
  sku: string;
  group: string | null;
  quantity: number;
  status: string;
};

export interface IStorage {
  getTenants(): Promise<Tenant[]>;
  getTenant(id: number): Promise<Tenant | undefined>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;
  updateTenant(id: number, data: Partial<InsertTenant>): Promise<Tenant>;
  deleteTenant(id: number): Promise<{ success: boolean; message?: string }>;

  getUsersByTenant(tenantId: number): Promise<User[]>;
  getGlobalSuperAdmins(): Promise<User[]>;
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: Omit<InsertUser, 'tenantId'> & { tenantId?: number | null }): Promise<User>;
  getAllUsersWithTenant(): Promise<UserWithTenant[]>;
  updateUser(id: number, data: Partial<InsertUser> & { tenantId?: number | null }): Promise<User>;
  deleteUser(id: number): Promise<void>;

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

  getWarehouseOrders(tenantId: number): Promise<WarehouseOrder[]>;
  markOrderPrinted(orderId: number): Promise<Order>;
  markOrderFulfilled(orderId: number): Promise<Order>;

  getProductGroups(tenantId: number): Promise<string[]>;
  getOrderReport(tenantId: number, filters: ReportFilters): Promise<ReportRow[]>;
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

  async getGlobalSuperAdmins(): Promise<User[]> {
    return db.select().from(users).where(
      and(eq(users.role, "SUPER_ADMIN"), isNull(users.tenantId))
    );
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(user: Omit<InsertUser, 'tenantId'> & { tenantId?: number | null }): Promise<User> {
    const [created] = await db.insert(users).values(user as InsertUser).returning();
    return created;
  }

  async getAllUsersWithTenant(): Promise<UserWithTenant[]> {
    const rows = await db
      .select({
        id: users.id,
        tenantId: users.tenantId,
        role: users.role,
        email: users.email,
        passwordHash: users.passwordHash,
        tenantName: tenants.name,
      })
      .from(users)
      .leftJoin(tenants, eq(users.tenantId, tenants.id))
      .orderBy(users.id);
    return rows.map((r) => ({
      ...r,
      tenantName: r.tenantName ?? (r.role === "SUPER_ADMIN" ? "Global (All Tenants)" : "Unknown"),
    }));
  }

  async updateUser(id: number, data: Partial<InsertUser> & { tenantId?: number | null }): Promise<User> {
    const [updated] = await db
      .update(users)
      .set(data as Partial<InsertUser>)
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  async deleteUser(id: number): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async updateTenant(id: number, data: Partial<InsertTenant>): Promise<Tenant> {
    const [updated] = await db
      .update(tenants)
      .set(data)
      .where(eq(tenants.id, id))
      .returning();
    return updated;
  }

  async deleteTenant(id: number): Promise<{ success: boolean; message?: string }> {
    const [userCount] = await db
      .select({ count: users.id })
      .from(users)
      .where(eq(users.tenantId, id))
      .limit(1);
    if (userCount) {
      return { success: false, message: "Cannot delete tenant with existing users. Remove all users first." };
    }
    const [locationCount] = await db
      .select({ count: locations.id })
      .from(locations)
      .where(eq(locations.tenantId, id))
      .limit(1);
    if (locationCount) {
      return { success: false, message: "Cannot delete tenant with existing locations. Remove all locations first." };
    }
    const [productCount] = await db
      .select({ count: products.id })
      .from(products)
      .where(eq(products.tenantId, id))
      .limit(1);
    if (productCount) {
      return { success: false, message: "Cannot delete tenant with existing products. Remove all products first." };
    }
    await db.delete(tenants).where(eq(tenants.id, id));
    return { success: true };
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

  async getWarehouseOrders(tenantId: number): Promise<WarehouseOrder[]> {
    const activeOrders = await db
      .select({
        id: orders.id,
        tenantId: orders.tenantId,
        locationId: orders.locationId,
        locationName: locations.name,
        userId: orders.userId,
        userEmail: users.email,
        status: orders.status,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .innerJoin(locations, eq(orders.locationId, locations.id))
      .innerJoin(users, eq(orders.userId, users.id))
      .where(and(eq(orders.tenantId, tenantId), inArray(orders.status, ["pending", "printed"])))
      .orderBy(orders.createdAt);

    if (activeOrders.length === 0) return [];

    const orderIds = activeOrders.map((o) => o.id);
    const itemRows = await db
      .select({
        id: orderItems.id,
        orderId: orderItems.orderId,
        productId: orderItems.productId,
        quantity: orderItems.quantity,
        sku: products.sku,
        productName: products.name,
      })
      .from(orderItems)
      .innerJoin(products, eq(orderItems.productId, products.id))
      .where(inArray(orderItems.orderId, orderIds));

    const itemsByOrder = new Map<number, typeof itemRows>();
    for (const item of itemRows) {
      if (!itemsByOrder.has(item.orderId)) itemsByOrder.set(item.orderId, []);
      itemsByOrder.get(item.orderId)!.push(item);
    }

    return activeOrders.map((order) => ({
      ...order,
      items: (itemsByOrder.get(order.id) ?? []).map((i) => ({
        id: i.id,
        productId: i.productId,
        quantity: i.quantity,
        sku: i.sku,
        productName: i.productName,
      })),
    }));
  }

  async markOrderPrinted(orderId: number): Promise<Order> {
    const [updated] = await db
      .update(orders)
      .set({ status: "printed" })
      .where(and(eq(orders.id, orderId), eq(orders.status, "pending")))
      .returning();
    if (!updated) {
      const [current] = await db.select().from(orders).where(eq(orders.id, orderId));
      return current;
    }
    return updated;
  }

  async markOrderFulfilled(orderId: number): Promise<Order> {
    const [updated] = await db
      .update(orders)
      .set({ status: "fulfilled" })
      .where(eq(orders.id, orderId))
      .returning();
    return updated;
  }

  async getProductGroups(tenantId: number): Promise<string[]> {
    const rows = await db
      .selectDistinct({ group: products.group })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), isNotNull(products.group)));
    return rows
      .map(r => r.group!)
      .filter(Boolean)
      .sort();
  }

  async getOrderReport(tenantId: number, filters: ReportFilters): Promise<ReportRow[]> {
    const conditions: ReturnType<typeof eq>[] = [eq(orders.tenantId, tenantId) as any];

    if (filters.startDate) {
      const start = new Date(filters.startDate);
      start.setHours(0, 0, 0, 0);
      conditions.push(gte(orders.createdAt, start) as any);
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(orders.createdAt, end) as any);
    }
    if (filters.locationIds && filters.locationIds.length > 0) {
      conditions.push(inArray(orders.locationId, filters.locationIds) as any);
    }
    if (filters.statuses && filters.statuses.length > 0) {
      conditions.push(inArray(orders.status, filters.statuses as any) as any);
    }
    if (filters.productGroups && filters.productGroups.length > 0) {
      conditions.push(inArray(products.group, filters.productGroups) as any);
    }

    const rows = await db
      .select({
        orderId: orders.id,
        date: orders.createdAt,
        locationName: locations.name,
        productName: products.name,
        sku: products.sku,
        group: products.group,
        quantity: orderItems.quantity,
        status: orders.status,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(products, eq(orderItems.productId, products.id))
      .innerJoin(locations, eq(orders.locationId, locations.id))
      .where(and(...(conditions as any[])))
      .orderBy(asc(orders.createdAt));

    return rows;
  }
}

export const storage = new DatabaseStorage();
