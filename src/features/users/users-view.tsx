"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";

interface Role { id: string; name: string; permissions: string[] }
interface User { id: string; name: string; email: string; active: boolean; role: Role; createdAt: string }
interface Data { users: User[]; roles: Role[] }

export function UsersView() {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<Data>("/api/users") });
  const create = useMutation({
    mutationFn: (body: unknown) => api("/api/users", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { setOpen(false); client.invalidateQueries({ queryKey: ["users"] }); }
  });
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    create.mutate({ name: form.get("name"), email: form.get("email"), password: form.get("password"), roleId: form.get("roleId") });
  }
  return (
    <>
      <PageHeading title="Users & Roles" description="Role-based access for administrators, operators, and viewers." action={
        <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Add User</Button></DialogTrigger><DialogContent>
          <DialogHeader><DialogTitle>Create user</DialogTitle><DialogDescription>Assign the minimum role required for this account.</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={submit}>
            <Input name="name" placeholder="Full name" required minLength={2} />
            <Input name="email" type="email" placeholder="Email" required />
            <Input name="password" type="password" placeholder="Temporary password" required minLength={10} />
            <select name="roleId" required className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="">Select role</option>{users.data?.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select>
            {create.error && <p className="text-sm text-red-500">{create.error.message}</p>}
            <Button className="w-full" disabled={create.isPending}>Create user</Button>
          </form>
        </DialogContent></Dialog>
      } />
      {users.error && <div className="mb-4 rounded-lg border border-red-500/30 p-4 text-sm text-red-500">You do not have permission to manage users.</div>}
      <Card><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[650px] text-left text-sm">
        <thead className="border-b text-xs uppercase text-muted-foreground"><tr><th className="px-5 py-4">User</th><th className="px-5 py-4">Role</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Created</th></tr></thead>
        <tbody className="divide-y">{users.data?.users.map((user) => <tr key={user.id}><td className="px-5 py-4"><div className="font-medium">{user.name}</div><div className="text-xs text-muted-foreground">{user.email}</div></td><td className="px-5 py-4">{user.role.name}</td><td className="px-5 py-4">{user.active ? "Active" : "Disabled"}</td><td className="px-5 py-4 text-muted-foreground">{new Date(user.createdAt).toLocaleDateString()}</td></tr>)}</tbody>
      </table></CardContent></Card>
    </>
  );
}
