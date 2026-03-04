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
import { Users, Plus, Pencil, Trash2, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Tenant } from "@shared/schema";

type UserWithTenant = {
  id: number;
  email: string;
  role: "SUPER_ADMIN" | "TENANT_ADMIN" | "WARD_MANAGER" | "WAREHOUSE";
  tenantId: number | null;
  tenantName: string;
  passwordHash: string | null;
};

const ROLES = ["SUPER_ADMIN", "TENANT_ADMIN", "WARD_MANAGER", "WAREHOUSE"] as const;

const roleBadgeVariant = (role: string) => {
  if (role === "SUPER_ADMIN") return "destructive";
  if (role === "TENANT_ADMIN") return "default";
  return "secondary";
};

const userFormSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(6, "Password must be at least 6 characters").or(z.literal("")).optional(),
  role: z.enum(["SUPER_ADMIN", "TENANT_ADMIN", "WARD_MANAGER", "WAREHOUSE"]),
  tenantId: z.number().nullable().optional(),
});

type UserFormValues = z.infer<typeof userFormSchema>;

function UserFormDialog({
  open,
  onOpenChange,
  user,
  tenants,
  requirePassword,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  user: UserWithTenant | null;
  tenants: Tenant[];
  requirePassword: boolean;
}) {
  const { toast } = useToast();
  const isEdit = !!user;

  const form = useForm<UserFormValues>({
    resolver: zodResolver(
      requirePassword
        ? userFormSchema.extend({ password: z.string().min(6, "Password must be at least 6 characters") })
        : userFormSchema
    ),
    defaultValues: {
      email: user?.email ?? "",
      password: "",
      role: user?.role ?? "WAREHOUSE",
      tenantId: user?.tenantId ?? (tenants[0]?.id ?? null),
    },
  });

  const watchedRole = form.watch("role");
  const isGlobalRole = watchedRole === "SUPER_ADMIN";

  const createMutation = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/super-admin/users", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/global-check"] });
      toast({ title: "User created" });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to create user";
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: object) => apiRequest("PUT", `/api/super-admin/users/${user!.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/global-check"] });
      toast({ title: "User updated" });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to update user";
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = (values: UserFormValues) => {
    const payload: Record<string, unknown> = {
      email: values.email,
      role: values.role,
      tenantId: values.role === "SUPER_ADMIN" ? null : (values.tenantId ?? null),
    };
    if (values.password) payload.password = values.password;

    if (isEdit) updateMutation.mutate(payload);
    else createMutation.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) form.reset(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle data-testid="text-user-dialog-title">
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
                    <Input type="email" placeholder="user@example.com" {...field} data-testid="input-user-email" />
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
                  <FormLabel>{isEdit ? "New Password (leave blank to keep current)" : "Password"}</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={isEdit ? "Leave blank to keep unchanged" : "Min. 6 characters"}
                      {...field}
                      data-testid="input-user-password"
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
                      <SelectTrigger data-testid="select-user-role">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r} data-testid={`option-role-${r}`}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isGlobalRole ? (
              <div className="space-y-2">
                <p className="text-sm font-medium leading-none">Tenant Access</p>
                <div
                  className="flex items-center gap-2 rounded-md border border-dashed border-primary/50 bg-primary/5 px-3 py-2.5"
                  data-testid="badge-global-access"
                >
                  <Globe className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-primary">Global Access — All Tenants</p>
                    <p className="text-xs text-muted-foreground">
                      Super Admins have system-wide access and are not tied to a specific tenant.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <FormField
                control={form.control}
                name="tenantId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tenant</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(Number(v))}
                      value={field.value?.toString() ?? ""}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-user-tenant">
                          <SelectValue placeholder="Select tenant" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {tenants.map((t) => (
                          <SelectItem key={t.id} value={t.id.toString()} data-testid={`option-tenant-${t.id}`}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-user-dialog-cancel">
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-user-dialog-save">
                {isPending ? "Saving..." : isEdit ? "Save Changes" : "Create User"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function SuperAdminUsersPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserWithTenant | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserWithTenant | null>(null);

  const { data: allUsers = [], isLoading } = useQuery<UserWithTenant[]>({
    queryKey: ["/api/super-admin/users"],
    queryFn: async () => {
      const res = await fetch("/api/super-admin/users", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const { data: tenants = [] } = useQuery<Tenant[]>({
    queryKey: ["/api/tenants"],
  });

  const handleAddNew = () => {
    setEditUser(null);
    setDialogOpen(true);
  };

  const deleteMutation = useMutation({
    mutationFn: (userId: number) => apiRequest("DELETE", `/api/super-admin/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/global-check"] });
      toast({ title: "User deleted" });
      setDeleteUser(null);
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
      setDeleteUser(null);
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-super-admin-users-title">
              Super Admin — Users
            </h1>
          </div>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage all users across all tenants.
          </p>
        </div>
        <Button onClick={handleAddNew} data-testid="button-add-user">
          <Plus className="h-4 w-4 mr-2" />
          Create New User
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3].map((i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-24" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : allUsers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
              <Users className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No users yet</h3>
            <Button onClick={handleAddNew} className="mt-2" data-testid="button-add-user-empty">
              <Plus className="h-4 w-4 mr-2" />
              Create New User
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center px-4 py-2 border-b text-sm text-muted-foreground">
              <span data-testid="text-user-count">{allUsers.length} user{allUsers.length !== 1 ? "s" : ""}</span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allUsers.map((u) => (
                  <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded-md">{u.id}</code>
                    </TableCell>
                    <TableCell className="font-medium">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={roleBadgeVariant(u.role)} className="text-xs">
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.tenantId === null ? (
                        <span className="flex items-center gap-1.5 text-primary font-medium">
                          <Globe className="h-3.5 w-3.5" />
                          Global Access
                        </span>
                      ) : (
                        u.tenantName
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setEditUser(u); setDialogOpen(true); }}
                          data-testid={`button-edit-user-${u.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1.5" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive hover:border-destructive"
                          onClick={() => setDeleteUser(u)}
                          data-testid={`button-delete-user-${u.id}`}
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
        user={editUser}
        tenants={tenants}
        requirePassword={!editUser}
      />

      <AlertDialog open={!!deleteUser} onOpenChange={(v) => !v && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteUser?.email}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-user-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteUser && deleteMutation.mutate(deleteUser.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-delete-user-confirm"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
