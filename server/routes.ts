import { z } from "zod";
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTenantSchema, insertUserSchema, insertLocationSchema, insertProductSchema, insertOrderSchema, insertOrderItemSchema } from "@shared/schema";
import bcrypt from "bcryptjs";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/tenants", async (_req, res) => {
    const tenantList = await storage.getTenants();
    res.json(tenantList);
  });

  app.get("/api/tenants/:id", async (req, res) => {
    const tenant = await storage.getTenant(Number(req.params.id));
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });
    res.json(tenant);
  });

  app.post("/api/tenants", async (req, res) => {
    const parsed = insertTenantSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const tenant = await storage.createTenant(parsed.data);
    res.status(201).json(tenant);
  });

  app.get("/api/tenants/:tenantId/users", async (req, res) => {
    const userList = await storage.getUsersByTenant(Number(req.params.tenantId));
    res.json(userList);
  });

  app.post("/api/tenants/:tenantId/users", async (req, res) => {
    const parsed = insertUserSchema.safeParse({ ...req.body, tenantId: Number(req.params.tenantId) });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const user = await storage.createUser(parsed.data);
    res.status(201).json(user);
  });

  app.get("/api/tenants/:tenantId/locations", async (req, res) => {
    const locs = await storage.getLocationsByTenant(Number(req.params.tenantId));
    res.json(locs);
  });

  app.post("/api/tenants/:tenantId/locations", async (req, res) => {
    const parsed = insertLocationSchema.safeParse({ ...req.body, tenantId: Number(req.params.tenantId) });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const location = await storage.createLocation(parsed.data);
    res.status(201).json(location);
  });

  app.put("/api/tenants/:tenantId/admin/locations/:locationId", async (req, res) => {
    const locationId = Number(req.params.locationId);
    const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const location = await storage.updateLocation(locationId, parsed.data);
    res.json(location);
  });

  app.delete("/api/tenants/:tenantId/admin/locations/:locationId", async (req, res) => {
    const result = await storage.deleteLocation(Number(req.params.locationId));
    if (!result.success) return res.status(409).json({ message: result.message });
    res.status(204).send();
  });

  app.get("/api/tenants/:tenantId/products", async (req, res) => {
    const tenantId = Number(req.params.tenantId);
    const locationId = req.query.locationId;
    if (locationId) {
      const prods = await storage.getProductsByLocation(tenantId, Number(locationId));
      res.json(prods);
    } else {
      const prods = await storage.getProductsByTenant(tenantId);
      res.json(prods);
    }
  });

  app.post("/api/tenants/:tenantId/products", async (req, res) => {
    const parsed = insertProductSchema.safeParse({ ...req.body, tenantId: Number(req.params.tenantId) });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const product = await storage.createProduct(parsed.data);
    res.status(201).json(product);
  });

  app.post("/api/tenants/:tenantId/products/bulk", async (req, res) => {
    const tenantId = Number(req.params.tenantId);
    const { products: rawProducts } = req.body;
    if (!Array.isArray(rawProducts) || rawProducts.length === 0) {
      return res.status(400).json({ message: "products must be a non-empty array" });
    }
    const validated = [];
    for (const item of rawProducts) {
      const parsed = insertProductSchema.safeParse({ ...item, tenantId });
      if (!parsed.success) {
        return res.status(400).json({ message: `Invalid product: ${parsed.error.message}` });
      }
      validated.push(parsed.data);
    }
    const inserted = await storage.bulkCreateProducts(validated);
    res.status(201).json({ count: inserted.length, products: inserted });
  });

  app.get("/api/tenants/:tenantId/products/:productId/locations", async (req, res) => {
    const locationIds = await storage.getProductLocations(Number(req.params.productId));
    res.json(locationIds);
  });

  const adminProductSchema = insertProductSchema.omit({ tenantId: true }).extend({
    locationIds: z.array(z.number()).default([]),
  });

  app.post("/api/tenants/:tenantId/admin/products", async (req, res) => {
    const tenantId = Number(req.params.tenantId);
    const parsed = adminProductSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const { locationIds, ...productData } = parsed.data;
    const product = await storage.createProductWithLocations({ ...productData, tenantId }, locationIds);
    res.status(201).json(product);
  });

  app.put("/api/tenants/:tenantId/admin/products/:productId", async (req, res) => {
    const productId = Number(req.params.productId);
    const parsed = adminProductSchema.partial().extend({ locationIds: z.array(z.number()).default([]) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const { locationIds, ...productData } = parsed.data;
    const product = await storage.updateProductWithLocations(productId, productData, locationIds);
    res.json(product);
  });

  app.delete("/api/tenants/:tenantId/admin/products/:productId", async (req, res) => {
    const result = await storage.deleteProductById(Number(req.params.productId));
    if (!result.success) return res.status(409).json({ message: result.message });
    res.status(204).send();
  });

  app.get("/api/tenants/:tenantId/warehouse/orders", async (req, res) => {
    const tenantId = Number(req.params.tenantId);
    const warehouseOrders = await storage.getWarehouseOrders(tenantId);
    res.json(warehouseOrders);
  });

  app.patch("/api/orders/:orderId/print", async (req, res) => {
    const orderId = Number(req.params.orderId);
    const order = await storage.markOrderPrinted(orderId);
    res.json(order);
  });

  app.patch("/api/orders/:orderId/fulfill", async (req, res) => {
    const orderId = Number(req.params.orderId);
    const order = await storage.markOrderFulfilled(orderId);
    res.json(order);
  });

  app.get("/api/tenants/:tenantId/orders", async (req, res) => {
    const locationId = req.query.locationId;
    const tenantId = Number(req.params.tenantId);
    if (locationId) {
      const ords = await storage.getOrdersByLocation(tenantId, Number(locationId));
      res.json(ords);
    } else {
      const ords = await storage.getOrdersByTenant(tenantId);
      res.json(ords);
    }
  });

  app.post("/api/tenants/:tenantId/orders", async (req, res) => {
    const parsed = insertOrderSchema.safeParse({ ...req.body, tenantId: Number(req.params.tenantId) });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const order = await storage.createOrder(parsed.data);
    res.status(201).json(order);
  });

  app.post("/api/tenants/:tenantId/orders/checkout", async (req, res) => {
    const tenantId = Number(req.params.tenantId);
    const { locationId, items } = req.body;

    if (!locationId) {
      return res.status(400).json({ message: "A location must be selected to place an order." });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Cart is empty." });
    }

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });

    const [openHour, openMinute] = tenant.orderOpenTime.split(":").map(Number);
    const [cutoffHour, cutoffMinute] = tenant.cutoffTime.split(":").map(Number);
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const openMinutes = openHour * 60 + openMinute;
    const cutoffMinutes = cutoffHour * 60 + cutoffMinute;

    let isOpen: boolean;
    if (openMinutes < cutoffMinutes) {
      isOpen = currentMinutes >= openMinutes && currentMinutes < cutoffMinutes;
    } else {
      isOpen = currentMinutes >= openMinutes || currentMinutes < cutoffMinutes;
    }

    if (!isOpen) {
      return res.status(422).json({
        message: `Ordering is currently closed. Orders can only be placed between ${tenant.orderOpenTime} and ${tenant.cutoffTime}.`,
      });
    }

    const users = await storage.getUsersByTenant(tenantId);
    if (users.length === 0) {
      return res.status(400).json({ message: "No users found for this tenant." });
    }
    const userId = users[0].id;

    const order = await storage.createOrder({
      tenantId,
      locationId: Number(locationId),
      userId,
      status: "pending",
    });

    for (const item of items) {
      await storage.createOrderItem({
        orderId: order.id,
        productId: Number(item.productId),
        quantity: Number(item.quantity),
      });
    }

    res.status(201).json({ order, itemCount: items.length });
  });

  app.get("/api/orders/:orderId/items", async (req, res) => {
    const items = await storage.getOrderItemsByOrder(Number(req.params.orderId));
    res.json(items);
  });

  app.post("/api/orders/:orderId/items", async (req, res) => {
    const parsed = insertOrderItemSchema.safeParse({ ...req.body, orderId: Number(req.params.orderId) });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const item = await storage.createOrderItem(parsed.data);
    res.status(201).json(item);
  });

  const SALT_ROUNDS = 10;

  app.put("/api/super-admin/tenants/:tenantId", async (req, res) => {
    const tenantId = Number(req.params.tenantId);
    const parsed = insertTenantSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const tenant = await storage.updateTenant(tenantId, parsed.data);
    res.json(tenant);
  });

  app.delete("/api/super-admin/tenants/:tenantId", async (req, res) => {
    const result = await storage.deleteTenant(Number(req.params.tenantId));
    if (!result.success) return res.status(409).json({ message: result.message });
    res.status(204).send();
  });

  app.get("/api/super-admin/global-check", async (_req, res) => {
    const globalAdmins = await storage.getGlobalSuperAdmins();
    res.json({ hasGlobalSuperAdmins: globalAdmins.length > 0, count: globalAdmins.length });
  });

  app.get("/api/super-admin/users", async (_req, res) => {
    const allUsers = await storage.getAllUsersWithTenant();
    res.json(allUsers);
  });

  const superAdminCreateUserSchema = z.object({
    email: z.string().email("Valid email required"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    role: z.enum(["SUPER_ADMIN", "TENANT_ADMIN", "WARD_MANAGER", "WAREHOUSE"]),
    tenantId: z.number().nullable().optional(),
  });

  app.post("/api/super-admin/users", async (req, res) => {
    const parsed = superAdminCreateUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const { password, ...userData } = parsed.data;
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const tenantId = userData.role === "SUPER_ADMIN" ? null : (userData.tenantId ?? null);
    const user = await storage.createUser({ ...userData, tenantId, passwordHash });
    res.status(201).json(user);
  });

  const superAdminUpdateUserSchema = z.object({
    email: z.string().email().optional(),
    role: z.enum(["SUPER_ADMIN", "TENANT_ADMIN", "WARD_MANAGER", "WAREHOUSE"]).optional(),
    tenantId: z.number().nullable().optional(),
    password: z.string().min(6).optional(),
  });

  app.put("/api/super-admin/users/:userId", async (req, res) => {
    const userId = Number(req.params.userId);
    const parsed = superAdminUpdateUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const { password, ...rest } = parsed.data;
    const updateData: Record<string, unknown> = { ...rest };
    if (rest.role === "SUPER_ADMIN") {
      updateData.tenantId = null;
    }
    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    }
    const user = await storage.updateUser(userId, updateData as Parameters<typeof storage.updateUser>[1]);
    res.json(user);
  });

  app.delete("/api/super-admin/users/:userId", async (req, res) => {
    await storage.deleteUser(Number(req.params.userId));
    res.status(204).send();
  });

  return httpServer;
}
