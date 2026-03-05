import { useState, useMemo, Component, type ReactNode, type ErrorInfo } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { LocationSwitcher } from "@/components/location-switcher";
import { CartSheet } from "@/components/cart-sheet";
import { CartProvider, useCart } from "@/contexts/cart-context";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, ShoppingCart, ShieldAlert, LogOut } from "lucide-react";
import type { Tenant, Location } from "@shared/schema";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import LocationsPage from "@/pages/locations-page";
import InventoryPage from "@/pages/inventory-page";
import InventoryImportPage from "@/pages/inventory-import-page";
import OrdersPage from "@/pages/orders-page";
import AdminInventoryPage from "@/pages/admin-inventory-page";
import AdminLocationsPage from "@/pages/admin-locations-page";
import AdminUsersPage from "@/pages/admin-users-page";
import SuperAdminTenantsPage from "@/pages/super-admin-tenants-page";
import SuperAdminUsersPage from "@/pages/super-admin-users-page";
import SuperAdminOverviewPage from "@/pages/super-admin-overview-page";
import WarehousePage from "@/pages/warehouse-page";
import ReportsPage from "@/pages/reports-page";
import TemplatesPage from "@/pages/templates-page";
import LoginPage from "@/pages/login-page";

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

const PLATFORM_DOMAINS = ["replit.app", "repl.co", "replit.dev", "repl.it", "kirk.replit.dev"];

function getActiveSubdomain(): string | null {
  const hostname = window.location.hostname;

  if (hostname === "localhost" || hostname === "127.0.0.1") return null;

  if (hostname.endsWith(".localhost")) return hostname.slice(0, -".localhost".length);

  const isPlatformDomain = PLATFORM_DOMAINS.some(
    (d) => hostname === d || hostname.endsWith(`.${d}`)
  );
  if (isPlatformDomain) return null;

  const parts = hostname.split(".");
  if (parts.length > 2) return parts[0];

  return null;
}

function AppContent() {
  const { user, logout } = useAuth();

  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const isAdmin = isSuperAdmin || user?.role === "TENANT_ADMIN";
  const isWarehouse = isAdmin || user?.role === "WAREHOUSE" || user?.role === "WARD_MANAGER";

  const { data: tenants = [] } = useQuery<Tenant[]>({
    queryKey: ["/api/tenants"],
  });

  const detectedSubdomain = useMemo(() => getActiveSubdomain(), []);

  const { data: subdomainTenant } = useQuery<Tenant>({
    queryKey: [`/api/tenant-by-subdomain/${detectedSubdomain}`],
    enabled: !!detectedSubdomain,
  });

  const [tenantId, setTenantId] = useState<number | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const { isOpen, closeCart } = useCart();

  const activeTenantId: number | null = subdomainTenant?.id
    ?? (isSuperAdmin ? (tenantId ?? tenants[0]?.id ?? null) : (user?.tenantId ?? tenants[0]?.id ?? null));

  const activeTenant = tenants.find(t => t.id === activeTenantId) ?? subdomainTenant;

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/tenants", activeTenantId, "locations"],
    enabled: activeTenantId != null,
  });

  const handleTenantChange = (val: string) => {
    setTenantId(Number(val));
    setSelectedLocationId(null);
  };

  const handleLogout = async () => {
    await logout();
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
              {isSuperAdmin && !detectedSubdomain ? (
                activeTenantId != null ? (
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
                    className="flex items-center h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm w-[200px] cursor-default text-muted-foreground"
                    data-testid="text-tenant-loading"
                  >
                    Loading…
                  </div>
                )
              ) : (
                <div
                  className="flex items-center h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm w-[200px] cursor-default"
                  data-testid="text-tenant-name"
                >
                  <span className="truncate text-foreground">{activeTenant?.name ?? "Loading…"}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 pl-1 border-l">
              <span className="text-sm text-muted-foreground hidden sm:block" data-testid="text-user-email">
                {user?.email}
              </span>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleLogout}
                aria-label="Sign out"
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          <Switch>
            <Route path="/">
              {isSuperAdmin && !detectedSubdomain
                ? <Redirect to="/super-admin" />
                : <Dashboard tenantId={activeTenantId} />
              }
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
            <Route path="/templates">
              <TemplatesPage tenantId={activeTenantId} selectedLocationId={selectedLocationId} />
            </Route>
            <Route path="/admin/users">
              <AdminGuard tenantId={activeTenantId} isAdmin={isAdmin}>
                <AdminUsersPage tenantId={activeTenantId ?? 0} />
              </AdminGuard>
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
            <Route path="/reports">
              <AdminGuard tenantId={activeTenantId} isAdmin={isAdmin}>
                <ReportsPage tenantId={activeTenantId} />
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
            <Route path="/super-admin">
              <SuperAdminGuard isSuperAdmin={isSuperAdmin}>
                <SuperAdminOverviewPage />
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

function AuthGate() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <CartProvider>
      <SidebarProvider style={{ "--sidebar-width": "16rem", "--sidebar-width-icon": "3rem" } as React.CSSProperties}>
        <AppContent />
      </SidebarProvider>
    </CartProvider>
  );
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AppErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
          <div className="w-full max-w-md rounded-xl border bg-background p-8 shadow-sm text-center space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 mx-auto">
              <ShieldAlert className="h-6 w-6 text-destructive" />
            </div>
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              An unexpected error occurred. Please refresh the page to try again.
            </p>
            <p className="text-xs text-muted-foreground font-mono bg-muted px-3 py-2 rounded">
              {this.state.error.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <AuthGate />
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

export default App;
