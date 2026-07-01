"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PatientProfileView } from "@/components/views";

export default function Page() {
  const params = useParams<{ id: string }>();
  return (
    <AppShell>
      <PatientProfileView id={params.id} />
    </AppShell>
  );
}
