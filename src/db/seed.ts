import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { DB } from "./client";
import { users, recipes, recipeComponents } from "./schema";
import { DEMO_USERS } from "@/lib/demo";

const RECIPES = [
  {
    recipeCode: "REC-BL01", name: "Casual Blouse", category: "Blouse", stdFabricYards: "1.80", wastageCap: "5.00",
    components: [
      ["Front Body Panel", 1], ["Back Body Panel", 1], ["Sleeves (Left & Right)", 2],
      ["Collar & Stand", 1], ["Sleeve Cuffs", 2],
    ] as [string, number][],
  },
  {
    recipeCode: "REC-CT02", name: "Crop Top", category: "Crop Top", stdFabricYards: "1.10", wastageCap: "8.00",
    components: [
      ["Front Chest Panel", 1], ["Back Support Panel", 1], ["Neck Binding Strip", 1],
      ["Hem Elastic Casing", 1], ["Side Strap Accents", 2],
    ] as [string, number][],
  },
];

/** Idempotent: safe to run repeatedly. `rounds` is the bcrypt cost (lowered in tests for speed). */
export async function seedDatabase(db: DB, rounds = 10): Promise<void> {
  for (const u of DEMO_USERS) {
    const passwordHash = await bcrypt.hash(u.password, rounds);
    await db.insert(users)
      .values({ email: u.email, passwordHash, role: u.role, fullName: u.fullName })
      .onConflictDoNothing({ target: users.email });
  }

  for (const r of RECIPES) {
    const [existing] = await db.select({ id: recipes.id }).from(recipes).where(eq(recipes.recipeCode, r.recipeCode));
    if (existing) continue;
    const [row] = await db.insert(recipes).values({
      recipeCode: r.recipeCode, name: r.name, category: r.category,
      stdFabricYards: r.stdFabricYards, wastageCap: r.wastageCap,
    }).returning({ id: recipes.id });
    await db.insert(recipeComponents).values(
      r.components.map(([componentName, piecesPerGarment]) => ({ recipeId: row.id, componentName, piecesPerGarment })),
    );
  }
}
