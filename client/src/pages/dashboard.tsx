import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Package, ShoppingCart, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Location, Product, Order, User } from "@shared/schema";

interface DashboardProps {
  tenantId: number;
}

function StatCard({ title, value, icon: Icon, description }: { title: string; value: string | number; icon: any; description: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" data-testid={`stat-${title.toLowerCase().replace(/\s/g, "-")}`}>{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function StatSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16 mb-1" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  );
}

const statusColors: Record<string, string> = {
  pending: "secondary",
  processing: "default",
  shipped: "default",
  delivered: "default",
  cancelled: "destructive",
};

export default function Dashboard({ tenantId }: DashboardProps) {
  const { data: locations = [], isLoading: loadingLocs } = useQuery<Location[]>({
    queryKey: ["/api/tenants", tenantId, "locations"],
  });
  const { data: products = [], isLoading: loadingProds } = useQuery<Product[]>({
    queryKey: ["/api/tenants", tenantId, "products"],
  });
  const { data: orders = [], isLoading: loadingOrders } = useQuery<Order[]>({
    queryKey: ["/api/tenants", tenantId, "orders"],
  });
  const { data: users = [], isLoading: loadingUsers } = useQuery<User[]>({
    queryKey: ["/api/tenants", tenantId, "users"],
  });

  const isLoading = loadingLocs || loadingProds || loadingOrders || loadingUsers;

  const recentOrders = [...orders].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  ).slice(0, 5);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-dashboard-title">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your tenant operations</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          <>
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </>
        ) : (
          <>
            <StatCard title="Locations" value={locations.length} icon={MapPin} description="Active locations" />
            <StatCard title="Products" value={products.length} icon={Package} description="In inventory catalog" />
            <StatCard title="Orders" value={orders.length} icon={ShoppingCart} description="Total orders placed" />
            <StatCard title="Users" value={users.length} icon={Users} description="Team members" />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between gap-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                ))}
              </div>
            ) : recentOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No orders yet</p>
            ) : (
              <div className="space-y-3">
                {recentOrders.map((order) => {
                  const loc = locations.find(l => l.id === order.locationId);
                  return (
                    <div key={order.id} className="flex items-center justify-between gap-1" data-testid={`row-order-${order.id}`}>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">Order #{order.id}</span>
                        <span className="text-xs text-muted-foreground">{loc?.name ?? "Unknown"}</span>
                      </div>
                      <Badge variant={statusColors[order.status] as any}>
                        {order.status}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Locations Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-md" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                ))}
              </div>
            ) : locations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No locations configured</p>
            ) : (
              <div className="space-y-3">
                {locations.map((loc) => {
                  const orderCount = orders.filter(o => o.locationId === loc.id).length;
                  return (
                    <div key={loc.id} className="flex items-center justify-between gap-1" data-testid={`row-location-${loc.id}`}>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <span className="text-sm font-medium">{loc.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{orderCount} orders</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
