import { eq, and, isNull, inArray, gte, lte, isNotNull, asc, count } from "drizzle-orm";
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
  type ReportSchedule, type InsertReportSchedule, reportSchedules,
  type InvoicingLocation,
  type StandingOrderWithItems, type InsertStandingOrder, type InsertStandingOrderItem,
  standingOrders, standingOrderItems,
} from "@shared/schema";

export type UserWithTenant = User & { tenantName: string };

export type TenantWithStats = Tenant & { activeOrderCount: number };

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
  getTenantBySubdomain(subdomain: string): Promise<Tenant | undefined>;
  getTenantsWithStats(): Promise<TenantWithStats[]>;
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
  clearTenantProducts(tenantId: number): Promise<void>;

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
  getInvoicingData(tenantId: number, startDate?: string, endDate?: string): Promise<InvoicingLocation[]>;
  getReportSchedules(tenantId: number): Promise<ReportSchedule[]>;
  createReportSchedule(data: InsertReportSchedule): Promise<ReportSchedule>;
  deleteReportSchedule(id: number): Promise<void>;
  updateReportScheduleNextRun(id: number, nextRunDate: Date): Promise<void>;
  getSchedulesDue(): Promise<ReportSchedule[]>;

  getStandingOrders(tenantId: number, locationId: number): Promise<StandingOrderWithItems[]>;
  createStandingOrder(data: InsertStandingOrder, items: InsertStandingOrderItem[]): Promise<StandingOrderWithItems>;
  deleteStandingOrder(id: number): Promise<void>;
}

const db = drizzle(process.env.DATABASE_URL!);

export class DatabaseStorage implements IStorage {
  async getTenants(): Promise<Tenant[]> {
    return db.select().from(tenants);
  }

  async getTenantBySubdomain(subdomain: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.subdomain, subdomain));
    return tenant;
  }

  async getTenantsWithStats(): Promise<TenantWithStats[]> {
    const allTenants = await db.select().from(tenants).orderBy(asc(tenants.name));
    const orderCounts = await db
      .select({ tenantId: orders.tenantId, cnt: count(orders.id) })
      .from(orders)
      .where(inArray(orders.status, ["pending", "printed"] as const))
      .groupBy(orders.tenantId);
    const countMap = new Map(orderCounts.map(r => [r.tenantId, Number(r.cnt)]));
    return allTenants.map(tenant => ({ ...tenant, activeOrderCount: countMap.get(tenant.id) ?? 0 }));
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

  async clearTenantProducts(tenantId: number): Promise<void> {
    const tenantProducts = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.tenantId, tenantId));
    if (tenantProducts.length === 0) return;
    const ids = tenantProducts.map((p) => p.id);
    await db.delete(productAvailabilities).where(inArray(productAvailabilities.productId, ids));
    await db.delete(products).where(eq(products.tenantId, tenantId));
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

  async getInvoicingData(tenantId: number, startDate?: string, endDate?: string): Promise<InvoicingLocation[]> {
    const conditions: any[] = [
      eq(orders.tenantId, tenantId),
      eq(orders.status, "fulfilled" as any),
    ];
    if (startDate) {
      conditions.push(gte(orders.createdAt, new Date(startDate)));
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(orders.createdAt, end));
    }

    const rows = await db
      .select({
        orderId: orders.id,
        locationId: locations.id,
        locationName: locations.name,
        productId: products.id,
        productName: products.name,
        sku: products.sku,
        unitPrice: products.price,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(products, eq(orderItems.productId, products.id))
      .innerJoin(locations, eq(orders.locationId, locations.id))
      .where(and(...conditions))
      .orderBy(asc(locations.name));

    const locMap = new Map<number, InvoicingLocation>();
    const ordersByLoc = new Map<number, Set<number>>();

    for (const row of rows) {
      if (!locMap.has(row.locationId)) {
        locMap.set(row.locationId, {
          locationId: row.locationId,
          locationName: row.locationName,
          totalOrders: 0,
          totalAmount: 0,
          items: [],
        });
        ordersByLoc.set(row.locationId, new Set());
      }
      const loc = locMap.get(row.locationId)!;
      ordersByLoc.get(row.locationId)!.add(row.orderId);

      const lineTotal = row.unitPrice * row.quantity;
      loc.totalAmount += lineTotal;

      const existing = loc.items.find(i => i.productId === row.productId);
      if (existing) {
        existing.totalQuantity += row.quantity;
        existing.lineTotal += lineTotal;
      } else {
        loc.items.push({
          productId: row.productId,
          productName: row.productName,
          sku: row.sku,
          unitPrice: row.unitPrice,
          totalQuantity: row.quantity,
          lineTotal,
        });
      }
    }

    for (const [locId, loc] of locMap) {
      loc.totalOrders = ordersByLoc.get(locId)?.size ?? 0;
    }

    return Array.from(locMap.values());
  }

  async getReportSchedules(tenantId: number): Promise<ReportSchedule[]> {
    return db.select().from(reportSchedules).where(eq(reportSchedules.tenantId, tenantId)).orderBy(asc(reportSchedules.createdAt));
  }

  async createReportSchedule(data: InsertReportSchedule): Promise<ReportSchedule> {
    const [created] = await db.insert(reportSchedules).values(data).returning();
    return created;
  }

  async deleteReportSchedule(id: number): Promise<void> {
    await db.delete(reportSchedules).where(eq(reportSchedules.id, id));
  }

  async updateReportScheduleNextRun(id: number, nextRunDate: Date): Promise<void> {
    await db.update(reportSchedules).set({ nextRunDate }).where(eq(reportSchedules.id, id));
  }

  async getSchedulesDue(): Promise<ReportSchedule[]> {
    return db.select().from(reportSchedules).where(lte(reportSchedules.nextRunDate, new Date()));
  }

  async getStandingOrders(tenantId: number, locationId: number): Promise<StandingOrderWithItems[]> {
    const orders = await db
      .select()
      .from(standingOrders)
      .where(and(eq(standingOrders.tenantId, tenantId), eq(standingOrders.locationId, locationId)))
      .orderBy(asc(standingOrders.name));

    if (orders.length === 0) return [];

    const orderIds = orders.map(o => o.id);
    const itemRows = await db
      .select({
        id: standingOrderItems.id,
        standingOrderId: standingOrderItems.standingOrderId,
        productId: standingOrderItems.productId,
        quantity: standingOrderItems.quantity,
        productName: products.name,
        sku: products.sku,
      })
      .from(standingOrderItems)
      .innerJoin(products, eq(standingOrderItems.productId, products.id))
      .where(inArray(standingOrderItems.standingOrderId, orderIds));

    const itemsByOrderId = new Map<number, typeof itemRows>();
    for (const item of itemRows) {
      if (!itemsByOrderId.has(item.standingOrderId)) itemsByOrderId.set(item.standingOrderId, []);
      itemsByOrderId.get(item.standingOrderId)!.push(item);
    }

    return orders.map(o => ({
      ...o,
      items: itemsByOrderId.get(o.id) ?? [],
    }));
  }

  async createStandingOrder(data: InsertStandingOrder, items: InsertStandingOrderItem[]): Promise<StandingOrderWithItems> {
    const [order] = await db.insert(standingOrders).values(data).returning();
    const itemsWithId = items.map(i => ({
      standingOrderId: order.id,
      productId: i.productId,
      quantity: i.quantity,
    }));
    const insertedItems = await db.insert(standingOrderItems).values(itemsWithId).returning();

    const productIds = insertedItems.map(i => i.productId);
    const prods = await db.select().from(products).where(inArray(products.id, productIds));
    const prodMap = new Map(prods.map(p => [p.id, p]));

    return {
      ...order,
      items: insertedItems.map(i => ({
        ...i,
        productName: prodMap.get(i.productId)?.name ?? "",
        sku: prodMap.get(i.productId)?.sku ?? "",
      })),
    };
  }

  async deleteStandingOrder(id: number): Promise<void> {
    await db.delete(standingOrders).where(eq(standingOrders.id, id));
  }
}

export const storage = new DatabaseStorage();
