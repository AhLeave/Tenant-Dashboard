import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Building2, Plus, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Tenant } from "@shared/schema";

const tenantFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  subdomain: z.string().min(1, "Subdomain is required").regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens"),
  cutoffTime: z.string().regex(/^\d{2}:\d{2}$/, "Format must be HH:MM"),
});
type TenantFormValues = z.infer<typeof tenantFormSchema>;

function TenantFormDialog({
  open,
  onOpenChange,
  tenant,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenant: Tenant | null;
}) {
  const { toast } = useToast();
  const isEdit = !!tenant;

  const form = useForm<TenantFormValues>({
    resolver: zodResolver(tenantFormSchema),
    defaultValues: {
      name: tenant?.name ?? "",
      subdomain: tenant?.subdomain ?? "",
      cutoffTime: tenant?.cutoffTime ?? "07:00",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/tenants", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      toast({ title: "Tenant created" });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to create tenant";
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: object) => apiRequest("PUT", `/api/super-admin/tenants/${tenant!.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      toast({ title: "Tenant updated" });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to update tenant";
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = (values: TenantFormValues) => {
    if (isEdit) updateMutation.mutate(values);
    else createMutation.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) form.reset(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle data-testid="text-tenant-dialog-title">
            {isEdit ? "Edit Tenant" : "Create New Tenant"}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Acme Hospital" {...field} data-testid="input-tenant-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="subdomain"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subdomain</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. acme-hospital" {...field} data-testid="input-tenant-subdomain" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="cutoffTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Order Cutoff Time</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} data-testid="input-tenant-cutoff" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-tenant-dialog-cancel">
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-tenant-dialog-save">
                {isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Tenant"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function SuperAdminTenantsPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [deleteTenant, setDeleteTenant] = useState<Tenant | null>(null);

  const { data: tenants = [], isLoading } = useQuery<Tenant[]>({
    queryKey: ["/api/tenants"],
  });

  const handleAddNew = () => {
    setEditTenant(null);
    setDialogOpen(true);
  };

  const deleteMutation = useMutation({
    mutationFn: (tenantId: number) =>
      apiRequest("DELETE", `/api/super-admin/tenants/${tenantId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      toast({ title: "Tenant deleted" });
      setDeleteTenant(null);
    },
    onError: async (err: unknown) => {
      let message = "Failed to delete tenant";
      try {
        if (err instanceof Response) {
          const body = await err.json();
          message = body.message ?? message;
        } else if (err instanceof Error) {
          message = err.message;
        }
      } catch {}
      toast({ title: "Cannot delete tenant", description: message, variant: "destructive" });
      setDeleteTenant(null);
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-super-admin-tenants-title">
              Super Admin — Tenants
            </h1>
          </div>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage all tenants in the system.
          </p>
        </div>
        <Button onClick={handleAddNew} data-testid="button-add-tenant">
          <Plus className="h-4 w-4 mr-2" />
          Create New Tenant
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Subdomain</TableHead>
                  <TableHead>Cutoff Time</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3].map((i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-24" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : tenants.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No tenants yet</h3>
            <Button onClick={handleAddNew} className="mt-2" data-testid="button-add-tenant-empty">
              <Plus className="h-4 w-4 mr-2" />
              Create New Tenant
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center px-4 py-2 border-b text-sm text-muted-foreground">
              <span data-testid="text-tenant-count">{tenants.length} tenant{tenants.length !== 1 ? "s" : ""}</span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Subdomain</TableHead>
                  <TableHead>Cutoff Time</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((t) => (
                  <TableRow key={t.id} data-testid={`row-tenant-${t.id}`}>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded-md">{t.id}</code>
                    </TableCell>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{t.subdomain}</TableCell>
                    <TableCell className="text-sm">{t.cutoffTime}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setEditTenant(t); setDialogOpen(true); }}
                          data-testid={`button-edit-tenant-${t.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1.5" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive hover:border-destructive"
                          onClick={() => setDeleteTenant(t)}
                          data-testid={`button-delete-tenant-${t.id}`}
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

      <TenantFormDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditTenant(null); }}
        tenant={editTenant}
      />

      <AlertDialog open={!!deleteTenant} onOpenChange={(v) => !v && setDeleteTenant(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tenant?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTenant?.name}</strong>. A tenant can only be deleted if it has no users, locations, or products. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-tenant-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTenant && deleteMutation.mutate(deleteTenant.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-delete-tenant-confirm"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Tenant"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
