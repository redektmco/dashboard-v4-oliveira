import { requireAdmin } from "@/lib/auth";
import { listCharges, listClientContacts, listDispatchLog } from "@/lib/billing/db";
import { isEmailConfigured } from "@/lib/billing/email";
import { isWhatsappConfigured } from "@/lib/billing/whatsapp";
import { Stat } from "@/components/ui";
import { BillingManager } from "@/components/billing-manager";

export const dynamic = "force-dynamic";

export default async function CobrancaPage() {
  await requireAdmin();

  const [clients, charges, log] = await Promise.all([listClientContacts(), listCharges(), listDispatchLog(80)]);

  const active = charges.filter((c) => c.active);
  const in30days = new Date();
  in30days.setDate(in30days.getDate() + 30);
  const cutoff = in30days.toISOString().slice(0, 10);
  const proximos30 = active.filter((c) => c.dueDate <= cutoff);
  const semContato = active.filter((c) => !c.billingEmail && !c.billingPhone);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Cobranças ativas" value={active.length} hint={`${charges.length - active.length} encerrada(s)`} />
        <Stat label="Vencem em 30 dias" value={proximos30.length} tone={proximos30.length ? "amarelo" : "default"} />
        <Stat
          label="Sem contato cadastrado"
          value={semContato.length}
          tone={semContato.length ? "vermelho" : "verde"}
          hint="e-mail/WhatsApp do cliente"
        />
        <Stat
          label="Canais configurados"
          value={[isEmailConfigured() && "E-mail", isWhatsappConfigured() && "WhatsApp"].filter(Boolean).join(" · ") || "Nenhum"}
          tone={isEmailConfigured() || isWhatsappConfigured() ? "verde" : "vermelho"}
        />
      </div>

      <BillingManager
        clients={clients}
        charges={charges}
        log={log}
        emailConfigured={isEmailConfigured()}
        whatsappConfigured={isWhatsappConfigured()}
      />
    </>
  );
}
