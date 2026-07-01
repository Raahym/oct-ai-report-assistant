import { AppShell } from "@/components/app-shell";
import { SearchPatientsView } from "@/components/views";

export default function Page() {
  return (
    <AppShell>
      <SearchPatientsView />
    </AppShell>
  );
}
