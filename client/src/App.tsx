import { useState } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { LocationSwitcher } from "@/components/location-switcher";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Building2 } from "lucide-react";
import type { Tenant } from "@shared/schema";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import LocationsPage from "@/pages/locations-page";
import InventoryPage from "@/pages/inventory-page";
import OrdersPage from "@/pages/orders-page";

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

function AppContent() {
  const { data: tenants = [] } = useQuery<Tenant[]>({
    queryKey: ["/api/tenants"],
  });

  const [tenantId, setTenantId] = useState<number | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);

  const activeTenantId = tenantId ?? tenants[0]?.id ?? 1;
  const activeTenant = tenants.find(t => t.id === activeTenantId);

  const handleTenantChange = (val: string) => {
    setTenantId(Number(val));
    setSelectedLocationId(null);
  };

  return (
    <div className="flex h-screen w-full">
      <AppSidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center justify-between gap-2 p-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
          <div className="flex items-center gap-2">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <LocationSwitcher
              tenantId={activeTenantId}
              selectedLocationId={selectedLocationId}
              onLocationChange={setSelectedLocationId}
            />
            <div className="flex items-center gap-2">
              <TenantLogo tenant={activeTenant} />
              <Select
                value={activeTenantId.toString()}
                onValueChange={handleTenantChange}
              >
                <SelectTrigger className="w-[180px]" data-testid="select-tenant-switcher">
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
            <Route path="/inventory">
              <InventoryPage tenantId={activeTenantId} />
            </Route>
            <Route path="/orders">
              <OrdersPage tenantId={activeTenantId} selectedLocationId={selectedLocationId} />
            </Route>
            <Route component={NotFound} />
          </Switch>
        </main>
      </div>
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
        <SidebarProvider style={style as React.CSSProperties}>
          <AppContent />
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
