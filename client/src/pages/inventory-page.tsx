import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, Upload, ShoppingCart, Plus, Minus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/hooks/use-toast";
import type { Product } from "@shared/schema";

interface InventoryPageProps {
  tenantId: number;
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

function ProductRow({ product }: { product: Product }) {
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
        <code className="text-xs bg-muted px-2 py-1 rounded-md">{product.sku}</code>
      </TableCell>
      <TableCell className="text-right font-medium">{formatPrice(product.price)}</TableCell>
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

export default function InventoryPage({ tenantId }: InventoryPageProps) {
  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/tenants", tenantId, "products"],
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-inventory-title">Inventory</h1>
          <p className="text-muted-foreground">Browse and add products to your cart</p>
        </div>
        <Button asChild variant="outline" data-testid="link-import-products">
          <Link href="/inventory/import">
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3, 4].map((i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : products.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
              <Package className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No products yet</h3>
            <p className="text-sm text-muted-foreground">Import or add products to get started</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <ProductRow key={product.id} product={product} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
