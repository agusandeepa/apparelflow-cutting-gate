import type { Role } from "@/db/schema";

// Public demo credentials (also listed in README + shown on the login screen).
export const DEMO_USERS: { role: Role; label: string; fullName: string; email: string; password: string; home: string }[] = [
  { role: "cutting_supervisor", label: "Cutting Supervisor", fullName: "Nimali Perera",  email: "supervisor@apparelflow.demo", password: "Supervisor@123", home: "/supervisor" },
  { role: "cutting_verifier",   label: "Cutting Verifier",   fullName: "Kasun Fernando", email: "verifier@apparelflow.demo",   password: "Verifier@123",   home: "/verifier" },
  { role: "sewing_supervisor",  label: "Sewing Supervisor",  fullName: "Dilani Silva",   email: "sewing@apparelflow.demo",     password: "Sewing@123",     home: "/sewing" },
];

export const ROLE_HOME: Record<Role, string> = {
  cutting_supervisor: "/supervisor",
  cutting_verifier: "/verifier",
  sewing_supervisor: "/sewing",
};

export const ROLE_LABEL: Record<Role, string> = {
  cutting_supervisor: "Cutting Supervisor",
  cutting_verifier: "Cutting Verifier",
  sewing_supervisor: "Sewing Supervisor",
};
