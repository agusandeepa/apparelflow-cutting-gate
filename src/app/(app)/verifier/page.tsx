import { requirePageRole } from "@/lib/pageAuth";
import VerifierQueueClient from "./VerifierQueueClient";

export default async function VerifierPage() {
  await requirePageRole("cutting_verifier");
  return <VerifierQueueClient />;
}
