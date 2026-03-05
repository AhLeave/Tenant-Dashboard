# TenantHub - Multi-Tenant Dashboard

## Overview
A multi-tenant web application with a dashboard UI for managing locations, inventory, and orders across tenants. Built with Express + Vite + React + Drizzle ORM + PostgreSQL.

## Architecture
- **Frontend**: React with Wouter routing, TanStack Query, Shadcn UI, Tailwind CSS
- **Backend**: Express.js REST API
- **Database**: PostgreSQL with Drizzle ORM
- **Schema**: Multi-tenant with Tenant, User, Location, Product, ProductAvailability, Order models

## Data Models
- **Tenant**: id, name, logo_url, subdomain, cutoff_time (text, default '07:00'), order_open_time (text, default '12:00')
- **User**: id, tenant_id, role (SUPER_ADMIN/TENANT_ADMIN/WARD_MANAGER/WAREHOUSE), email
- **Location**: id, tenant_id, name
- **Product**: id, tenant_id, name, sku, price (stored in cents), group (nullable text)
- **ProductAvailability**: id, product_id (FK products, cascade), location_id (FK locations, cascade) — junction table populated from Excel YES/NO matrix
- **Order**: id, tenant_id, location_id, user_id, status, created_at
- **OrderItem**: id, order_id (FK orders, cascade delete), product_id (FK products), quantity
- **StandingOrder**: id, tenant_id, location_id (FK cascade), name, day_of_week (nullable int 0-6)
- **StandingOrderItem**: id, standing_order_id (FK cascade), product_id (FK cascade), quantity
- **ReportSchedule**: id, tenant_id, report_type, frequency (WEEKLY/MONTHLY), recipient_emails (text[]), next_run_date

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
- `client/src/pages/reports-page.tsx` - Configurable Reports page (admin-only, at /reports)
- `client/src/pages/login-page.tsx` - Login page (shown when not authenticated)
- `client/src/contexts/auth-context.tsx` - Auth context providing user session state, login/logout functions

## SUPER_ADMIN Global Access Model
- SUPER_ADMIN users have `tenantId = null` — not tied to any specific tenant
- Detected via `GET /api/super-admin/global-check` → `{ hasGlobalSuperAdmins: boolean }`
- When global super admins exist, `isSuperAdmin = true` across all tenant contexts
- Header tenant switcher: SUPER_ADMIN sees all tenants and can switch; others see a read-only tenant label
- All data queries continue to use `activeTenantId` for correct scoping when super admin switches tenants

## API Endpoints
- GET `/api/tenants/:tenantId/warehouse/orders` - Warehouse: list active orders (status pending/printed) with joined location, user, items+products
- PATCH `/api/orders/:orderId/print` - Warehouse: mark order as 'printed' (only transitions from pending)
- PATCH `/api/orders/:orderId/fulfill` - Warehouse: mark order as 'fulfilled' (removes from active view)
- GET/POST `/api/tenants` - List/create tenants
- GET `/api/tenants/:id` - Get tenant details
- GET/POST `/api/tenants/:tenantId/users` - List/create users
- GET/POST `/api/tenants/:tenantId/locations` - List/create locations
- GET/POST `/api/tenants/:tenantId/products` - List/create products (supports ?locationId filter via product_availabilities join)
- POST `/api/tenants/:tenantId/products/bulk` - Bulk insert products (body: { products: [{ name, sku, price }] })
- POST `/api/tenants/:tenantId/products/import-full` - Full Excel import: { products: [{name, sku, price, group, locationNames[]}], replaceAll?: bool } — matches locationNames to existing DB locations, optionally clears all existing products first
- GET `/api/tenants/:tenantId/products/export` - Export all products as .xlsx with location YES/NO matrix columns (same format as import template)
- GET `/api/tenants/:tenantId/products/:productId/locations` - Get locationIds for a product
- POST `/api/tenants/:tenantId/admin/products` - Admin: create product with locationIds
- PUT `/api/tenants/:tenantId/admin/products/:productId` - Admin: update product + sync availabilities
- DELETE `/api/tenants/:tenantId/admin/products/:productId` - Admin: delete product (blocked if in orders)
- PUT `/api/tenants/:tenantId/admin/locations/:locationId` - Admin: update location name
- DELETE `/api/tenants/:tenantId/admin/locations/:locationId` - Admin: delete location (first deletes product_availabilities, blocked if has orders)
- GET/POST `/api/tenants/:tenantId/orders` - List/create orders (supports ?locationId filter)
- POST `/api/tenants/:tenantId/orders/checkout` - Checkout with cutoff time enforcement
- GET/POST `/api/orders/:orderId/items` - List/create order items
- GET `/api/tenants/:tenantId/products/groups` - Distinct product groups for tenant
- GET `/api/tenants/:tenantId/reports` - Order report with filters: startDate, endDate, locationIds[], productGroups[], statuses[]
- POST `/api/auth/login` - Login with { email, password }, creates session
- POST `/api/auth/logout` - Destroys session
- GET `/api/auth/me` - Returns current session user or 401

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
  - **Export XLSX** button downloads all products in full import template format (Product Group, Product Name, SKU, Price per Unit, location YES/NO columns)
- Excel Import at /inventory/import (TENANT_ADMIN/SUPER_ADMIN)
  - Drag-and-drop / file picker for .xlsx/.xls files
  - Parses full format: Product Group | Product Name | SKU | Price per Unit | ALL (skip) | [location columns with YES/NO]
  - Preview table shows valid/invalid rows, errors, group, SKU, price, location assignment count
  - "Replace existing products" toggle — when on, clears all tenant products before importing
  - Sends parsed data to `/api/tenants/:tenantId/products/import-full` matching locationNames to DB locations
- Seed data uses `attached_assets/tenant_data_master_1772702860404.xlsx` (single Sheet1, 233 products, 69 location columns)
- Admin Locations Management at /admin/locations (role-gated: TENANT_ADMIN or SUPER_ADMIN)
  - Table of all tenant locations with Location Name, ID, Edit/Delete columns
  - Add/Edit modal with a single Location Name text input
  - Delete first removes product_availabilities, blocked if location has existing orders
  - CRUD operations invalidate shared cache key so the header LocationSwitcher updates automatically
  - Sidebar "Administration > Manage Locations" link only renders for admin users
- Authentication: session-based login/logout. Login page shown when unauthenticated. Role (SUPER_ADMIN/TENANT_ADMIN/WAREHOUSE/WARD_MANAGER) drives access. Default seed credentials: superadmin@cuh.ie / password123, admin@cuh.ie / password123
- Order Time Window: tenants have orderOpenTime (default 12:00) and cutoffTime (default 07:00). Checkout blocked if outside window; handles midnight-crossing windows correctly.
- Configurable Reports at /reports (role-gated: TENANT_ADMIN or SUPER_ADMIN)
  - Filter panel: date range, multi-select Locations, multi-select Product Groups, multi-select Status
  - Dynamic Drizzle query joining orders + order_items + products + locations
  - Results shown in paginated table (20 rows/page)
  - Export to Excel (.xlsx) using xlsx package client-side
  - Sidebar "Administration > Reports" link renders for admin users
- Warehouse Fulfillment Dashboard at /warehouse (role-gated: WAREHOUSE, TENANT_ADMIN, or SUPER_ADMIN)
  - Expandable order list showing all pending/printed orders for the active tenant
  - Each row shows Order ID, Location Name, Date/Time, Status badge (Pending/Printed)
  - Expanded view shows items table with SKU, Product Name, Quantity
  - "Print Order" button triggers window.print() and marks order status from pending→printed
  - "Mark as Dispatched" button updates status to fulfilled and removes order from active view
  - Print CSS hides navigation/sidebar in print view; shows a clean picking slip
  - Order status enum extended with 'printed' and 'fulfilled' values
  - Sidebar "Warehouse > Fulfillment" link renders for WAREHOUSE/TENANT_ADMIN/SUPER_ADMIN roles
