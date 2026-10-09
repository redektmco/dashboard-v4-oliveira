"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveClient } from "@/actions";
import { targetKeysFor } from "@/lib/model/catalog";
import { ACCOUNT_TYPE_LABEL, type AccountType, type User } from "@/lib/model/types";
import { ActionForm, SubmitButton } from "../form-controls";
import { NumberField } from "../number-field";
import { ServicePicker } from "../service-picker";
import { Icon } from "../icon";

/**
 * Cadastro de cliente em seções.
 *
 * O princípio da tela: dá para criar o cliente com o essencial e completar o
 * resto depois, na ficha. Por isso só nome, tipo de conta e responsáveis são
 * exigidos — contrato, forecast e relacionamento podem ficar em branco e a
 * conta nasce assim mesmo. A navegação lateral mostra o que falta sem
 * bloquear o salvamento.
 */

type SectionId = "basico" | "responsaveis" | "contrato" | "forecast" | "relacionamento";

const SECTIONS: { id: SectionId; n: string; title: string; essential: boolean; hint: string }[] = [
  { id: "basico", n: "01", title: "Dados básicos", essential: true, hint: "Como o cliente aparece na carteira e nos relatórios." },
  { id: "responsaveis", n: "02", title: "Responsáveis", essential: true, hint: "Quem responde pelo cliente no dia a dia." },
  { id: "contrato", n: "03", title: "Contrato", essential: false, hint: "Base para MRR, renovação e cobrança." },
  { id: "forecast", n: "04", title: "Forecast e fontes de leads", essential: false, hint: "Pode ficar para depois: o score usa o forecast a partir do primeiro mês completo." },
  { id: "relacionamento", n: "05", title: "Relacionamento", essential: false, hint: "Contato do lado do cliente e ritmo de acompanhamento." },
];

export function ClientWizard({ users }: { users: User[] }) {
  const router = useRouter();
  const [type, setType] = useState<AccountType>("lead_gen");
  const [name, setName] = useState("");
  const [account, setAccount] = useState("");
  const [gt, setGt] = useState("");

  const gts = users.filter((u) => u.role === "gt");
  const accounts = users.filter((u) => u.role === "account");

  // O que falta para o botão deixar de ser um palpite.
  const missing = [!name.trim() && "o nome do cliente", !account && "o Account", !gt && "o GT"].filter(Boolean) as string[];

  return (
    <ActionForm
      action={saveClient}
      className="flex flex-col gap-6"
      onSuccess={() => router.push("/clientes")}
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* navegação das seções */}
        <nav className="top-6 flex shrink-0 flex-col gap-1 lg:sticky lg:w-[232px]" aria-label="Seções do cadastro">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#secao-${s.id}`}
              className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-ink-850"
            >
              <span className="tnum mt-px shrink-0 text-[11px] font-semibold text-ink-500">{s.n}</span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] text-ink-200">{s.title}</span>
                <span className="truncate text-[11px] text-ink-500">{s.essential ? "Essencial" : "Opcional"}</span>
              </span>
            </a>
          ))}
          <p className="mt-2 flex gap-2 rounded-lg border border-[var(--border-hair)] p-2.5 text-[11px] leading-relaxed text-ink-400">
            <Icon name="info" size={13} className="mt-px shrink-0" />
            <span>
              Campos com <span className="text-v4-red">*</span> são essenciais. Só eles são exigidos para criar o cliente — forecast,
              integrações e relacionamento podem ser completados depois, na ficha.
            </span>
          </p>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <Section id="basico">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome do cliente" required help="Como aparece na carteira.">
                <input name="name" value={name} onChange={(e) => setName(e.target.value)} className="field" required autoFocus maxLength={120} />
              </Field>
              <Field label="Tipo de conta" required help="Define quais indicadores o score usa.">
                <select name="account_type" value={type} onChange={(e) => setType(e.target.value as AccountType)} className="field">
                  {(Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((t) => (
                    <option key={t} value={t}>
                      {ACCOUNT_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Segmento" help="Usado no benchmark com unidades da rede do mesmo nicho.">
                <input name="niche" className="field" placeholder="Imóveis, Odontologia…" maxLength={120} />
              </Field>
              <Field label="Proximidade" help="Perto = visita; longe = vídeo com câmera aberta.">
                <select name="proximity" className="field" defaultValue="">
                  <option value="">Não definida</option>
                  <option value="perto">Perto</option>
                  <option value="longe">Longe</option>
                </select>
              </Field>
            </div>
          </Section>

          <Section id="responsaveis">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Account" required help="Responde pelo relacionamento e pelo check-in.">
                <select name="account_user_id" value={account} onChange={(e) => setAccount(e.target.value)} className="field" required>
                  <option value="">Escolha o Account</option>
                  {accounts.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="GT (gestor de tráfego)" required help="Responde pela mídia e pelo forecast.">
                <select name="gt_user_id" value={gt} onChange={(e) => setGt(e.target.value)} className="field" required>
                  <option value="">Escolha o GT</option>
                  {gts.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Section>

          <Section id="contrato">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="MRR" help="Valor mensal recorrente, sem setup.">
                <NumberField name="mrr" step="0.01" defaultValue="" placeholder="0,00" />
              </Field>
              <Field label="Início do contrato" help="Base da etapa de onboarding.">
                <input type="date" name="contract_start" className="field" />
              </Field>
              <Field label="Renovação" help="Entra no score e na etapa de renovação.">
                <input type="date" name="renewal_date" className="field" />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Número do contrato">
                <input name="contract_code" className="field" maxLength={60} />
              </Field>
              <Field label="Fidelidade (meses)">
                <NumberField name="fidelity_months" step="1" defaultValue="" placeholder="—" />
              </Field>
              <Field label="Aviso prévio (dias)">
                <NumberField name="notice_days" step="1" defaultValue="" placeholder="—" />
              </Field>
            </div>
            <Field label="Serviços contratados" help="O painel deixa de mostrar campanha de canal que o cliente não contratou.">
              <ServicePicker />
            </Field>
          </Section>

          <Section id="forecast">
            <div className="grid gap-3 sm:grid-cols-3">
              {targetKeysFor(type).map((t) => (
                <Field key={t.key} label={t.label}>
                  <NumberField name={t.key} step="any" defaultValue="" placeholder="—" />
                </Field>
              ))}
            </div>
            <Field label="Forecast vale a partir de">
              <input type="date" name="effective_from" defaultValue={new Date().toISOString().slice(0, 10)} className="field" />
            </Field>
            <p className="flex gap-2 text-[12px] text-ink-500">
              <Icon name="info" size={13} className="mt-px shrink-0" />
              As integrações (Meta Ads, Google Ads e o webhook do CRM) são conectadas depois, no painel do cliente.
            </p>
          </Section>

          <Section id="relacionamento">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Contato principal" help="Quem fala com a gente do lado do cliente.">
                <input name="main_contact" className="field" maxLength={120} />
              </Field>
              <Field label="E-mail">
                <input type="email" name="contact_email" className="field" maxLength={160} />
              </Field>
              <Field label="WhatsApp">
                <input name="contact_phone" className="field" maxLength={40} placeholder="(31) 90000-0000" />
              </Field>
            </div>
            <Field label="Ritmo de check-in" help="Em dias. Sem isto vale o limite global do modelo.">
              <NumberField name="checkin_every_days" step="1" defaultValue="" placeholder="—" />
            </Field>
          </Section>
        </div>
      </div>

      {/* rodapé de ações */}
      <footer className="form-actions flex flex-wrap items-center gap-3 border-t border-[var(--border-hair)] pt-4">
        <p className="min-w-0 flex-1 text-[12px] text-ink-400">
          {missing.length === 0 ? (
            <span className="flex items-center gap-1.5 text-verde-fg">
              <Icon name="checkCircle" size={13} />
              Pronto para criar. O resto pode ser completado depois, na ficha.
            </span>
          ) : (
            `Falta ${missing.join(", ")}.`
          )}
        </p>
        <button type="button" className="btn" onClick={() => router.push("/clientes")}>
          Cancelar
        </button>
        <SubmitButton pendingLabel="Criando…" disabled={missing.length > 0}>
          Criar cliente
        </SubmitButton>
      </footer>
    </ActionForm>
  );
}

/* ----------------------------- pedaços ----------------------------- */

function Section({ id, children }: { id: SectionId; children: React.ReactNode }) {
  const s = SECTIONS.find((x) => x.id === id)!;
  return (
    <section id={`secao-${id}`} className="panel flex scroll-mt-6 flex-col gap-3.5 p-4 sm:p-5">
      <header className="flex flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="tnum text-[11px] font-semibold text-ink-500">{s.n}</span>
          <h2 className="font-display text-[15px] font-semibold text-ink-100">{s.title}</h2>
          <span className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${s.essential ? "text-v4-red" : "text-ink-500"}`}>
            {s.essential ? "Essencial" : "Opcional"}
          </span>
        </span>
        <p className="text-[12px] text-ink-400">{s.hint}</p>
      </header>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  help,
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="label">
        {label}
        {required && <span className="ml-0.5 text-v4-red">*</span>}
      </span>
      {children}
      {help && <span className="text-[11px] text-ink-500">{help}</span>}
    </label>
  );
}
