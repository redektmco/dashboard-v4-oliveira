import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getClient, today } from "@/lib/repo";
import { parsePeriod, periodQuery } from "@/lib/ficha-period";
import { salesPage } from "@/lib/crm/sales";

/** Compatibilidade com links antigos: vendas agora é uma aba da ficha. */
export default async function SalesPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ periodo?: string | string[]; de?: string | string[]; ate?: string | string[]; page?: string | string[] }>;
}) {
  await requireUser();
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) notFound();
  if (!(await getClient(Number(id)))) notFound();
  const sp = await searchParams;
  const query = new URLSearchParams(periodQuery(parsePeriod(sp, today())));
  const page = salesPage(sp.page);
  if (page > 1) query.set("vendas_pagina", String(page));
  redirect(`/clientes/${id}${query.size ? `?${query}` : ""}#vendas`);
}
