import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, ShoppingCart, ExternalLink, Loader2, Globe } from "lucide-react";
import type { Tenant } from "@shared/schema";
import { useAuth } from "@/contexts/auth-context";

type TenantWithStats = Tenant & { activeOrderCount: number };

const PLATFORM_DOMAINS = ["replit.app", "repl.co", "replit.dev", "repl.it", "kirk.replit.dev"];

function getTenantUrl(subdomain: string): string | null {
  const { protocol, hostname, port } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${protocol}//${subdomain}.localhost${port ? `:${port}` : ""}`;
  }
  const isPlatformDomain = PLATFORM_DOMAINS.some(
    (d) => hostname === d || hostname.endsWith(`.${d}`)
  );
  if (isPlatformDomain) return null;
  return `${protocol}//${subdomain}.${hostname}${port ? `:${port}` : ""}`;
}

function TenantCard({ tenant }: { tenant: TenantWithStats }) {
  const subdomainUrl = tenant.subdomain ? getTenantUrl(tenant.subdomain) : null;

  return (
    <a
      href={subdomainUrl ?? "#"}
      target={subdomainUrl ? "_blank" : undefined}
      rel="noopener noreferrer"
      className={subdomainUrl ? "block group" : "block cursor-default"}
      data-testid={`card-tenant-${tenant.id}`}
    >
      <Card className="h-full transition-all duration-200 group-hover:border-primary/60 group-hover:shadow-md group-hover:-translate-y-0.5">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {tenant.logoUrl ? (
                <img
                  src={tenant.logoUrl}
                  alt={tenant.name}
                  className="h-8 w-8 rounded object-cover flex-shrink-0"
                />
              ) : (
                <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
              )}
              <CardTitle className="text-base leading-tight truncate" data-testid={`text-tenant-name-${tenant.id}`}>
                {tenant.name}
              </CardTitle>
            </div>
            {subdomainUrl && (
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {tenant.subdomain ? (
            <div className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <code
                className="text-xs text-muted-foreground font-mono truncate"
                data-testid={`text-tenant-subdomain-${tenant.id}`}
              >
                {tenant.subdomain}
              </code>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground italic">No subdomain set</span>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-xs text-muted-foreground">Active orders:</span>
            <Badge
              variant={tenant.activeOrderCount > 0 ? "default" : "secondary"}
              className="text-xs h-5 px-1.5"
              data-testid={`text-active-orders-${tenant.id}`}
            >
              {tenant.activeOrderCount}
            </Badge>
          </div>

          <div className="pt-1 border-t flex items-center justify-between text-xs text-muted-foreground">
            <span>Open: {tenant.orderOpenTime ?? "12:00"}</span>
            <span>Cutoff: {tenant.cutoffTime ?? "07:00"}</span>
          </div>
        </CardContent>
      </Card>
    </a>
  );
}

export default function SuperAdminOverviewPage() {
  const { user } = useAuth();
  const { data: tenants = [], isLoading } = useQuery<TenantWithStats[]>({
    queryKey: ["/api/super-admin/tenants-stats"],
    enabled: !!user && user.role === "SUPER_ADMIN",
  });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-super-admin-overview-title">
          Tenant Overview
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          All tenants across the platform. Click a card to open that tenant's dashboard.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : tenants.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No tenants found</p>
          <p className="text-sm mt-1">Create a tenant from the Manage Tenants page.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {tenants.map((tenant) => (
            <TenantCard key={tenant.id} tenant={tenant} />
          ))}
        </div>
      )}
    </div>
  );
}
