"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ReportView } from "@/components/views";

export default function Page() {
  const params = useParams<{ id: string }>();
  return (
    <AppShell>
      <ReportView id={params.id} />
    </AppShell>
  );
}
