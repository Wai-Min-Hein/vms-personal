import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: "default" | "success" | "warning" | "destructive" }) {
  const styles = {
    default: "bg-secondary text-secondary-foreground",
    success: "bg-emerald-500/15 text-emerald-500",
    warning: "bg-amber-500/15 text-amber-500",
    destructive: "bg-red-500/15 text-red-500"
  };
  return <div className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", styles[variant], className)} {...props} />;
}
