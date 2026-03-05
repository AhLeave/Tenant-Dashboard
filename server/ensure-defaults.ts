import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { users } from "@shared/schema";

const db = drizzle(process.env.DATABASE_URL!);

const DEFAULT_SUPER_ADMINS: { email: string; password: string }[] = [
  { email: "epos@dualtron.ie", password: "Dualtron1!" },
];

export async function ensureDefaultUsers() {
  for (const { email, password } of DEFAULT_SUPER_ADMINS) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length === 0) {
      const passwordHash = await bcrypt.hash(password, 10);
      await db.insert(users).values({
        tenantId: null,
        role: "SUPER_ADMIN",
        email,
        passwordHash,
      });
      console.log(`[startup] Created default SUPER_ADMIN: ${email}`);
    } else {
      console.log(`[startup] Default SUPER_ADMIN already exists: ${email}`);
    }
  }
}
