import { useState } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { LocationSwitcher } from "@/components/location-switcher";
import { CartSheet } from "@/components/cart-sheet";
import { CartProvider, useCart } from "@/contexts/cart-context";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, ShoppingCart, ShieldAlert } from "lucide-react";
import type { Tenant, Location, User } from "@shared/schema";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import LocationsPage from "@/pages/locations-page";
import InventoryPage from "@/pages/inventory-page";
import InventoryImportPage from "@/pages/inventory-import-page";
import OrdersPage from "@/pages/orders-page";
import AdminInventoryPage from "@/pages/admin-inventory-page";
import AdminLocationsPage from "@/pages/admin-locations-page";
import SuperAdminTenantsPage from "@/pages/super-admin-tenants-page";
import SuperAdminUsersPage from "@/pages/super-admin-users-page";
import WarehousePage from "@/pages/warehouse-page";

function TenantLogo({ tenant }: { tenant: Tenant | undefined }) {
  if (!tenant) return <Building2 className="h-4 w-4 text-muted-foreground" />;
  const initials = tenant.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <Avatar className="h-7 w-7" data-testid="img-tenant-logo">
      <AvatarImage src={tenant.logoUrl ?? undefined} alt={tenant.name} />
      <AvatarFallback className="text-xs font-semibold bg-primary text-primary-foreground">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

function CartButton() {
  const { totalItems, openCart } = useCart();
  return (
    <div className="relative">
      <Button
        size="icon"
        variant="outline"
        onClick={openCart}
        data-testid="button-open-cart"
        aria-label="Open cart"
      >
        <ShoppingCart className="h-4 w-4" />
      </Button>
      {totalItems > 0 && (
        <Badge
          className="absolute -top-2 -right-2 h-5 min-w-5 px-1 flex items-center justify-center text-xs no-default-active-elevate"
          data-testid="badge-cart-total"
        >
          {totalItems > 99 ? "99+" : totalItems}
        </Badge>
      )}
    </div>
  );
}

function AdminGuard({ tenantId, isAdmin, children }: { tenantId: number; isAdmin: boolean; children: React.ReactNode }) {
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <ShieldAlert className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold" data-testid="text-access-denied">Access Denied</h2>
        <p className="text-muted-foreground max-w-sm text-sm">
          This section is restricted to Tenant Admins and Super Admins only.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}

function SuperAdminGuard({ isSuperAdmin, children }: { isSuperAdmin: boolean; children: React.ReactNode }) {
  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <ShieldAlert className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold" data-testid="text-super-admin-access-denied">Access Denied</h2>
        <p className="text-muted-foreground max-w-sm text-sm">
          This section is restricted to Super Admins only.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}

function AppContent() {
  const { data: tenants = [] } = useQuery<Tenant[]>({
    queryKey: ["/api/tenants"],
  });

  const { data: globalCheck } = useQuery<{ hasGlobalSuperAdmins: boolean; count: number }>({
    queryKey: ["/api/super-admin/global-check"],
  });

  const [tenantId, setTenantId] = useState<number | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const { isOpen, closeCart } = useCart();

  const activeTenantId = tenantId ?? tenants[0]?.id ?? 1;
  const activeTenant = tenants.find(t => t.id === activeTenantId);

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/tenants", activeTenantId, "locations"],
  });

  const { data: tenantUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/tenants", activeTenantId, "users"],
  });

  const hasGlobalSuperAdmin = globalCheck?.hasGlobalSuperAdmins ?? false;
  const tenantHasSuperAdmin = tenantUsers.some(u => u.role === "SUPER_ADMIN");
  const isSuperAdmin = hasGlobalSuperAdmin || tenantHasSuperAdmin;
  const isAdmin = isSuperAdmin || tenantUsers.some(u => u.role === "TENANT_ADMIN");
  const isWarehouse = isAdmin || tenantUsers.some(u => u.role === "WAREHOUSE");

  const handleTenantChange = (val: string) => {
    setTenantId(Number(val));
    setSelectedLocationId(null);
  };

  return (
    <div className="flex h-screen w-full">
      <AppSidebar isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} isWarehouse={isWarehouse} />
      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center justify-between gap-2 p-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
          <div className="flex items-center gap-2">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <CartButton />
            <LocationSwitcher
              tenantId={activeTenantId}
              selectedLocationId={selectedLocationId}
              onLocationChange={setSelectedLocationId}
            />
            <div className="flex items-center gap-2">
              <TenantLogo tenant={activeTenant} />
              {isSuperAdmin ? (
                <Select
                  value={activeTenantId.toString()}
                  onValueChange={handleTenantChange}
                >
                  <SelectTrigger className="w-[200px]" data-testid="select-tenant-switcher">
                    <SelectValue placeholder="Select tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    {tenants.map((t) => (
                      <SelectItem key={t.id} value={t.id.toString()} data-testid={`option-tenant-${t.id}`}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div
                  className="flex items-center h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm w-[200px] cursor-default"
                  data-testid="text-tenant-name"
                >
                  <span className="truncate text-foreground">{activeTenant?.name ?? "Loading…"}</span>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          <Switch>
            <Route path="/">
              <Dashboard tenantId={activeTenantId} />
            </Route>
            <Route path="/locations">
              <LocationsPage tenantId={activeTenantId} />
            </Route>
            <Route path="/inventory/import">
              <InventoryImportPage tenantId={activeTenantId} />
            </Route>
            <Route path="/inventory">
              <InventoryPage tenantId={activeTenantId} selectedLocationId={selectedLocationId} />
            </Route>
            <Route path="/orders">
              <OrdersPage tenantId={activeTenantId} selectedLocationId={selectedLocationId} />
            </Route>
            <Route path="/admin/inventory">
              <AdminGuard tenantId={activeTenantId} isAdmin={isAdmin}>
                <AdminInventoryPage tenantId={activeTenantId} />
              </AdminGuard>
            </Route>
            <Route path="/admin/locations">
              <AdminGuard tenantId={activeTenantId} isAdmin={isAdmin}>
                <AdminLocationsPage tenantId={activeTenantId} />
              </AdminGuard>
            </Route>
            <Route path="/super-admin/tenants">
              <SuperAdminGuard isSuperAdmin={isSuperAdmin}>
                <SuperAdminTenantsPage />
              </SuperAdminGuard>
            </Route>
            <Route path="/super-admin/users">
              <SuperAdminGuard isSuperAdmin={isSuperAdmin}>
                <SuperAdminUsersPage />
              </SuperAdminGuard>
            </Route>
            <Route path="/warehouse">
              <WarehousePage tenantId={activeTenantId} isWarehouse={isWarehouse} />
            </Route>
            <Route component={NotFound} />
          </Switch>
        </main>
      </div>

      <CartSheet
        tenantId={activeTenantId}
        selectedLocationId={selectedLocationId}
        locations={locations}
      />
    </div>
  );
}

function App() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CartProvider>
          <SidebarProvider style={style as React.CSSProperties}>
            <AppContent />
          </SidebarProvider>
        </CartProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
