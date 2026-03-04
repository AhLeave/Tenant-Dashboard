import { pgTable, text, integer, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const roleEnum = pgEnum("user_role", ["SUPER_ADMIN", "TENANT_ADMIN", "WARD_MANAGER", "WAREHOUSE"]);

export const orderStatusEnum = pgEnum("order_status", ["pending", "processing", "shipped", "delivered", "cancelled", "printed", "fulfilled"]);

export const tenants = pgTable("tenants", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  subdomain: text("subdomain").notNull().unique(),
  cutoffTime: text("cutoff_time").notNull().default("07:00"),
  orderOpenTime: text("order_open_time").notNull().default("12:00"),
});

export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  role: roleEnum("role").notNull().default("WAREHOUSE"),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
});

export const locations = pgTable("locations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
});

export const products = pgTable("products", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  sku: text("sku").notNull(),
  price: integer("price").notNull(),
  group: text("group"),
});

export const productAvailabilities = pgTable("product_availabilities", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  locationId: integer("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
});

export const orders = pgTable("orders", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  locationId: integer("location_id").notNull().references(() => locations.id),
  userId: integer("user_id").notNull().references(() => users.id),
  status: orderStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const orderItems = pgTable("order_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id),
  quantity: integer("quantity").notNull(),
});

export const standingOrders = pgTable("standing_orders", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  locationId: integer("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  dayOfWeek: integer("day_of_week"),
});

export const standingOrderItems = pgTable("standing_order_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  standingOrderId: integer("standing_order_id").notNull().references(() => standingOrders.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
});

export const reportSchedules = pgTable("report_schedules", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  reportType: text("report_type").notNull().default("INVOICING"),
  frequency: text("frequency").notNull().default("MONTHLY"),
  recipientEmails: text("recipient_emails").array().notNull(),
  nextRunDate: timestamp("next_run_date").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertStandingOrderSchema = createInsertSchema(standingOrders).omit({ id: true });
export const insertStandingOrderItemSchema = createInsertSchema(standingOrderItems).omit({ id: true });
export const insertProductAvailabilitySchema = createInsertSchema(productAvailabilities).omit({ id: true });
export const insertReportScheduleSchema = createInsertSchema(reportSchedules).omit({ id: true, createdAt: true });

export const insertTenantSchema = createInsertSchema(tenants).omit({ id: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertLocationSchema = createInsertSchema(locations).omit({ id: true });
export const insertProductSchema = createInsertSchema(products).omit({ id: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true });
export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true });

export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;

export type ProductAvailability = typeof productAvailabilities.$inferSelect;
export type InsertProductAvailability = z.infer<typeof insertProductAvailabilitySchema>;

export type Tenant = typeof tenants.$inferSelect;
export type User = typeof users.$inferSelect;
export type Location = typeof locations.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;

export type InsertReportSchedule = z.infer<typeof insertReportScheduleSchema>;
export type ReportSchedule = typeof reportSchedules.$inferSelect;

export type InsertStandingOrder = z.infer<typeof insertStandingOrderSchema>;
export type InsertStandingOrderItem = z.infer<typeof insertStandingOrderItemSchema>;
export type StandingOrder = typeof standingOrders.$inferSelect;
export type StandingOrderItem = typeof standingOrderItems.$inferSelect;

export type StandingOrderWithItems = StandingOrder & {
  items: (StandingOrderItem & { productName: string; sku: string })[];
};

export type InvoicingItem = {
  productId: number;
  productName: string;
  sku: string;
  unitPrice: number;
  totalQuantity: number;
  lineTotal: number;
};

export type InvoicingLocation = {
  locationId: number;
  locationName: string;
  totalOrders: number;
  totalAmount: number;
  items: InvoicingItem[];
};

export type WarehouseOrderItem = {
  id: number;
  productId: number;
  quantity: number;
  sku: string;
  productName: string;
};

export type WarehouseOrder = {
  id: number;
  tenantId: number;
  locationId: number;
  locationName: string;
  userId: number;
  userEmail: string;
  status: string;
  createdAt: Date;
  items: WarehouseOrderItem[];
};
