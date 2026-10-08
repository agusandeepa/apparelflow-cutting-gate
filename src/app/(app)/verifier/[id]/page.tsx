import { requirePageRole } from "@/lib/pageAuth";
import TerminalClient from "./TerminalClient";

export default async function TerminalPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageRole("cutting_verifier");
  const { id } = await params;
  return <TerminalClient orderId={Number(id)} />;
}
