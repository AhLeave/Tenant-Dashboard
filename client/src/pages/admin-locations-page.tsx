import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { MapPinned, Plus, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Location } from "@shared/schema";

interface AdminLocationsPageProps {
  tenantId: number;
}

const locationFormSchema = z.object({
  name: z.string().min(1, "Location name is required"),
});

type LocationFormValues = z.infer<typeof locationFormSchema>;

function LocationFormDialog({
  open,
  onOpenChange,
  location,
  tenantId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  location: Location | null;
  tenantId: number;
}) {
  const { toast } = useToast();
  const isEdit = !!location;

  const form = useForm<LocationFormValues>({
    resolver: zodResolver(locationFormSchema),
    defaultValues: {
      name: location?.name ?? "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: object) =>
      apiRequest("POST", `/api/tenants/${tenantId}/locations`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "locations"] });
      toast({ title: "Location created" });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to create location";
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: object) =>
      apiRequest("PUT", `/api/tenants/${tenantId}/admin/locations/${location!.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "locations"] });
      toast({ title: "Location updated" });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to update location";
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = (values: LocationFormValues) => {
    if (isEdit) {
      updateMutation.mutate(values);
    } else {
      createMutation.mutate(values);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) form.reset(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle data-testid="text-location-dialog-title">
            {isEdit ? "Edit Location" : "Add New Location"}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Ward A, Pharmacy, ICU" {...field} data-testid="input-location-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-location-dialog-cancel">
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-location-dialog-save">
                {isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Location"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminLocationsPage({ tenantId }: AdminLocationsPageProps) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editLocation, setEditLocation] = useState<Location | null>(null);
  const [deleteLocation, setDeleteLocation] = useState<Location | null>(null);

  const { data: locations = [], isLoading } = useQuery<Location[]>({
    queryKey: ["/api/tenants", tenantId, "locations"],
  });

  const handleAddNew = () => {
    setEditLocation(null);
    setDialogOpen(true);
  };

  const handleEdit = (location: Location) => {
    setEditLocation(location);
    setDialogOpen(true);
  };

  const deleteMutation = useMutation({
    mutationFn: (locationId: number) =>
      apiRequest("DELETE", `/api/tenants/${tenantId}/admin/locations/${locationId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "locations"] });
      toast({ title: "Location deleted" });
      setDeleteLocation(null);
    },
    onError: async (err: unknown) => {
      let message = "Failed to delete location";
      try {
        if (err instanceof Response) {
          const body = await err.json();
          message = body.message ?? message;
        } else if (err instanceof Error) {
          message = err.message;
        }
      } catch {}
      toast({ title: "Cannot delete location", description: message, variant: "destructive" });
      setDeleteLocation(null);
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <MapPinned className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-admin-locations-title">
              Admin — Locations
            </h1>
          </div>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage wards and locations for this tenant. Changes apply immediately to all users.
          </p>
        </div>
        <Button onClick={handleAddNew} data-testid="button-add-location">
          <Plus className="h-4 w-4 mr-2" />
          Add New Location
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Location Name</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3].map((i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-24" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : locations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
              <MapPinned className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No locations yet</h3>
            <p className="text-sm text-muted-foreground text-center max-w-xs mb-4">
              Add your first location to start organizing wards and areas.
            </p>
            <Button onClick={handleAddNew} data-testid="button-add-location-empty">
              <Plus className="h-4 w-4 mr-2" />
              Add New Location
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-2 border-b text-sm text-muted-foreground">
              <span data-testid="text-admin-location-count">{locations.length} location{locations.length !== 1 ? "s" : ""}</span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Location Name</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locations.map((loc) => (
                  <TableRow key={loc.id} data-testid={`row-admin-location-${loc.id}`}>
                    <TableCell className="font-medium">{loc.name}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded-md">{loc.id}</code>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(loc)}
                          data-testid={`button-edit-location-${loc.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1.5" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive hover:border-destructive"
                          onClick={() => setDeleteLocation(loc)}
                          data-testid={`button-delete-location-${loc.id}`}
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

      <LocationFormDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) setEditLocation(null);
        }}
        location={editLocation}
        tenantId={tenantId}
      />

      <AlertDialog open={!!deleteLocation} onOpenChange={(v) => !v && setDeleteLocation(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete location?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteLocation?.name}</strong> and remove all its product availability mappings. This action cannot be undone.
              <br /><br />
              Note: locations with existing orders cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-location-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteLocation && deleteMutation.mutate(deleteLocation.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-delete-location-confirm"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Location"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
