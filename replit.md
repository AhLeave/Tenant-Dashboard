# TenantHub - Multi-Tenant Dashboard

## Overview
A multi-tenant web application with a dashboard UI for managing locations, inventory, and orders across tenants. Built with Express + Vite + React + Drizzle ORM + PostgreSQL.

## Architecture
- **Frontend**: React with Wouter routing, TanStack Query, Shadcn UI, Tailwind CSS
- **Backend**: Express.js REST API
- **Database**: PostgreSQL with Drizzle ORM
- **Schema**: Multi-tenant with Tenant, User, Location, Product, Order models

## Data Models
- **Tenant**: id, name, logo_url, subdomain, cutoff_time (text, default '07:00')
- **User**: id, tenant_id, role (SUPER_ADMIN/TENANT_ADMIN/WARD_MANAGER/WAREHOUSE), email
- **Location**: id, tenant_id, name
- **Product**: id, tenant_id, name, sku, price (stored in cents)
- **Order**: id, tenant_id, location_id, user_id, status, created_at
- **OrderItem**: id, order_id (FK orders, cascade delete), product_id (FK products), quantity

## Key Files
- `shared/schema.ts` - Drizzle schema definitions, Zod validators, TypeScript types
- `server/routes.ts` - API endpoints (all prefixed with /api)
- `server/storage.ts` - Database storage layer
- `server/seed.ts` - Database seed data
- `client/src/App.tsx` - Main app layout with sidebar, header, routing
- `client/src/components/app-sidebar.tsx` - Navigation sidebar
- `client/src/components/location-switcher.tsx` - Location dropdown in header
- `client/src/pages/dashboard.tsx` - Dashboard overview page
- `client/src/pages/locations-page.tsx` - Locations grid page
- `client/src/pages/inventory-page.tsx` - Products table page
- `client/src/pages/orders-page.tsx` - Orders table page (filterable by location)

## API Endpoints
- GET/POST `/api/tenants` - List/create tenants
- GET `/api/tenants/:id` - Get tenant details
- GET/POST `/api/tenants/:tenantId/users` - List/create users
- GET/POST `/api/tenants/:tenantId/locations` - List/create locations
- GET/POST `/api/tenants/:tenantId/products` - List/create products
- POST `/api/tenants/:tenantId/products/bulk` - Bulk insert products (body: { products: [{ name, sku, price }] })
- GET/POST `/api/tenants/:tenantId/orders` - List/create orders (supports ?locationId filter)
- GET/POST `/api/orders/:orderId/items` - List/create order items

## Features
- Multi-tenant data isolation via tenant_id on all models
- Tenant switcher dropdown in header
- Location switcher dropdown to filter orders by location
- Dashboard with stats cards, recent orders, and locations overview
- Sidebar navigation (Dashboard, Locations, Inventory, Orders)
- Loading skeletons and empty states on all pages
