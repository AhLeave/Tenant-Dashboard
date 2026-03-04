# TenantHub - Multi-Tenant Dashboard

## Overview
A multi-tenant web application with a dashboard UI for managing locations, inventory, and orders across tenants. Built with Express + Vite + React + Drizzle ORM + PostgreSQL.

## Architecture
- **Frontend**: React with Wouter routing, TanStack Query, Shadcn UI, Tailwind CSS
- **Backend**: Express.js REST API
- **Database**: PostgreSQL with Drizzle ORM
- **Schema**: Multi-tenant with Tenant, User, Location, Product, ProductAvailability, Order models

## Data Models
- **Tenant**: id, name, logo_url, subdomain, cutoff_time (text, default '07:00')
- **User**: id, tenant_id, role (SUPER_ADMIN/TENANT_ADMIN/WARD_MANAGER/WAREHOUSE), email
- **Location**: id, tenant_id, name
- **Product**: id, tenant_id, name, sku, price (stored in cents), group (nullable text)
- **ProductAvailability**: id, product_id (FK products, cascade), location_id (FK locations, cascade) — junction table populated from Excel YES/NO matrix
- **Order**: id, tenant_id, location_id, user_id, status, created_at
- **OrderItem**: id, order_id (FK orders, cascade delete), product_id (FK products), quantity

## Key Files
- `shared/schema.ts` - Drizzle schema definitions, Zod validators, TypeScript types
- `server/routes.ts` - API endpoints (all prefixed with /api)
- `server/storage.ts` - Database storage layer
- `server/seed.ts` - Database seed data
- `client/src/App.tsx` - Main app layout with sidebar, header, routing
- `client/src/components/app-sidebar.tsx` - Navigation sidebar (shows admin section for TENANT_ADMIN/SUPER_ADMIN)
- `client/src/components/location-switcher.tsx` - Location dropdown in header
- `client/src/pages/dashboard.tsx` - Dashboard overview page
- `client/src/pages/locations-page.tsx` - Locations grid page
- `client/src/pages/inventory-page.tsx` - Products table page with location filter + group filter pills
- `client/src/pages/orders-page.tsx` - Orders table page (filterable by location)
- `client/src/pages/admin-inventory-page.tsx` - Admin product CRUD page
- `client/src/pages/admin-locations-page.tsx` - Admin locations CRUD page
- `client/src/pages/super-admin-tenants-page.tsx` - Super Admin tenant CRUD page
- `client/src/pages/super-admin-users-page.tsx` - Super Admin user CRUD page (bcrypt passwords; SUPER_ADMIN role sets tenantId=null for global access)

## SUPER_ADMIN Global Access Model
- SUPER_ADMIN users have `tenantId = null` — not tied to any specific tenant
- Detected via `GET /api/super-admin/global-check` → `{ hasGlobalSuperAdmins: boolean }`
- When global super admins exist, `isSuperAdmin = true` across all tenant contexts
- Header tenant switcher: SUPER_ADMIN sees all tenants and can switch; others see a read-only tenant label
- All data queries continue to use `activeTenantId` for correct scoping when super admin switches tenants

## API Endpoints
- GET/POST `/api/tenants` - List/create tenants
- GET `/api/tenants/:id` - Get tenant details
- GET/POST `/api/tenants/:tenantId/users` - List/create users
- GET/POST `/api/tenants/:tenantId/locations` - List/create locations
- GET/POST `/api/tenants/:tenantId/products` - List/create products (supports ?locationId filter via product_availabilities join)
- POST `/api/tenants/:tenantId/products/bulk` - Bulk insert products (body: { products: [{ name, sku, price }] })
- GET `/api/tenants/:tenantId/products/:productId/locations` - Get locationIds for a product
- POST `/api/tenants/:tenantId/admin/products` - Admin: create product with locationIds
- PUT `/api/tenants/:tenantId/admin/products/:productId` - Admin: update product + sync availabilities
- DELETE `/api/tenants/:tenantId/admin/products/:productId` - Admin: delete product (blocked if in orders)
- PUT `/api/tenants/:tenantId/admin/locations/:locationId` - Admin: update location name
- DELETE `/api/tenants/:tenantId/admin/locations/:locationId` - Admin: delete location (first deletes product_availabilities, blocked if has orders)
- GET/POST `/api/tenants/:tenantId/orders` - List/create orders (supports ?locationId filter)
- POST `/api/tenants/:tenantId/orders/checkout` - Checkout with cutoff time enforcement
- GET/POST `/api/orders/:orderId/items` - List/create order items

## Features
- Multi-tenant data isolation via tenant_id on all models
- Tenant switcher dropdown in header
- Location switcher dropdown to filter orders and inventory by location
- Dashboard with stats cards, recent orders, and locations overview
- Sidebar navigation (Dashboard, Locations, Inventory, Orders)
- Loading skeletons and empty states on all pages
- Cart with slide-out sheet and checkout with server-side cutoff enforcement
- Group filter pills on inventory page for client-side filtering by product group
- Admin Inventory Management at /admin/inventory (role-gated: TENANT_ADMIN or SUPER_ADMIN)
  - Table of all products with Edit/Delete per row
  - Add/Edit modal with Name, SKU, Group, Price fields plus location checkboxes
  - Location search + Select All/None bulk controls
  - Delete blocked if product is referenced by existing orders
  - Sidebar "Administration > Manage Products" link only renders for admin users
- Admin Locations Management at /admin/locations (role-gated: TENANT_ADMIN or SUPER_ADMIN)
  - Table of all tenant locations with Location Name, ID, Edit/Delete columns
  - Add/Edit modal with a single Location Name text input
  - Delete first removes product_availabilities, blocked if location has existing orders
  - CRUD operations invalidate shared cache key so the header LocationSwitcher updates automatically
  - Sidebar "Administration > Manage Locations" link only renders for admin users
