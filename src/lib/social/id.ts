import { randomBytes, randomUUID } from "node:crypto";

/** Id curto e estável para entidades. */
export function newId(prefix = ""): string {
  return prefix + randomUUID().replace(/-/g, "").slice(0, 16);
}

/** Token longo, url-safe e não-adivinhável para o link do cliente (guest). */
export function newToken(): string {
  return randomBytes(18).toString("base64url");
}
