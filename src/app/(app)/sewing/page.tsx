import { requirePageRole } from "@/lib/pageAuth";
import SewingClient from "./SewingClient";

export default async function SewingPage() {
  await requirePageRole("sewing_supervisor");
  return <SewingClient />;
}
