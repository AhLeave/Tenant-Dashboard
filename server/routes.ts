import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTenantSchema, insertUserSchema, insertLocationSchema, insertProductSchema, insertOrderSchema, insertOrderItemSchema } from "@shared/schema";

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

  app.get("/api/tenants/:tenantId/products", async (req, res) => {
    const prods = await storage.getProductsByTenant(Number(req.params.tenantId));
    res.json(prods);
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

    const [cutoffHour, cutoffMinute] = tenant.cutoffTime.split(":").map(Number);
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const cutoffMinutes = cutoffHour * 60 + cutoffMinute;

    if (currentMinutes >= cutoffMinutes) {
      return res.status(422).json({ message: "Order cutoff time has passed." });
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

  return httpServer;
}
