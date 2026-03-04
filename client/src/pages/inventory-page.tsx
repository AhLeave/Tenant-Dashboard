import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, Upload, ShoppingCart, Plus, Minus, MapPin, Filter } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import type { Product } from "@shared/schema";

interface InventoryPageProps {
  tenantId: number;
  selectedLocationId: number | null;
}

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function QuantityControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button
        size="icon"
        variant="outline"
        className="h-8 w-8"
        onClick={() => onChange(Math.max(1, value - 1))}
        data-testid="button-qty-decrease"
      >
        <Minus className="h-3 w-3" />
      </Button>
      <Input
        type="number"
        min={1}
        value={value}
        onChange={e => onChange(Math.max(1, parseInt(e.target.value) || 1))}
        className="h-8 w-14 text-center px-1"
        data-testid="input-quantity"
      />
      <Button
        size="icon"
        variant="outline"
        className="h-8 w-8"
        onClick={() => onChange(value + 1)}
        data-testid="button-qty-increase"
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}

function ProductRow({ product, canSeePrices }: { product: Product; canSeePrices: boolean }) {
  const [qty, setQty] = useState(1);
  const { addToCart, openCart } = useCart();
  const { toast } = useToast();

  const handleAdd = () => {
    addToCart({ id: product.id, name: product.name, sku: product.sku, price: product.price }, qty);
    toast({
      title: "Added to cart",
      description: `${qty}× ${product.name}`,
    });
    openCart();
    setQty(1);
  };

  return (
    <TableRow data-testid={`row-product-${product.id}`}>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted shrink-0">
            <Package className="h-4 w-4 text-muted-foreground" />
          </div>
          <span className="font-medium">{product.name}</span>
        </div>
      </TableCell>
      <TableCell>
        {product.group ? (
          <span className="text-xs bg-muted px-2 py-1 rounded-md text-muted-foreground whitespace-nowrap">
            {product.group}
          </span>
        ) : null}
      </TableCell>
      <TableCell>
        <code className="text-xs bg-muted px-2 py-1 rounded-md">{product.sku}</code>
      </TableCell>
      {canSeePrices && <TableCell className="text-right font-medium">{formatPrice(product.price)}</TableCell>}
      <TableCell>
        <QuantityControl value={qty} onChange={setQty} />
      </TableCell>
      <TableCell>
        <Button
          size="sm"
          onClick={handleAdd}
          data-testid={`button-add-to-cart-${product.id}`}
        >
          <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />
          Add
        </Button>
      </TableCell>
    </TableRow>
  );
}

function GroupFilterBar({
  groups,
  selected,
  onSelect,
}: {
  groups: string[];
  selected: string | null;
  onSelect: (g: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid="group-filter-bar">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground shrink-0">
        <Filter className="h-3.5 w-3.5" />
        <span className="font-medium">Group:</span>
      </div>
      <Badge
        variant={selected === null ? "default" : "outline"}
        className="cursor-pointer select-none"
        onClick={() => onSelect(null)}
        data-testid="filter-group-all"
      >
        All Groups
      </Badge>
      {groups.map((g) => (
        <Badge
          key={g}
          variant={selected === g ? "default" : "outline"}
          className="cursor-pointer select-none"
          onClick={() => onSelect(g)}
          data-testid={`filter-group-${g.replace(/\s+/g, "-").toLowerCase()}`}
        >
          {g}
        </Badge>
      ))}
    </div>
  );
}

export default function InventoryPage({ tenantId, selectedLocationId }: InventoryPageProps) {
  const { user } = useAuth();
  const canSeePrices = user?.role === "TENANT_ADMIN" || user?.role === "SUPER_ADMIN";
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/tenants", tenantId, "products", selectedLocationId],
    queryFn: async () => {
      const url = selectedLocationId
        ? `/api/tenants/${tenantId}/products?locationId=${selectedLocationId}`
        : `/api/tenants/${tenantId}/products`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const groups = useMemo(() => {
    const seen = new Set<string>();
    return products
      .map((p) => p.group ?? "")
      .filter((g) => g && !seen.has(g) && seen.add(g))
      .sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!selectedGroup) return products;
    return products.filter((p) => p.group === selectedGroup);
  }, [products, selectedGroup]);

  const subtitle = selectedLocationId
    ? `Showing products available at the selected location`
    : `Select a location in the header to see location-specific products`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-inventory-title">Inventory</h1>
          <p className="text-muted-foreground text-sm flex items-center gap-1.5 mt-0.5">
            {selectedLocationId ? (
              <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
            ) : null}
            {subtitle}
          </p>
        </div>
        <Button asChild variant="outline" data-testid="link-import-products">
          <Link href="/inventory/import">
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-6 w-20 rounded-full" />)}
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>SKU</TableHead>
                    {canSeePrices && <TableHead className="text-right">Price</TableHead>}
                    <TableHead>Qty</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      {canSeePrices && <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>}
                      <TableCell><Skeleton className="h-8 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : products.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
              <Package className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">
              {selectedLocationId ? "No products available here" : "No products yet"}
            </h3>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              {selectedLocationId
                ? "This location has no products assigned in the availability matrix."
                : "Import or add products to get started."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.length > 0 && (
            <GroupFilterBar
              groups={groups}
              selected={selectedGroup}
              onSelect={(g) => setSelectedGroup(g)}
            />
          )}

          {filteredProducts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10">
                <Package className="h-8 w-8 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No products in this group.</p>
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => setSelectedGroup(null)}>
                  Clear filter
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="flex items-center justify-between px-4 py-2 border-b text-sm text-muted-foreground">
                  <span data-testid="text-product-count">
                    {filteredProducts.length} product{filteredProducts.length !== 1 ? "s" : ""}
                    {selectedGroup ? ` in "${selectedGroup}"` : ""}
                  </span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Group</TableHead>
                      <TableHead>SKU</TableHead>
                      {canSeePrices && <TableHead className="text-right">Price</TableHead>}
                      <TableHead>Qty</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map((product) => (
                      <ProductRow key={product.id} product={product} canSeePrices={canSeePrices} />
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
