import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { WorkspaceApp } from "@/components/workspace";
export const dynamic = "force-dynamic";
export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return (
    <Suspense
      fallback={
        <div className="page-loading">Preparando seu espaço de trabalho…</div>
      }
    >
      <WorkspaceApp
        user={{ name: session.user.name, email: session.user.email }}
      />
    </Suspense>
  );
}
