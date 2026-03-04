import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BookmarkPlus, ChevronDown, ChevronUp, ShoppingCart, Trash2, Package,
  AlertCircle, Loader2,
} from "lucide-react";
import type { StandingOrderWithItems } from "@shared/schema";

interface TemplatesPageProps {
  tenantId: number;
  selectedLocationId: number | null;
}

export default function TemplatesPage({ tenantId, selectedLocationId }: TemplatesPageProps) {
  const { toast } = useToast();
  const { setItems, openCart } = useCart();
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { data: templates = [], isLoading } = useQuery<StandingOrderWithItems[]>({
    queryKey: ["/api/tenants", tenantId, "standing-orders", selectedLocationId],
    enabled: !!selectedLocationId,
    queryFn: async () => {
      const res = await fetch(
        `/api/tenants/${tenantId}/standing-orders?locationId=${selectedLocationId}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/tenants/${tenantId}/standing-orders/${id}`),
    onSuccess: () => {
      toast({ title: "Template deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "standing-orders"] });
    },
    onError: () => toast({ title: "Failed to delete template", variant: "destructive" }),
  });

  const handleLoadIntoCart = (template: StandingOrderWithItems) => {
    if (!template.items.length) {
      toast({ title: "Empty template", description: "This template has no items.", variant: "destructive" });
      return;
    }
    setItems(
      template.items.map(item => ({
        productId: item.productId,
        name: item.productName,
        sku: item.sku,
        price: 0,
        quantity: item.quantity,
      }))
    );
    openCart();
    toast({
      title: "Cart loaded!",
      description: `"${template.name}" (${template.items.length} items) loaded into your cart.`,
    });
  };

  if (!selectedLocationId) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 mb-1">
          <BookmarkPlus className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Standing Orders</h1>
        </div>
        <p className="text-muted-foreground text-sm mb-8">Reusable cart templates for your ward.</p>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14 gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <AlertCircle className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium">No location selected</p>
            <p className="text-sm text-muted-foreground">Select a ward/location from the header to view its templates.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <BookmarkPlus className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-templates-title">Standing Orders</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Reusable cart templates for your ward. Build a cart in Inventory, then use "Save as Template" to create one.
        </p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <Skeleton className="h-5 w-40" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-24 mb-4" />
                <Skeleton className="h-9 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!isLoading && templates.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14 gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Package className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium">No templates yet</p>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              Add items to your cart on the Inventory page, then click "Save as Template" to create a standing order.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && templates.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map(template => (
            <Card key={template.id} data-testid={`card-template-${template.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate" data-testid={`text-template-name-${template.id}`}>
                      {template.name}
                    </CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">
                        {template.items.length} item{template.items.length !== 1 ? "s" : ""}
                      </Badge>
                      {template.dayOfWeek !== null && template.dayOfWeek !== undefined && (
                        <Badge variant="outline" className="text-xs">
                          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][template.dayOfWeek]}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => deleteMutation.mutate(template.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-template-${template.id}`}
                  >
                    {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 px-2 text-muted-foreground"
                  onClick={() => toggleExpand(template.id)}
                  data-testid={`button-expand-template-${template.id}`}
                >
                  {expandedIds.has(template.id) ? (
                    <><ChevronUp className="h-3.5 w-3.5 mr-1" />Hide items</>
                  ) : (
                    <><ChevronDown className="h-3.5 w-3.5 mr-1" />Show items</>
                  )}
                </Button>

                {expandedIds.has(template.id) && (
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs py-2">Product</TableHead>
                          <TableHead className="text-xs py-2">SKU</TableHead>
                          <TableHead className="text-xs py-2 text-right">Qty</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {template.items.map(item => (
                          <TableRow key={item.id} data-testid={`row-template-item-${item.id}`}>
                            <TableCell className="text-xs py-2 font-medium">{item.productName}</TableCell>
                            <TableCell className="text-xs py-2 text-muted-foreground font-mono">{item.sku}</TableCell>
                            <TableCell className="text-xs py-2 text-right font-semibold">{item.quantity}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <Button
                  className="w-full"
                  onClick={() => handleLoadIntoCart(template)}
                  data-testid={`button-load-template-${template.id}`}
                >
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  Load into Cart
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
