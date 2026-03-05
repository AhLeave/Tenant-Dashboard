import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Package, Plus, Pencil, Trash2, ShieldCheck, Search, CheckSquare, Square, Download, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Product, Location } from "@shared/schema";

interface AdminInventoryPageProps {
  tenantId: number;
}

const productFormSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  sku: z.string().min(1, "SKU is required"),
  group: z.string().optional(),
  price: z.coerce.number().min(0, "Price must be 0 or greater"),
  locationIds: z.array(z.number()).default([]),
});

type ProductFormValues = z.infer<typeof productFormSchema>;

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function LocationCheckboxList({
  locations,
  selected,
  onChange,
}: {
  locations: Location[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () => locations.filter((l) => l.name.toLowerCase().includes(search.toLowerCase())),
    [locations, search]
  );

  const toggle = (id: number) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const selectAll = () => onChange(filtered.map((l) => l.id));
  const clearAll = () => onChange(selected.filter((s) => !filtered.some((l) => l.id === s)));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search locations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
            data-testid="input-location-search"
          />
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={selectAll} className="text-xs" data-testid="button-select-all-locations">
          <CheckSquare className="h-3.5 w-3.5 mr-1" />
          All
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={clearAll} className="text-xs" data-testid="button-clear-all-locations">
          <Square className="h-3.5 w-3.5 mr-1" />
          None
        </Button>
      </div>
      <div className="text-xs text-muted-foreground">
        {selected.length} of {locations.length} selected
      </div>
      <ScrollArea className="h-52 border rounded-md">
        <div className="p-2 space-y-1">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No locations match your search.</p>
          ) : (
            filtered.map((loc) => (
              <label
                key={loc.id}
                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer select-none"
                data-testid={`checkbox-location-${loc.id}`}
              >
                <Checkbox
                  checked={selected.includes(loc.id)}
                  onCheckedChange={() => toggle(loc.id)}
                />
                <span className="text-sm">{loc.name}</span>
              </label>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function ProductFormDialog({
  open,
  onOpenChange,
  product,
  tenantId,
  locations,
  initialLocationIds,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: Product | null;
  tenantId: number;
  locations: Location[];
  initialLocationIds: number[];
}) {
  const { toast } = useToast();
  const isEdit = !!product;

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: product?.name ?? "",
      sku: product?.sku ?? "",
      group: product?.group ?? "",
      price: product ? product.price / 100 : 0,
      locationIds: initialLocationIds,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: object) =>
      apiRequest("POST", `/api/tenants/${tenantId}/admin/products`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "admin-products"] });
      toast({ title: "Product created" });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to create product";
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: object) =>
      apiRequest("PUT", `/api/tenants/${tenantId}/admin/products/${product!.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "admin-products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "product-locations", product!.id] });
      toast({ title: "Product updated" });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to update product";
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = (values: ProductFormValues) => {
    const payload = {
      ...values,
      price: Math.round(values.price * 100),
      group: values.group || null,
    };
    if (isEdit) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="text-dialog-title">
            {isEdit ? "Edit Product" : "Add New Product"}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Product Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Paracetamol 500mg" {...field} data-testid="input-product-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. CUH0001" {...field} data-testid="input-product-sku" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="group"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Group</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Dairy, Cereal, Mineral" {...field} data-testid="input-product-group" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        {...field}
                        data-testid="input-product-price"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="locationIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Available Locations</FormLabel>
                  <FormControl>
                    <LocationCheckboxList
                      locations={locations}
                      selected={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-dialog-cancel">
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-dialog-save">
                {isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Product"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminInventoryPage({ tenantId }: AdminInventoryPageProps) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
  const [editLocationIds, setEditLocationIds] = useState<number[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/products/export`, { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "inventory-export.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const { data: products = [], isLoading: loadingProducts } = useQuery<Product[]>({
    queryKey: ["/api/tenants", tenantId, "admin-products"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/products`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/tenants", tenantId, "locations"],
  });

  const fetchLocationIds = async (productId: number): Promise<number[]> => {
    const res = await fetch(`/api/tenants/${tenantId}/products/${productId}/locations`, {
      credentials: "include",
    });
    if (!res.ok) return [];
    return res.json();
  };

  const handleAddNew = () => {
    setEditProduct(null);
    setEditLocationIds([]);
    setDialogOpen(true);
  };

  const handleEdit = async (product: Product) => {
    const locationIds = await fetchLocationIds(product.id);
    setEditProduct(product);
    setEditLocationIds(locationIds);
    setDialogOpen(true);
  };

  const deleteMutation = useMutation({
    mutationFn: (productId: number) =>
      apiRequest("DELETE", `/api/tenants/${tenantId}/admin/products/${productId}`),
    onSuccess: (_res, productId) => {
      queryClient.setQueryData<Product[]>(
        ["/api/tenants", tenantId, "admin-products"],
        (old = []) => old.filter((p) => p.id !== productId)
      );
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "products"] });
      toast({ title: "Product deleted" });
      setDeleteProduct(null);
    },
    onError: async (err: unknown) => {
      let message = "Failed to delete product";
      try {
        if (err instanceof Response) {
          const body = await err.json();
          message = body.message ?? message;
        } else if (err instanceof Error) {
          message = err.message;
        }
      } catch {}
      toast({ title: "Cannot delete product", description: message, variant: "destructive" });
      setDeleteProduct(null);
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-admin-title">
              Admin — Product Catalog
            </h1>
          </div>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage products and their location availability. Changes apply immediately to all users.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExport} disabled={isExporting} data-testid="button-export-products">
            {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            {isExporting ? "Exporting…" : "Export XLSX"}
          </Button>
          <Button onClick={handleAddNew} data-testid="button-add-product">
            <Plus className="h-4 w-4 mr-2" />
            Add New Product
          </Button>
        </div>
      </div>

      {loadingProducts ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3, 4, 5].map((i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-24" /></TableCell>
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
            <p className="text-sm text-muted-foreground text-center max-w-xs mb-4">
              Add your first product to start building the catalog.
            </p>
            <Button onClick={handleAddNew} data-testid="button-add-product-empty">
              <Plus className="h-4 w-4 mr-2" />
              Add New Product
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-2 border-b text-sm text-muted-foreground">
              <span data-testid="text-admin-product-count">{products.length} product{products.length !== 1 ? "s" : ""}</span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id} data-testid={`row-admin-product-${product.id}`}>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded-md">{product.sku}</code>
                    </TableCell>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>
                      {product.group ? (
                        <Badge variant="outline" className="text-xs">{product.group}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatPrice(product.price)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(product)}
                          data-testid={`button-edit-product-${product.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1.5" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive hover:border-destructive"
                          onClick={() => setDeleteProduct(product)}
                          data-testid={`button-delete-product-${product.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <ProductFormDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) setEditProduct(null);
        }}
        product={editProduct}
        tenantId={tenantId}
        locations={locations}
        initialLocationIds={editLocationIds}
      />

      <AlertDialog open={!!deleteProduct} onOpenChange={(v) => !v && setDeleteProduct(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteProduct?.name}</strong> ({deleteProduct?.sku}) and remove all its location availability mappings. This action cannot be undone.
              <br /><br />
              Note: products referenced by existing orders cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteProduct && deleteMutation.mutate(deleteProduct.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-delete-confirm"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Product"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
