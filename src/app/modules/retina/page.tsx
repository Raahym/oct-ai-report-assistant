import { AppShell } from "@/components/app-shell";
import { LockedModuleView } from "@/components/views";

export default function Page() {
  return (
    <AppShell>
      <LockedModuleView
        moduleName="Retinal Fundus Screening"
        owner="Group 3"
        description="Retinal/fundus disease screening module for DR, glaucoma-style findings, and report output once the Group 3 API is available."
      />
    </AppShell>
  );
}
