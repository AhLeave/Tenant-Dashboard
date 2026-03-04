import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Location, Order } from "@shared/schema";

interface LocationsPageProps {
  tenantId: number;
}

export default function LocationsPage({ tenantId }: LocationsPageProps) {
  const { data: locations = [], isLoading } = useQuery<Location[]>({
    queryKey: ["/api/tenants", tenantId, "locations"],
  });
  const { data: orders = [] } = useQuery<Order[]>({
    queryKey: ["/api/tenants", tenantId, "orders"],
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-locations-title">Locations</h1>
        <p className="text-muted-foreground">Manage your facility locations</p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                <Skeleton className="h-10 w-10 rounded-md" />
                <Skeleton className="h-5 w-40" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : locations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
              <MapPin className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No locations yet</h3>
            <p className="text-sm text-muted-foreground">Locations will appear here once created</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {locations.map((loc) => {
            const orderCount = orders.filter(o => o.locationId === loc.id).length;
            const pendingCount = orders.filter(o => o.locationId === loc.id && o.status === "pending").length;
            return (
              <Card key={loc.id} className="hover-elevate" data-testid={`card-location-${loc.id}`}>
                <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                    <MapPin className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{loc.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">ID: {loc.id}</p>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between gap-1 text-sm">
                    <span className="text-muted-foreground">{orderCount} orders total</span>
                    {pendingCount > 0 && (
                      <span className="text-muted-foreground">{pendingCount} pending</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
