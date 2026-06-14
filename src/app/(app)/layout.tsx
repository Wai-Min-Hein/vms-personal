import { AppShell } from "@/components/app-shell";
import { requirePageUser } from "@/services/auth/session";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return <AppShell user={{ name: user.name, role: user.role }}>{children}</AppShell>;
}
