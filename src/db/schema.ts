import {
  pgTable, serial, text, integer, numeric, timestamp, jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const ROLES = ["cutting_supervisor", "cutting_verifier", "sewing_supervisor"] as const;
export type Role = (typeof ROLES)[number];

export const ORDER_STATUSES = ["IN_PROGRESS", "PENDING_VERIFICATION", "REJECTED", "VERIFIED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type LightStatus = "GREEN" | "YELLOW" | "RED";
export type Decision = "APPROVED" | "REJECTED";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<Role>().notNull(),
  fullName: text("full_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recipes = pgTable("recipes", {
  id: serial("id").primaryKey(),
  recipeCode: text("recipe_code").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  stdFabricYards: numeric("std_fabric_yards", { precision: 6, scale: 2 }).notNull(),
  wastageCap: numeric("wastage_cap", { precision: 5, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recipeComponents = pgTable("recipe_components", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
  componentName: text("component_name").notNull(),
  piecesPerGarment: integer("pieces_per_garment").notNull(),
  imageUrl: text("image_url"),
});

export const cuttingOrders = pgTable("cutting_orders", {
  id: serial("id").primaryKey(),
  orderNo: text("order_no")
    .notNull()
    .unique()
    .default(sql`'CUT-' || lpad(nextval('cutting_order_no_seq')::text, 5, '0')`),
  recipeId: integer("recipe_id").notNull().references(() => recipes.id),
  targetQty: integer("target_qty").notNull(),
  fabricRollId: text("fabric_roll_id").notNull(),
  actualFabricYds: numeric("actual_fabric_yds", { precision: 10, scale: 2 }).notNull(),
  status: text("status").$type<OrderStatus>().notNull().default("IN_PROGRESS"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  sewingStartedAt: timestamp("sewing_started_at", { withTimezone: true }),
  sewingStartedBy: integer("sewing_started_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verificationItems = pgTable("verification_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => cuttingOrders.id, { onDelete: "cascade" }),
  componentId: integer("component_id").notNull().references(() => recipeComponents.id),
  expectedQty: integer("expected_qty").notNull(),
  actualQty: integer("actual_qty"),
  status: text("status").$type<LightStatus>(),
  countedBy: integer("counted_by").references(() => users.id),
  countedAt: timestamp("counted_at", { withTimezone: true }),
});

export type ComponentVariance = {
  componentId: number;
  componentName: string;
  expected: number;
  actual: number | null;
  variance: number | null;
  status: LightStatus | null;
};

export const verificationLogs = pgTable("verification_logs", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => cuttingOrders.id),
  verifierId: integer("verifier_id").notNull().references(() => users.id),
  decision: text("decision").$type<Decision>().notNull(),
  rejectionNote: text("rejection_note"),
  approvalNote: text("approval_note"),
  wastagePct: numeric("wastage_pct", { precision: 8, scale: 2 }).notNull(),
  componentVariances: jsonb("component_variances").$type<ComponentVariance[]>().notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});
