"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: data.get("email"), password: data.get("password") })
    });
    setLoading(false);
    if (!response.ok) {
      setError("Invalid email or password");
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.14),transparent_40%)] p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Video />
          </div>
          <CardTitle className="text-2xl">Sentinel VMS</CardTitle>
          <p className="text-sm text-muted-foreground">Sign in to the operations console</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="email">Email</label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="password">Password</label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required minLength={8} />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button className="w-full" disabled={loading}>{loading ? "Signing in..." : "Sign in"}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
