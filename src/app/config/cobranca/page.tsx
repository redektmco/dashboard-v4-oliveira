import { requireAdmin } from "@/lib/auth";
import { listCharges, listClientContacts, listDispatchLog } from "@/lib/billing/db";
import { isEmailConfigured } from "@/lib/billing/email";
import { isWhatsappConfigured } from "@/lib/billing/whatsapp";
import { listClients } from "@/lib/repo";
import { BillingBoard } from "@/components/config/billing-board";

export const dynamic = "force-dynamic";

export default async function CobrancaPage() {
  await requireAdmin();
  const [clients, contacts, charges, log] = await Promise.all([listClients(), listClientContacts(), listCharges(), listDispatchLog(80)]);
  const contactOf = new Map(contacts.map((c) => [c.id, c]));
  return (
    <BillingBoard
      clients={clients.map((c) => ({
        id: c.id,
        name: c.name,
        mrr: c.mrr,
        renewalDate: c.renewal_date,
        billingEmail: contactOf.get(c.id)?.billingEmail ?? null,
        billingPhone: contactOf.get(c.id)?.billingPhone ?? null,
      }))}
      charges={charges}
      log={log}
      emailOn={isEmailConfigured()}
      waOn={isWhatsappConfigured()}
    />
  );
}
