import { requirePageRole } from "@/lib/pageAuth";
import SupervisorClient from "./SupervisorClient";

export default async function SupervisorPage() {
  await requirePageRole("cutting_supervisor");
  return <SupervisorClient />;
}
