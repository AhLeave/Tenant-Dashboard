import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, Printer, CheckCircle, Package, ShieldAlert } from "lucide-react";
import type { WarehouseOrder } from "@shared/schema";

interface WarehousePageProps {
  tenantId: number;
  isWarehouse: boolean;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "pending") {
    return <Badge variant="outline" className="border-yellow-500 text-yellow-600 dark:text-yellow-400" data-testid="badge-status-pending">Pending</Badge>;
  }
  if (status === "printed") {
    return <Badge variant="outline" className="border-blue-500 text-blue-600 dark:text-blue-400" data-testid="badge-status-printed">Printed</Badge>;
  }
  return <Badge variant="outline" data-testid={`badge-status-${status}`}>{status}</Badge>;
}

function PrintSlip({ order }: { order: WarehouseOrder }) {
  return (
    <div className="print-only hidden">
      <div className="p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-1">Picking Slip</h1>
        <p className="text-sm text-gray-600 mb-4">Order #{order.id}</p>
        <div className="mb-6 border-t border-b py-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="font-semibold">Location:</span> {order.locationName}
          </div>
          <div>
            <span className="font-semibold">Date:</span>{" "}
            {new Date(order.createdAt).toLocaleString()}
          </div>
          <div>
            <span className="font-semibold">Ordered by:</span> {order.userEmail}
          </div>
        </div>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 font-semibold">SKU</th>
              <th className="text-left py-2 font-semibold">Product</th>
              <th className="text-right py-2 font-semibold">Qty</th>
              <th className="text-right py-2 font-semibold">Picked</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-b">
                <td className="py-2 font-mono text-xs">{item.sku}</td>
                <td className="py-2">{item.productName}</td>
                <td className="py-2 text-right font-semibold">{item.quantity}</td>
                <td className="py-2 text-right">
                  <span className="inline-block w-6 h-6 border border-gray-400 rounded" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-8 text-xs text-gray-400">Printed: {new Date().toLocaleString()}</p>
      </div>
    </div>
  );
}

function OrderRow({ order, tenantId }: { order: WarehouseOrder; tenantId: number }) {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();

  const printMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/orders/${order.id}/print`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "warehouse/orders"] });
    },
    onError: () => {
      toast({ title: "Failed to update order status", variant: "destructive" });
    },
  });

  const fulfillMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/orders/${order.id}/fulfill`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "warehouse/orders"] });
      toast({ title: `Order #${order.id} marked as fulfilled` });
    },
    onError: () => {
      toast({ title: "Failed to fulfill order", variant: "destructive" });
    },
  });

  const handlePrint = () => {
    if (order.status === "pending") {
      printMutation.mutate();
    }
    setTimeout(() => window.print(), 300);
  };

  return (
    <div className="border rounded-lg overflow-hidden" data-testid={`card-order-${order.id}`}>
      <PrintSlip order={order} />

      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
        data-testid={`button-expand-order-${order.id}`}
      >
        <span className="text-muted-foreground">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        <span className="font-mono text-sm font-semibold w-20 shrink-0" data-testid={`text-order-id-${order.id}`}>
          #{order.id}
        </span>
        <span className="flex-1 font-medium truncate" data-testid={`text-order-location-${order.id}`}>
          {order.locationName}
        </span>
        <span className="text-sm text-muted-foreground mr-3 hidden sm:block" data-testid={`text-order-date-${order.id}`}>
          {new Date(order.createdAt).toLocaleString()}
        </span>
        <StatusBadge status={order.status} />
      </button>

      {expanded && (
        <div className="border-t bg-muted/20 px-4 py-4 space-y-4 no-print">
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Ordered by: <span className="font-medium text-foreground" data-testid={`text-order-email-${order.id}`}>{order.userEmail}</span></p>
            <p className="sm:hidden">Date: <span className="font-medium text-foreground">{new Date(order.createdAt).toLocaleString()}</span></p>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1.5 font-semibold text-muted-foreground">SKU</th>
                <th className="text-left py-1.5 font-semibold text-muted-foreground">Product</th>
                <th className="text-right py-1.5 font-semibold text-muted-foreground">Qty</th>
              </tr>
            </thead>
            <tbody>
              {order.items.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-3 text-center text-muted-foreground text-xs">No items in this order</td>
                </tr>
              ) : (
                order.items.map((item) => (
                  <tr key={item.id} className="border-b last:border-0" data-testid={`row-item-${item.id}`}>
                    <td className="py-2 font-mono text-xs text-muted-foreground" data-testid={`text-sku-${item.id}`}>{item.sku}</td>
                    <td className="py-2" data-testid={`text-product-name-${item.id}`}>{item.productName}</td>
                    <td className="py-2 text-right font-semibold" data-testid={`text-quantity-${item.id}`}>{item.quantity}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrint}
              disabled={printMutation.isPending}
              data-testid={`button-print-order-${order.id}`}
            >
              <Printer className="h-4 w-4 mr-1.5" />
              {printMutation.isPending ? "Updating…" : "Print Order"}
            </Button>
            <Button
              size="sm"
              onClick={() => fulfillMutation.mutate()}
              disabled={fulfillMutation.isPending}
              data-testid={`button-fulfill-order-${order.id}`}
            >
              <CheckCircle className="h-4 w-4 mr-1.5" />
              {fulfillMutation.isPending ? "Updating…" : "Mark as Dispatched"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WarehousePage({ tenantId, isWarehouse }: WarehousePageProps) {
  const { data: orders = [], isLoading } = useQuery<WarehouseOrder[]>({
    queryKey: ["/api/tenants", tenantId, "warehouse/orders"],
    enabled: isWarehouse,
  });

  if (!isWarehouse) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <ShieldAlert className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold" data-testid="text-warehouse-access-denied">Access Denied</h2>
        <p className="text-muted-foreground max-w-sm text-sm">
          This section is restricted to Warehouse staff, Tenant Admins, and Super Admins only.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-warehouse-title">Warehouse Fulfillment</h1>
        <p className="text-muted-foreground text-sm mt-1">Active orders awaiting picking and dispatch</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center border rounded-lg bg-muted/10">
          <Package className="h-12 w-12 text-muted-foreground/50" />
          <p className="font-semibold text-muted-foreground" data-testid="text-no-orders">No active orders</p>
          <p className="text-sm text-muted-foreground">All orders have been fulfilled or there are no pending orders.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => (
            <OrderRow key={order.id} order={order} tenantId={tenantId} />
          ))}
        </div>
      )}
    </div>
  );
}
