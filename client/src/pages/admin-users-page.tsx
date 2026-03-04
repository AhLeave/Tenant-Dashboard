import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Users, Plus, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@shared/schema";

const TENANT_ROLES = ["TENANT_ADMIN", "WARD_MANAGER", "WAREHOUSE"] as const;
type TenantRole = typeof TENANT_ROLES[number];

const roleBadgeVariant = (role: string) => {
  if (role === "TENANT_ADMIN") return "default";
  return "secondary";
};

const createUserSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(TENANT_ROLES),
});

const editUserSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(6, "Password must be at least 6 characters").or(z.literal("")).optional(),
  role: z.enum(TENANT_ROLES),
});

type CreateFormValues = z.infer<typeof createUserSchema>;
type EditFormValues = z.infer<typeof editUserSchema>;

function UserFormDialog({
  open,
  onOpenChange,
  editUser,
  tenantId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editUser: User | null;
  tenantId: number;
}) {
  const { toast } = useToast();
  const isEdit = !!editUser;

  const form = useForm<EditFormValues>({
    resolver: zodResolver(isEdit ? editUserSchema : createUserSchema),
    defaultValues: {
      email: editUser?.email ?? "",
      password: "",
      role: (editUser?.role as TenantRole) ?? "WAREHOUSE",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: object) =>
      apiRequest("POST", `/api/tenants/${tenantId}/admin/users`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "admin", "users"] });
      toast({ title: "User created" });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to create user";
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: object) =>
      apiRequest("PUT", `/api/tenants/${tenantId}/admin/users/${editUser!.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "admin", "users"] });
      toast({ title: "User updated" });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to update user";
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = (values: EditFormValues) => {
    const payload: Record<string, unknown> = {
      email: values.email,
      role: values.role,
    };
    if (values.password) payload.password = values.password;
    if (isEdit) updateMutation.mutate(payload);
    else createMutation.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) form.reset(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle data-testid="text-admin-user-dialog-title">
            {isEdit ? "Edit User" : "Create New User"}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="user@example.com"
                      {...field}
                      data-testid="input-admin-user-email"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {isEdit ? "New Password (leave blank to keep current)" : "Password"}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={isEdit ? "Leave blank to keep unchanged" : "Min. 6 characters"}
                      {...field}
                      data-testid="input-admin-user-password"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-admin-user-role">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TENANT_ROLES.map((r) => (
                        <SelectItem key={r} value={r} data-testid={`option-admin-role-${r}`}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-admin-user-dialog-cancel"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-admin-user-dialog-save">
                {isPending ? "Saving..." : isEdit ? "Save Changes" : "Create User"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminUsersPage({ tenantId }: { tenantId: number }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/tenants", tenantId, "admin", "users"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/admin/users`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!tenantId,
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: number) =>
      apiRequest("DELETE", `/api/tenants/${tenantId}/admin/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "admin", "users"] });
      toast({ title: "User deleted" });
      setDeleteTarget(null);
    },
    onError: async (err: unknown) => {
      let message = "Failed to delete user";
      try {
        if (err instanceof Response) {
          const body = await err.json();
          message = body.message ?? message;
        } else if (err instanceof Error) {
          message = err.message;
        }
      } catch {}
      toast({ title: "Cannot delete user", description: message, variant: "destructive" });
      setDeleteTarget(null);
    },
  });

  const handleAddNew = () => {
    setEditUser(null);
    setDialogOpen(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-admin-users-title">
              Manage Users
            </h1>
          </div>
          <p className="text-muted-foreground text-sm mt-0.5">
            Create and manage users for this tenant.
          </p>
        </div>
        <Button onClick={handleAddNew} data-testid="button-admin-add-user">
          <Plus className="h-4 w-4 mr-2" />
          Create User
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3].map((i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-24" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
              <Users className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No users yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Get started by creating the first user for this tenant.</p>
            <Button onClick={handleAddNew} data-testid="button-admin-add-user-empty">
              <Plus className="h-4 w-4 mr-2" />
              Create User
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center px-4 py-2 border-b text-sm text-muted-foreground">
              <span data-testid="text-admin-user-count">
                {users.length} user{users.length !== 1 ? "s" : ""}
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id} data-testid={`row-admin-user-${u.id}`}>
                    <TableCell className="font-medium">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={roleBadgeVariant(u.role)} className="text-xs">
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setEditUser(u); setDialogOpen(true); }}
                          data-testid={`button-admin-edit-user-${u.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1.5" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive hover:border-destructive"
                          onClick={() => setDeleteTarget(u)}
                          data-testid={`button-admin-delete-user-${u.id}`}
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

      <UserFormDialog
        key={editUser?.id ?? "new"}
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditUser(null); }}
        editUser={editUser}
        tenantId={tenantId}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.email}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-admin-delete-user-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-admin-delete-user-confirm"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
