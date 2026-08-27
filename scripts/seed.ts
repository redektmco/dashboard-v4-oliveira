/**
 * Recria a carteira de demonstração do zero.
 *   npx dotenv -e .env.local -- npx tsx scripts/seed.ts
 *
 * APAGA todos os dados existentes.
 */
import { migrate } from "../src/lib/db";
import { seedDemo } from "../src/lib/repo";

await migrate();
const n = await seedDemo();
console.log(`Seed pronto: ${n} clientes com 8 semanas de série e score recalculado.`);
