import { z } from "zod";
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import type { ReportFilters } from "./storage";
import { insertTenantSchema, insertUserSchema, insertLocationSchema, insertProductSchema, insertOrderSchema, insertOrderItemSchema } from "@shared/schema";
import bcrypt from "bcryptjs";
import { sendEmail } from "./lib/email";
import XLSX from "xlsx";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/tenants", async (_req, res) => {
    const tenantList = await storage.getTenants();
    res.json(tenantList);
  });

  app.get("/api/tenant-by-subdomain/:subdomain", async (req, res) => {
    const tenant = await storage.getTenantBySubdomain(req.params.subdomain);
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });
    res.json(tenant);
  });

  app.get("/api/super-admin/tenants-stats", async (req, res) => {
    if (!req.session.user) return res.status(401).json({ message: "Unauthorized" });
    if (req.session.user.role !== "SUPER_ADMIN") return res.status(403).json({ message: "Forbidden" });
    const stats = await storage.getTenantsWithStats();
    res.json(stats);
  });

  app.get("/api/tenants/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!id || isNaN(id)) return res.status(400).json({ message: "Invalid tenant ID" });
    const tenant = await storage.getTenant(id);
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
    const tenantId = Number(req.params.tenantId);
    if (!tenantId || isNaN(tenantId)) return res.status(400).json({ message: "Invalid tenant ID" });
    const locs = await storage.getLocationsByTenant(tenantId);
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

  app.post("/api/tenants/:tenantId/products/import-full", async (req, res) => {
    const tenantId = Number(req.params.tenantId);
    const { products: rawProducts, replaceAll } = req.body;
    if (!Array.isArray(rawProducts) || rawProducts.length === 0) {
      return res.status(400).json({ message: "products must be a non-empty array" });
    }
    const locationList = await storage.getLocationsByTenant(tenantId);
    const locationByName = new Map(locationList.map((l) => [l.name.toLowerCase().trim(), l.id]));

    if (replaceAll) {
      await storage.clearTenantProducts(tenantId);
    }

    const BATCH = 50;
    let totalInserted = 0;
    for (let i = 0; i < rawProducts.length; i += BATCH) {
      const batch = rawProducts.slice(i, i + BATCH);
      const productValues = batch
        .filter((p: any) => p.name && p.sku)
        .map((p: any) => ({
          tenantId,
          name: String(p.name).trim(),
          sku: String(p.sku).trim(),
          group: p.group ? String(p.group).trim() : null,
          price: Math.round(Number(p.price ?? 0) * 100),
        }));
      if (productValues.length === 0) continue;
      const inserted = await storage.bulkCreateProducts(productValues);
      totalInserted += inserted.length;
      const availabilities: { productId: number; locationId: number }[] = [];
      inserted.forEach((product, idx) => {
        const names: string[] = batch[idx]?.locationNames ?? [];
        for (const name of names) {
          const locationId = locationByName.get(name.toLowerCase().trim());
          if (locationId) availabilities.push({ productId: product.id, locationId });
        }
      });
      await storage.bulkCreateProductAvailabilities(availabilities);
    }
    res.status(201).json({ count: totalInserted });
  });

  app.get("/api/tenants/:tenantId/products/export", async (req, res) => {
    const tenantId = Number(req.params.tenantId);
    if (!tenantId || isNaN(tenantId)) return res.status(400).json({ message: "Invalid tenant ID" });
    const [productList, locationList, availabilities] = await Promise.all([
      storage.getProductsByTenant(tenantId),
      storage.getLocationsByTenant(tenantId),
      storage.getAllProductAvailabilities(tenantId),
    ]);
    const productLocationMap = new Map<number, Set<number>>();
    for (const { productId, locationId } of availabilities) {
      if (!productLocationMap.has(productId)) productLocationMap.set(productId, new Set());
      productLocationMap.get(productId)!.add(locationId);
    }

    const headers = ["Product Group", "Product Name", "SKU", "Price per Unit", "ALL", ...locationList.map((l) => l.name)];
    const rows = productList.map((p) => {
      const row: Record<string, string | number> = {
        "Product Group": p.group ?? "",
        "Product Name": p.name,
        "SKU": p.sku,
        "Price per Unit": parseFloat((p.price / 100).toFixed(2)),
        "ALL": "",
      };
      const locs = productLocationMap.get(p.id) ?? new Set();
      for (const loc of locationList) {
        row[loc.name] = locs.has(loc.id) ? "YES" : "NO";
      }
      return row;
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="inventory-export.xlsx"`);
    res.send(buf);
  });

  app.get("/api/tenants/:tenantId/product-availabilities", async (req, res) => {
    const tenantId = Number(req.params.tenantId);
    if (!tenantId || isNaN(tenantId)) return res.status(400).json({ message: "Invalid tenant ID" });
    const availabilities = await storage.getAllProductAvailabilities(tenantId);
    res.json(availabilities);
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

  const adminUserCreateSchema = z.object({
    email: z.string().email("Valid email required"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    role: z.enum(["TENANT_ADMIN", "WARD_MANAGER", "WAREHOUSE"]),
  });

  const adminUserUpdateSchema = z.object({
    email: z.string().email().optional(),
    role: z.enum(["TENANT_ADMIN", "WARD_MANAGER", "WAREHOUSE"]).optional(),
    password: z.string().min(6).optional(),
  });

  type SessionUser = { id: number; email: string; role: string; tenantId: number | null } | undefined;
  function isTenantAdminForTenant(sessionUser: SessionUser, tenantId: number): boolean {
    if (!sessionUser) return false;
    if (sessionUser.role === "SUPER_ADMIN") return true;
    return sessionUser.role === "TENANT_ADMIN" && sessionUser.tenantId === tenantId;
  }

  app.get("/api/tenants/:tenantId/admin/users", async (req, res) => {
    const tenantId = Number(req.params.tenantId);
    if (!isTenantAdminForTenant(req.session.user, tenantId)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const userList = await storage.getUsersByTenant(tenantId);
    res.json(userList);
  });

  app.post("/api/tenants/:tenantId/admin/users", async (req, res) => {
    const tenantId = Number(req.params.tenantId);
    if (!isTenantAdminForTenant(req.session.user, tenantId)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const parsed = adminUserCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const { password, ...userData } = parsed.data;
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await storage.createUser({ ...userData, tenantId, passwordHash });
    res.status(201).json(user);
  });

  app.put("/api/tenants/:tenantId/admin/users/:userId", async (req, res) => {
    const tenantId = Number(req.params.tenantId);
    if (!isTenantAdminForTenant(req.session.user, tenantId)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const userId = Number(req.params.userId);
    const tenantUsers = await storage.getUsersByTenant(tenantId);
    if (!tenantUsers.find(u => u.id === userId)) {
      return res.status(404).json({ message: "User not found in this tenant." });
    }
    const parsed = adminUserUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const { password, ...rest } = parsed.data;
    const updateData: Record<string, unknown> = { ...rest };
    if (password) updateData.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await storage.updateUser(userId, updateData as Parameters<typeof storage.updateUser>[1]);
    res.json(user);
  });

  app.delete("/api/tenants/:tenantId/admin/users/:userId", async (req, res) => {
    const tenantId = Number(req.params.tenantId);
    if (!isTenantAdminForTenant(req.session.user, tenantId)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const userId = Number(req.params.userId);
    const tenantUsers = await storage.getUsersByTenant(tenantId);
    const target = tenantUsers.find(u => u.id === userId);
    if (!target) return res.status(404).json({ message: "User not found in this tenant." });
    if (target.role === "SUPER_ADMIN") return res.status(403).json({ message: "Cannot delete Super Admin users." });
    await storage.deleteUser(userId);
    res.status(204).send();
  });

  app.get("/api/tenants/:tenantId/products/groups", async (req, res) => {
    const tenantId = Number(req.params.tenantId);
    const groups = await storage.getProductGroups(tenantId);
    res.json(groups);
  });

  app.get("/api/tenants/:tenantId/reports", async (req, res) => {
    const tenantId = Number(req.params.tenantId);
    const { startDate, endDate } = req.query as Record<string, string>;

    const locationIds = [req.query.locationIds]
      .flat()
      .filter(Boolean)
      .map(Number)
      .filter(n => !isNaN(n));

    const productGroups = [req.query.productGroups]
      .flat()
      .filter(Boolean) as string[];

    const statuses = [req.query.statuses]
      .flat()
      .filter(Boolean) as string[];

    const filters: ReportFilters = {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      locationIds: locationIds.length ? locationIds : undefined,
      productGroups: productGroups.length ? productGroups : undefined,
      statuses: statuses.length ? statuses : undefined,
    };

    const rows = await storage.getOrderReport(tenantId, filters);
    res.json(rows);
  });

  app.get("/api/tenants/:tenantId/invoicing", async (req, res) => {
    const tenantId = Number(req.params.tenantId);
    const { startDate, endDate } = req.query as Record<string, string>;
    const data = await storage.getInvoicingData(tenantId, startDate, endDate);
    res.json(data);
  });

  app.get("/api/tenants/:tenantId/report-schedules", async (req, res) => {
    const tenantId = Number(req.params.tenantId);
    const schedules = await storage.getReportSchedules(tenantId);
    res.json(schedules);
  });

  app.post("/api/tenants/:tenantId/report-schedules", async (req, res) => {
    const tenantId = Number(req.params.tenantId);
    const parsed = z.object({
      reportType: z.string().default("INVOICING"),
      frequency: z.enum(["WEEKLY", "MONTHLY"]),
      recipientEmails: z.array(z.string().email()).min(1),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

    const nextRunDate = new Date();
    if (parsed.data.frequency === "WEEKLY") {
      nextRunDate.setDate(nextRunDate.getDate() + (8 - nextRunDate.getDay()) % 7 || 7);
    } else {
      nextRunDate.setMonth(nextRunDate.getMonth() + 1, 1);
    }
    nextRunDate.setHours(7, 0, 0, 0);

    const schedule = await storage.createReportSchedule({
      tenantId,
      reportType: parsed.data.reportType,
      frequency: parsed.data.frequency,
      recipientEmails: parsed.data.recipientEmails,
      nextRunDate,
    });
    res.status(201).json(schedule);
  });

  app.delete("/api/tenants/:tenantId/report-schedules/:id", async (req, res) => {
    await storage.deleteReportSchedule(Number(req.params.id));
    res.status(204).send();
  });

  app.get("/api/cron/send-reports", async (req, res) => {
    const secret = process.env.CRON_SECRET;
    const provided = (req.headers["authorization"] ?? "").replace("Bearer ", "").trim()
      || (req.query.secret as string ?? "");
    if (secret && provided !== secret) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const schedules = await storage.getSchedulesDue();
    const results: { id: number; status: string; error?: string }[] = [];

    const resendKey = process.env.RESEND_API_KEY;
    for (const schedule of schedules) {
      try {
        const now = new Date();
        const periodStart = new Date(now);
        if (schedule.frequency === "MONTHLY") {
          periodStart.setMonth(periodStart.getMonth() - 1, 1);
        } else {
          periodStart.setDate(periodStart.getDate() - 7);
        }
        const data = await storage.getInvoicingData(schedule.tenantId, periodStart.toISOString().slice(0, 10), now.toISOString().slice(0, 10));

        const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;
        const tableRows = data.map(loc =>
          `<tr><td style="padding:8px;border:1px solid #ddd">${loc.locationName}</td><td style="padding:8px;border:1px solid #ddd;text-align:center">${loc.totalOrders}</td><td style="padding:8px;border:1px solid #ddd;text-align:right">${formatCurrency(loc.totalAmount)}</td></tr>`
        ).join("");

        const html = `
          <h2>Invoicing Report — ${schedule.reportType}</h2>
          <p>Period: ${periodStart.toLocaleDateString()} – ${now.toLocaleDateString()}</p>
          <table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:14px">
            <thead><tr style="background:#f0f0f0">
              <th style="padding:8px;border:1px solid #ddd;text-align:left">Ward / Location</th>
              <th style="padding:8px;border:1px solid #ddd;text-align:center">Orders Fulfilled</th>
              <th style="padding:8px;border:1px solid #ddd;text-align:right">Total Amount</th>
            </tr></thead>
            <tbody>${tableRows || "<tr><td colspan='3' style='padding:8px;text-align:center;color:#999'>No fulfilled orders in this period</td></tr>"}</tbody>
          </table>`;

        if (resendKey) {
          const { Resend } = await import("resend");
          const resend = new Resend(resendKey);
          await resend.emails.send({
            from: process.env.EMAIL_FROM ?? "reports@yourdomain.com",
            to: schedule.recipientEmails,
            subject: `Invoicing Report — ${schedule.frequency === "MONTHLY" ? "Monthly" : "Weekly"}`,
            html,
          });
        }

        const nextRunDate = new Date();
        if (schedule.frequency === "MONTHLY") {
          nextRunDate.setMonth(nextRunDate.getMonth() + 1, 1);
        } else {
          nextRunDate.setDate(nextRunDate.getDate() + 7);
        }
        nextRunDate.setHours(7, 0, 0, 0);
        await storage.updateReportScheduleNextRun(schedule.id, nextRunDate);
        results.push({ id: schedule.id, status: resendKey ? "sent" : "processed_no_key" });
      } catch (err: any) {
        results.push({ id: schedule.id, status: "error", error: err?.message });
      }
    }

    res.json({ processed: schedules.length, results });
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }
    const user = await storage.getUserByEmail(email);
    if (!user || !user.passwordHash) {
      return res.status(401).json({ message: "Invalid email or password." });
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: "Invalid email or password." });
    }
    req.session.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId ?? null,
    };
    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).json({ message: "Failed to create session." });
      }
      res.json({ id: user.id, email: user.email, role: user.role, tenantId: user.tenantId ?? null });
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.status(204).send();
    });
  });

  app.get("/api/tenants/:id/standing-orders", async (req, res) => {
    if (!req.session.user) return res.status(401).json({ message: "Unauthorized" });
    const tenantId = parseInt(req.params.id);
    const locationId = parseInt(req.query.locationId as string);
    if (!locationId) return res.status(400).json({ message: "locationId is required" });
    const orders = await storage.getStandingOrders(tenantId, locationId);
    res.json(orders);
  });

  app.post("/api/tenants/:id/standing-orders", async (req, res) => {
    if (!req.session.user) return res.status(401).json({ message: "Unauthorized" });
    const tenantId = parseInt(req.params.id);
    const { name, locationId, dayOfWeek, items } = req.body;
    if (!name || !locationId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "name, locationId, and items are required" });
    }
    const order = await storage.createStandingOrder(
      { tenantId, locationId, name, dayOfWeek: dayOfWeek ?? null },
      items.map((i: { productId: number; quantity: number }) => ({
        standingOrderId: 0,
        productId: i.productId,
        quantity: i.quantity,
      }))
    );
    res.json(order);
  });

  app.delete("/api/tenants/:id/standing-orders/:orderId", async (req, res) => {
    if (!req.session.user) return res.status(401).json({ message: "Unauthorized" });
    await storage.deleteStandingOrder(parseInt(req.params.orderId));
    res.status(204).send();
  });

  app.get("/api/test-email", async (req, res) => {
    if (!req.session.user) return res.status(401).json({ message: "Unauthorized" });
    if (req.session.user.role !== "TENANT_ADMIN" && req.session.user.role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const testRecipient = "YOUR_EMAIL_HERE@example.com";

    const result = await sendEmail(
      testRecipient,
      "CUH Inventory App — Email Integration Test",
      `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;border-radius:8px;border:1px solid #e5e7eb;">
          <h2 style="color:#1d4ed8;margin:0 0 12px;">Email Integration Working!</h2>
          <p style="color:#374151;margin:0 0 8px;">Your CUH Inventory App email integration is working correctly.</p>
          <p style="color:#6b7280;font-size:13px;margin:0;">This test was sent via Resend from the Reports page.</p>
        </div>
      `
    );

    if (!result.success) {
      return res.status(500).json({ message: "Email failed to send.", error: result.error });
    }

    res.json({ message: `Test email sent to ${testRecipient}` });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ message: "Not authenticated." });
    }
    res.json(req.session.user);
  });

  app.all("/api/{*path}", (_req, res) => {
    res.status(404).json({ message: "API endpoint not found." });
  });

  return httpServer;
}
