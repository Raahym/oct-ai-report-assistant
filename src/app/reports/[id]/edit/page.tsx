"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ReportEditorView } from "@/components/views";

export default function Page() {
  const params = useParams<{ id: string }>();
  return (
    <AppShell>
      <ReportEditorView id={params.id} />
    </AppShell>
  );
}
