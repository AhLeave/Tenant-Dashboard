import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ShoppingCart, Minus, Plus, Trash2, MapPin, AlertCircle, CheckCircle2, Loader2, BookmarkPlus,
} from "lucide-react";
import type { Location } from "@shared/schema";

interface CartSheetProps {
  tenantId: number;
  selectedLocationId: number | null;
  locations: Location[];
}

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function CartSheet({ tenantId, selectedLocationId, locations }: CartSheetProps) {
  const { items, removeFromCart, updateQuantity, clearCart, totalItems, totalPrice, isOpen, closeCart } = useCart();
  const { toast } = useToast();
  const { user } = useAuth();
  const canSeePrices = user?.role === "TENANT_ADMIN" || user?.role === "SUPER_ADMIN";
  const [cutoffError, setCutoffError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const selectedLocation = locations.find(l => l.id === selectedLocationId);

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/tenants/${tenantId}/orders/checkout`, {
        locationId: selectedLocationId,
        items: items.map(i => ({ productId: i.productId, quantity: i.quantity })),
      });
      return res.json();
    },
    onSuccess: (data) => {
      setCutoffError(null);
      setSuccess(true);
      clearCart();
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "orders"] });
      toast({
        title: "Order placed!",
        description: `Order #${data.order.id} was created successfully.`,
      });
      setTimeout(() => {
        setSuccess(false);
        closeCart();
      }, 2000);
    },
    onError: (err: Error) => {
      if (err.message.includes("Ordering is currently closed") || err.message.includes("Order cutoff time has passed")) {
        setCutoffError(err.message);
      } else {
        setCutoffError(null);
        toast({
          title: "Checkout failed",
          description: err.message,
          variant: "destructive",
        });
      }
    },
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (name: string) => {
      await apiRequest("POST", `/api/tenants/${tenantId}/standing-orders`, {
        name,
        locationId: selectedLocationId,
        items: items.map(i => ({ productId: i.productId, quantity: i.quantity })),
      });
    },
    onSuccess: () => {
      toast({ title: "Template saved!", description: `"${templateName}" saved as a Standing Order.` });
      setSaveTemplateOpen(false);
      setTemplateName("");
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "standing-orders"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save template", description: err.message, variant: "destructive" });
    },
  });

  const handleCheckout = () => {
    setCutoffError(null);
    setSuccess(false);
    checkoutMutation.mutate();
  };

  const handleSaveTemplate = () => {
    const name = templateName.trim();
    if (!name) {
      toast({ title: "Name required", description: "Please enter a template name.", variant: "destructive" });
      return;
    }
    if (!selectedLocationId) {
      toast({ title: "Location required", description: "Select a location before saving a template.", variant: "destructive" });
      return;
    }
    saveTemplateMutation.mutate(name);
  };

  const canCheckout = items.length > 0 && selectedLocationId !== null && !checkoutMutation.isPending;
  const canSaveTemplate = items.length > 0 && selectedLocationId !== null;

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => { if (!open) closeCart(); }}>
        <SheetContent className="flex flex-col w-full sm:max-w-md p-0">
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Cart
              {totalItems > 0 && (
                <Badge data-testid="badge-cart-count">{totalItems} item{totalItems !== 1 ? "s" : ""}</Badge>
              )}
            </SheetTitle>
          </SheetHeader>

          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center px-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <ShoppingCart className="h-7 w-7 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">Your cart is empty</p>
                <p className="text-sm text-muted-foreground mt-1">Add products from the Inventory page</p>
              </div>
            </div>
          ) : (
            <>
              <ScrollArea className="flex-1 px-6 py-4">
                <div className="space-y-4">
                  {items.map((item) => (
                    <div key={item.productId} className="flex items-start gap-3" data-testid={`cart-item-${item.productId}`}>
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted shrink-0">
                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        {canSeePrices && <p className="text-xs text-muted-foreground">{formatPrice(item.price)} each</p>}
                        <div className="flex items-center gap-2 mt-2">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                            data-testid={`button-decrease-${item.productId}`}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="text-sm font-medium w-6 text-center" data-testid={`text-qty-${item.productId}`}>
                            {item.quantity}
                          </span>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                            data-testid={`button-increase-${item.productId}`}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {canSeePrices && <span className="text-sm font-semibold">{formatPrice(item.price * item.quantity)}</span>}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground"
                          onClick={() => removeFromCart(item.productId)}
                          data-testid={`button-remove-${item.productId}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="px-6 py-4 border-t space-y-3">
                {canSeePrices && (
                  <>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm text-muted-foreground">Total</span>
                      <span className="text-lg font-bold" data-testid="text-cart-total">{formatPrice(totalPrice)}</span>
                    </div>
                    <Separator />
                  </>
                )}

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Delivering to</p>
                  {selectedLocation ? (
                    <div className="flex items-center gap-2 text-sm" data-testid="text-selected-location">
                      <MapPin className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-medium">{selectedLocation.name}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-md bg-muted p-3">
                      <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                      <p className="text-xs text-muted-foreground">
                        Select a location from the header dropdown before checking out
                      </p>
                    </div>
                  )}
                </div>

                {cutoffError && (
                  <div className="flex items-start gap-3 rounded-md bg-destructive/10 p-3 text-destructive" data-testid="text-cutoff-error">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <p className="text-sm font-medium">{cutoffError}</p>
                  </div>
                )}

                {success && (
                  <div className="flex items-center gap-3 rounded-md bg-chart-3/10 p-3 text-chart-3" data-testid="text-order-success">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <p className="text-sm font-medium">Order placed successfully!</p>
                  </div>
                )}

                <Button
                  className="w-full"
                  disabled={!canCheckout}
                  onClick={handleCheckout}
                  data-testid="button-checkout"
                >
                  {checkoutMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {!selectedLocationId ? "Select a location to checkout" : canSeePrices ? `Checkout — ${formatPrice(totalPrice)}` : "Checkout"}
                </Button>

                <Button
                  variant="outline"
                  className="w-full"
                  disabled={!canSaveTemplate}
                  onClick={() => setSaveTemplateOpen(true)}
                  data-testid="button-save-template"
                >
                  <BookmarkPlus className="h-4 w-4 mr-2" />
                  Save as Template
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={saveTemplateOpen} onOpenChange={(v) => { if (!v) { setSaveTemplateOpen(false); setTemplateName(""); } }}>
        <DialogContent className="sm:max-w-[400px]" data-testid="dialog-save-template">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookmarkPlus className="h-5 w-5" />
              Save as Standing Order
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Save this cart as a reusable template for <span className="font-medium">{selectedLocation?.name ?? "this location"}</span>.
            </p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Template Name</label>
              <Input
                placeholder="e.g. Weekly ICU Supplies"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSaveTemplate(); }}
                data-testid="input-template-name"
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {items.length} item{items.length !== 1 ? "s" : ""} will be saved to this template.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSaveTemplateOpen(false); setTemplateName(""); }}>
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate} disabled={saveTemplateMutation.isPending} data-testid="button-confirm-save-template">
              {saveTemplateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
