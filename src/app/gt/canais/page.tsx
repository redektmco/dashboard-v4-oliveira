import { requireAdmin } from "@/lib/auth";
import { isEmailConfigured } from "@/lib/billing/email";
import { isWhatsappConfigured } from "@/lib/billing/whatsapp";
import { listCharges } from "@/lib/billing/db";
import { ConfigPage } from "@/components/config-shell";
import { Icon, type IconName } from "@/components/icon";
import { PageTitle, Pill } from "@/components/kit";
import { TestDispatchButton } from "@/components/config/channels-ui";

export const dynamic = "force-dynamic";

/** Mostra só o começo e o fim de um valor de configuração (nunca o segredo). */
const mask = (v: string | undefined) => (v ? (v.length > 10 ? `${v.slice(0, 4)}…${v.slice(-3)}` : "configurado") : null);

/**
 * Canais de envio das cobranças. As credenciais ficam nas variáveis de
 * ambiente da Vercel — nunca no banco —, então esta página diz o que está
 * ligado, o que falta e o passo a passo para ligar cada canal.
 */
export default async function CanaisPage() {
  await requireAdmin();
  const charges = (await listCharges()).filter((c) => c.active);
  const emailOn = isEmailConfigured();
  const waOn = isWhatsappConfigured();
  const withEmail = charges.filter((c) => c.billingEmail).length;
  const withPhone = charges.filter((c) => c.billingPhone).length;

  return (
    <ConfigPage>
      <PageTitle
        title="Canais de envio"
        description="E-mail e WhatsApp que disparam as cobranças no vencimento. Sem canal, a cobrança fica registrada mas não sai."
        aside={<TestDispatchButton />}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Channel
          id="email"
          icon="mail"
          title="E-mail"
          on={emailOn}
          provider="Resend"
          info={[
            { k: "Remetente", v: process.env.BILLING_FROM_EMAIL ?? "—" },
            { k: "Cobranças com e-mail", v: `${withEmail} de ${charges.length}` },
          ]}
          steps={[
            <>
              Crie uma conta no <a href="https://resend.com" target="_blank" rel="noreferrer" className="text-ink-100 underline">Resend</a> e verifique o domínio de onde as faturas vão sair.
            </>,
            <>Gere uma chave de API (permissão de envio).</>,
            <>
              Na Vercel, em <strong className="text-ink-100">Settings › Environment Variables</strong>, crie <Env>RESEND_API_KEY</Env> com a chave e <Env>BILLING_FROM_EMAIL</Env> com o remetente
              (ex.: <span className="font-mono text-[12px]">Faturas V4 &lt;faturas@seudominio.com&gt;</span>).
            </>,
            <>Faça um novo deploy e use “Testar disparo” para conferir.</>,
          ]}
          envs={[
            { name: "RESEND_API_KEY", value: mask(process.env.RESEND_API_KEY) },
            { name: "BILLING_FROM_EMAIL", value: process.env.BILLING_FROM_EMAIL ?? null },
          ]}
        />
        <Channel
          id="whatsapp"
          icon="messageCircle"
          title="WhatsApp"
          on={waOn}
          provider="Meta Cloud API"
          info={[
            { k: "Template", v: process.env.WHATSAPP_TEMPLATE_NAME ?? "—" },
            { k: "Cobranças com WhatsApp", v: `${withPhone} de ${charges.length}` },
          ]}
          steps={[
            <>No Meta Business Manager, cadastre o número da unidade no WhatsApp Business Platform.</>,
            <>
              Aprove um template de cobrança com 4 variáveis, nesta ordem: nome do cliente, descrição, valor e vencimento.
            </>,
            <>
              Na Vercel, crie <Env>WHATSAPP_TOKEN</Env>, <Env>WHATSAPP_PHONE_ID</Env> e <Env>WHATSAPP_TEMPLATE_NAME</Env> (e <Env>WHATSAPP_TEMPLATE_LANG</Env>, se não for pt_BR).
            </>,
            <>Faça um novo deploy e use “Testar disparo” para conferir.</>,
          ]}
          envs={[
            { name: "WHATSAPP_TOKEN", value: mask(process.env.WHATSAPP_TOKEN) },
            { name: "WHATSAPP_PHONE_ID", value: process.env.WHATSAPP_PHONE_ID ?? null },
            { name: "WHATSAPP_TEMPLATE_NAME", value: process.env.WHATSAPP_TEMPLATE_NAME ?? null },
          ]}
        />
      </div>
    </ConfigPage>
  );
}

function Env({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-ink-850 px-1 py-0.5 font-mono text-[12px] text-ink-100">{children}</code>;
}

function Channel({
  id,
  icon,
  title,
  on,
  provider,
  info,
  steps,
  envs,
}: {
  id: string;
  icon: IconName;
  title: string;
  on: boolean;
  provider: string;
  info: { k: string; v: string }[];
  steps: React.ReactNode[];
  envs: { name: string; value: string | null }[];
}) {
  return (
    <section id={id} className="flex scroll-mt-6 flex-col gap-4 rounded-xl border border-[var(--border-hair)] bg-ink-900 p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-ink-800 text-ink-100">
          <Icon name={icon} size={17} stroke={1.75} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="font-display text-[15px] font-semibold text-ink-100">{title}</h2>
          <span className="text-[12px] text-ink-400">via {provider}</span>
        </div>
        {on ? <Pill tone="verde">Ativo</Pill> : <Pill tone="vermelho">Não configurado</Pill>}
      </div>
      <div className="flex rounded-lg bg-ink-850">
        {info.map((m, i) => (
          <div key={m.k} className={`flex min-w-0 flex-1 flex-col gap-[3px] px-3 py-2.5 ${i === 0 ? "border-r border-[var(--border-hair)]" : ""}`}>
            <span className="text-[11px] text-ink-400">{m.k}</span>
            <span className="truncate text-[13px] font-semibold text-ink-100">{m.v}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[12px] font-semibold text-ink-300">Variáveis de ambiente</span>
        {envs.map((e) => (
          <div key={e.name} className="flex items-center gap-2 text-[12px]">
            <Icon name={e.value ? "checkCircle" : "xCircle"} size={14} className={e.value ? "text-verde-fg" : "text-ink-500"} />
            <code className="font-mono text-ink-100">{e.name}</code>
            <span className="truncate text-ink-400">{e.value ?? "não definida"}</span>
          </div>
        ))}
      </div>
      {!on && (
        <ol className="flex flex-col gap-3 border-t border-[var(--border-hair)] pt-3.5">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-800 text-[11px] font-semibold text-ink-300">{i + 1}</span>
              <span className="text-[13px] leading-5 text-ink-300">{s}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
