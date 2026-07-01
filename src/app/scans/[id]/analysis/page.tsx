"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AnalysisView } from "@/components/views";

export default function Page() {
  const params = useParams<{ id: string }>();
  return (
    <AppShell>
      <AnalysisView id={params.id} />
    </AppShell>
  );
}
