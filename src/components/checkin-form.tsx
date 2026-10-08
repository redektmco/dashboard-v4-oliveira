"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { previewCheckin, saveCheckin } from "@/actions";
import type { Band, User } from "@/lib/model/types";
import { Icon, type IconName } from "./icon";
import { SidePanel } from "./side-panel";
import { SubmitButton } from "./form-controls";
import { BAND_STYLE, brl, dateBR } from "./ui";

/** Uma pergunta de escala 1–5, já com o texto do catálogo. */
export type Scale = { key: string; question: string; anchors: Record<number, string> };

export type CheckinProps = {
  client: { id: number; name: string; typeLabel: string; accountName: string | null; gtName: string | null; mrr: number; renewalDate: string | null };
  history: { id: number; date: string; filler: string | null; scales: (number | null)[]; risk: boolean; riskNote: string }[];
  accounts: User[];
  me: { id: number; name: string };
  scales: Scale[];
  previous: { score: number | null; band: Band | null } | null;
  today: string;
};

/* Textos da tela (título curto, pergunta curta, âncoras e dica do roteiro). */
const COPY: Record<string, { title: string; short: string; lo: string; hi: string; tip: string }> = {
  q1_satisfaction: { title: "Satisfação com o resultado", short: "Quão satisfeito está com o resultado do período", lo: "Insatisfeito", hi: "Superou o esperado", tip: "Se responder por cima, peça o número: “me dá uma nota de 1 a 5”." },
  q2_climate: { title: "Relacionamento e comunicação", short: "Como avalia a relação e a comunicação no dia a dia", lo: "Relação tensa", hi: "Parceria", tip: "Se houver atrito, deixe o cliente terminar antes de responder." },
  q3_trust: { title: "Intenção de continuidade", short: "Qual a chance de seguir no próximo ciclo", lo: "Avaliando sair", hi: "Já fala de próximos passos", tip: "Pergunta direta. Não sugira a resposta." },
  q4_lead_quality: { title: "Qualidade dos leads", short: "Como o time comercial avalia os leads recebidos", lo: "Improváveis", hi: "Qualificados, no perfil", tip: "É a visão do cliente, não a nossa." },
  q5_engagement: { title: "Ritmo do time do cliente", short: "Acompanhamento de aprovações, materiais e calls", lo: "Quase não responde", hi: "Rápido, sem cobrança", tip: "Aprovações, materiais e presença nas calls." },
  q6_expectation: { title: "Expectativa vs. entrega", short: "O entregue corresponde ao esperado no fechamento", lo: "Outra coisa", hi: "Acima do combinado", tip: "Nota baixa com resultado bom indica problema de expectativa." },
};

type Answer = number | "np" | null;
type Draft = {
  scales: Record<string, Answer>;
  attendance: "full" | "partial" | "none";
  payment: "sim" | "nao" | "nv";
  renewal: string;
  risk: "nao" | "sim" | "nao_sei";
  riskNote: string;
  createPlan: boolean;
  planOwner: string;
  planDue: string;
  summary: string;
  filledBy: string;
  refDate: string;
};

const plusDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * O rascunho vive no navegador (localStorage), então o formulário só monta
 * depois da hidratação: assim o estado inicial já nasce com o rascunho, sem
 * piscar vazio nem atualizar estado dentro de efeito.
 */
export function CheckinForm(props: CheckinProps) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!mounted) return <div className="min-h-[60vh]" aria-busy="true" />;
  return <CheckinFormInner {...props} />;
}

function CheckinFormInner({ client, history, accounts, me, scales, previous, today }: CheckinProps) {
  const storageKey = `healthscore.checkin.draft.${client.id}`;
  const defaultFiller = String(accounts.find((a) => a.id === me.id)?.id ?? accounts[0]?.id ?? "");
  const initial = useMemo<Draft>(
    () => ({
      scales: Object.fromEntries(scales.map((s) => [s.key, null])),
      attendance: "full",
      payment: "nv",
      renewal: client.renewalDate ?? "",
      risk: "nao",
      riskNote: "",
      createPlan: true,
      planOwner: client.accountName ?? me.name,
      planDue: plusDays(today, 7),
      summary: "",
      filledBy: defaultFiller,
      refDate: today,
    }),
    [scales, client.renewalDate, client.accountName, me.name, today, defaultFiller],
  );
  const saved = useMemo(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as { d: Draft; at: string }) : null;
    } catch {
      return null; // rascunho corrompido: começa limpo
    }
  }, [storageKey]);
  const [d, setD] = useState<Draft>(() => (saved ? { ...initial, ...saved.d, scales: { ...initial.scales, ...saved.d.scales } } : initial));
  const [savedAt, setSavedAt] = useState<string | null>(saved?.at ?? null);
  const [script, setScript] = useState(false);
  const [ficha, setFicha] = useState(false);
  const [delegating, setDelegating] = useState(false);
  const [adjustPlan, setAdjustPlan] = useState(false);
  const [preview, setPreview] = useState<{ score: number | null; band: Band | null } | null>(null);
  const set = (patch: Partial<Draft>) => setD((cur) => ({ ...cur, ...patch }));

  const touched = scales.some((s) => d.scales[s.key] !== null) || d.riskNote.trim() !== "" || d.summary.trim() !== "";
  // Salva sozinho, sem pedir nada: 600 ms depois da última alteração.
  useEffect(() => {
    if (!touched) return;
    const t = setTimeout(() => {
      const at = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
      try {
        localStorage.setItem(storageKey, JSON.stringify({ d, at }));
        setSavedAt(at);
      } catch {
        /* armazenamento cheio ou bloqueado: segue sem rascunho */
      }
    }, 600);
    return () => clearTimeout(t);
  }, [d, touched, storageKey]);

  const discard = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    setD(initial);
    setSavedAt(null);
    setPreview(null);
  };

  /* ------------------------------ progresso ------------------------------ */
  const answered = scales.filter((s) => d.scales[s.key] !== null);
  const facts = [Boolean(d.attendance), Boolean(d.payment), Boolean(d.renewal)];
  const factsDone = facts.filter(Boolean).length;
  const total = scales.length + facts.length + 1;
  const done = answered.length + factsDone + 1;
  const pending = total - done;
  const firstPending = scales.find((s) => d.scales[s.key] === null);

  // Resultado só aparece com tudo respondido — para não influenciar a avaliação.
  const values = useMemo(() => formValues(d, scales), [d, scales]);
  const key = pending === 0 ? JSON.stringify(values) : "";
  useEffect(() => {
    if (!key) return;
    let alive = true;
    const t = setTimeout(() => {
      previewCheckin(client.id, JSON.parse(key) as Record<string, string>)
        .then((r) => alive && setPreview(r))
        .catch(() => alive && setPreview(null));
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [key, client.id]);
  const result = pending === 0 ? preview : null;

  const filler = accounts.find((a) => String(a.id) === d.filledBy);
  const delegated = filler && filler.id !== me.id;
  const goTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <form
      action={saveCheckin}
      onSubmit={() => {
        try {
          localStorage.removeItem(storageKey);
        } catch {}
      }}
      className="-mx-4 -mt-4 sm:-mx-6 lg:-mx-7 lg:-mt-5"
    >
      {Object.entries(values).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input type="hidden" name="client_id" value={client.id} />

      {/* ----------------------------- barra superior ----------------------------- */}
      <div className="flex min-h-[55px] flex-wrap items-center justify-between gap-2 border-b border-[var(--border-hair)] px-4 py-2 sm:px-6 lg:px-10">
        <nav className="flex min-w-0 items-center gap-1.5 text-[13px]" aria-label="Caminho">
          <Link href="/account" className="inline-flex items-center gap-1.5 text-ink-300 hover:text-ink-100">
            <Icon name="arrowLeft" size={15} />
            Check-ins
          </Link>
          <span className="text-ink-500">/</span>
          <span className="truncate text-ink-500">{client.name}</span>
        </nav>
        <p className="flex items-center gap-2 text-[12px] text-ink-300" aria-live="polite">
          <Icon name="checkCircle" size={15} className={savedAt ? "text-verde-fg" : "text-ink-500"} />
          {savedAt ? `Rascunho salvo automaticamente · ${savedAt}` : "O rascunho é salvo automaticamente"}
        </p>
      </div>

      <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-10">
        {/* -------------------------------- cabeçalho -------------------------------- */}
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-[22px] font-semibold leading-tight text-ink-100 sm:text-[26px]">Novo check-in · {client.name}</h1>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-800 px-2.5 py-1 text-[12px] font-medium text-ink-300">
                <span className="h-1.5 w-1.5 rounded-full bg-ink-300" />
                Rascunho
              </span>
            </div>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-300">
              <span>{client.typeLabel}</span>
              <Sep />
              <span>
                <span className="text-ink-500">Account </span>
                {client.accountName ?? "—"}
              </span>
              <Sep />
              <span>
                <span className="text-ink-500">GT </span>
                {client.gtName ?? "—"}
              </span>
              <Sep />
              <span>{brl(client.mrr)}/mês</span>
              <Sep />
              <span>
                <span className="text-ink-500">Último check-in </span>
                {history[0] ? dateBR(history[0].date) : "nenhum — primeiro registro"}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setFicha(true)}>
              <Icon name="panelLeft" size={15} />
              Ficha e histórico
            </button>
            <button type="button" className="btn" onClick={() => setScript(true)}>
              <Icon name="book" size={16} />
              Abrir roteiro da ligação
            </button>
          </div>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* -------------------------------- formulário -------------------------------- */}
          <div className="space-y-4">
            <Section n={1} title="Percepção do cliente" tag={{ icon: "play", label: "Durante a ligação" }} count={`${answered.length} de ${scales.length} respondidas`}
              hint="Anote a nota que o cliente der para cada tema. O enunciado completo para ler em voz alta fica no roteiro — aqui só o registro.">
              {scales.map((s, i) => (
                <Rating
                  key={s.key}
                  id={`q-${s.key}`}
                  scale={s}
                  value={d.scales[s.key]}
                  onChange={(v) => set({ scales: { ...d.scales, [s.key]: v } })}
                  last={i === scales.length - 1}
                />
              ))}
            </Section>

            <Section n={2} title="Fatos objetivos" tag={{ icon: "listCheck", label: "Depois da ligação · não perguntar ao cliente" }} count={`${factsDone + 1} de 4 preenchidos`}
              hint="Dados que você já sabe ou verifica internamente. Se não tiver certeza, marque como não verificado em vez de chutar.">
              <Group label="Registro da reunião e contrato">
                <Fact title="Presença no check-in" hint="Quem do cliente participou da call agendada">
                  <Seg
                    label="Presença"
                    value={d.attendance}
                    onChange={(v) => set({ attendance: v })}
                    options={[["full", "Compareceu"], ["partial", "Remarcou"], ["none", "Faltou"]]}
                  />
                </Fact>
                <Fact title="Adimplência" hint="Pagamento em dia na data de hoje">
                  <Seg
                    label="Adimplência"
                    value={d.payment}
                    onChange={(v) => set({ payment: v })}
                    options={[["sim", "Em dia"], ["nao", "Em atraso"], ["nv", "Não verificado"]]}
                  />
                </Fact>
                <Fact title="Janela de renovação" hint="Data de renovação prevista no contrato" last>
                  <div className="flex items-center gap-2">
                    <input
                      id="renewal-date"
                      type="date"
                      value={d.renewal}
                      onChange={(e) => set({ renewal: e.target.value })}
                      className="field h-8 w-[168px] [color-scheme:dark]"
                      aria-label="Data de renovação"
                    />
                    {d.renewal && <RenewalIn from={today} to={d.renewal} />}
                  </div>
                </Fact>
              </Group>

              <Group label="Sinal de risco">
                <Fact title="Risco explícito de saída" hint="O cliente citou concorrente, corte de verba ou insatisfação grave?" last={d.risk !== "sim"}>
                  <Seg
                    label="Risco explícito de saída"
                    value={d.risk}
                    onChange={(v) => set({ risk: v })}
                    options={[["nao", "Não"], ["sim", "Sim"], ["nao_sei", "Não sei"]]}
                    danger="sim"
                  />
                </Fact>
                {d.risk === "sim" && (
                  <div className="mx-4 mb-4 space-y-3 rounded-[10px] border border-vermelho/20 bg-vermelho-dim/40 p-3 sm:mx-6">
                    <label className="block">
                      <span className="text-[12px] font-medium text-ink-100">Qual é o risco?</span>
                      <textarea
                        rows={2}
                        value={d.riskNote}
                        onChange={(e) => set({ riskNote: e.target.value })}
                        className="field mt-1.5"
                        placeholder="Ex.: recebeu proposta de outra agência com fee menor e decide até o fim do mês."
                      />
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={d.createPlan}
                        aria-label="Criar plano de ação ao salvar"
                        onClick={() => set({ createPlan: !d.createPlan })}
                        className={`flex h-[18px] w-8 shrink-0 items-center rounded-full p-0.5 transition-colors ${d.createPlan ? "justify-end bg-ink-100" : "justify-start bg-ink-700"}`}
                      >
                        <span className={`h-3.5 w-3.5 rounded-full ${d.createPlan ? "bg-ink-950" : "bg-ink-300"}`} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-ink-100">Criar plano de ação ao salvar</p>
                        <p className="text-[12px] text-ink-300">
                          Responsável {d.planOwner || "—"} · prazo {d.planDue ? dateBR(d.planDue) : "—"} · aparece em Pendências da carteira
                        </p>
                      </div>
                      {d.createPlan && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdjustPlan((v) => !v)} aria-expanded={adjustPlan}>
                          <Icon name="pencil" size={14} />
                          Ajustar
                        </button>
                      )}
                    </div>
                    {d.createPlan && adjustPlan && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="text-[12px] text-ink-300">Responsável</span>
                          <input className="field mt-1" value={d.planOwner} onChange={(e) => set({ planOwner: e.target.value })} />
                        </label>
                        <label className="block">
                          <span className="text-[12px] text-ink-300">Prazo</span>
                          <input type="date" className="field mt-1 [color-scheme:dark]" value={d.planDue} onChange={(e) => set({ planDue: e.target.value })} />
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </Group>
            </Section>

            <section className="panel space-y-2.5 p-4 sm:p-6" aria-labelledby="resumo-title">
              <div className="flex flex-wrap items-center gap-2.5">
                <StepBadge n={3} />
                <h2 id="resumo-title" className="text-[15px] font-semibold text-ink-100">Resumo da conversa</h2>
                <span className="text-[12px] text-ink-500">Opcional · não entra no score</span>
              </div>
              <textarea
                rows={3}
                value={d.summary}
                onChange={(e) => set({ summary: e.target.value })}
                className="field"
                placeholder="Contexto que ajuda o próximo leitor: o que mudou, combinados, próximos passos…"
                aria-labelledby="resumo-title"
              />
            </section>
          </div>

          {/* ------------------------------- painel de resumo ------------------------------- */}
          <aside className="space-y-3 lg:sticky lg:top-4" aria-label="Resumo do check-in">
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardLabel>Progresso</CardLabel>
                  <p className="flex items-baseline gap-1.5">
                    <span className="tnum font-display text-[22px] font-semibold text-ink-100">{done} de {total}</span>
                    <span className="text-[13px] text-ink-300">obrigatórios</span>
                  </p>
                </div>
                <span className="text-[12px] text-ink-500">{pending === 0 ? "Pronto" : `~${Math.max(1, Math.ceil((pending * 20) / 60))} min`}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-ink-800" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
                <div className="h-full rounded-full bg-ink-100 transition-[width]" style={{ width: `${(done / total) * 100}%` }} />
              </div>
              <ul className="space-y-2">
                {[
                  { label: "Percepção do cliente", n: answered.length, of: scales.length, target: firstPending ? `q-${firstPending.key}` : "q-" + scales[0]?.key },
                  { label: "Fatos objetivos", n: factsDone, of: 3, target: "renewal-date" },
                  { label: "Sinal de risco", n: 1, of: 1, target: "renewal-date" },
                ].map((st) => (
                  <li key={st.label}>
                    <button type="button" onClick={() => goTo(st.target)} className="flex w-full items-center gap-2.5 text-left">
                      <Icon name={st.n === st.of ? "checkCircle" : "circleDashed"} size={15} className={st.n === st.of ? "text-ink-300" : "text-ink-100"} />
                      <span className={`flex-1 text-[13px] ${st.n === st.of ? "text-ink-300" : "text-ink-100"}`}>{st.label}</span>
                      <span className="tnum text-[12px] text-ink-500">{st.n}/{st.of}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {firstPending && (
                <button
                  type="button"
                  onClick={() => goTo(`q-${firstPending.key}`)}
                  className="flex items-center justify-between gap-2 rounded-lg bg-amarelo-dim px-3 py-2 text-left text-[13px] font-medium text-amarelo-fg"
                >
                  Falta: {COPY[firstPending.key]?.title ?? firstPending.key}
                  <Icon name="arrowDown" size={14} />
                </button>
              )}
            </Card>

            <Card>
              <CardLabel>Resultado calculado</CardLabel>
              <div className="flex items-center gap-4">
                <p className="flex items-baseline gap-1">
                  <span className={`tnum font-display text-[32px] font-semibold ${result?.band ? BAND_STYLE[result.band].fg : "text-ink-500"}`}>
                    {result?.score != null ? Math.round(result.score) : "—"}
                  </span>
                  <span className="text-[13px] text-ink-500">/100</span>
                </p>
                <p className="text-[12px] leading-[17px] text-ink-300">
                  {result?.band
                    ? `${BAND_STYLE[result.band].label} se salvar agora.`
                    : "Aparece quando todas as respostas estiverem preenchidas — para não influenciar a avaliação."}
                </p>
              </div>
              <dl className="space-y-2 text-[12px]">
                <Row k="Score anterior" v={previous?.score != null ? String(Math.round(previous.score)) : "Sem leitura"} />
                <Row
                  k="Sinal de risco"
                  v={d.risk === "sim" ? "Explícito · peso máximo" : d.risk === "nao_sei" ? "Não sei" : "Nenhum"}
                  tone={d.risk === "sim" ? "text-vermelho-fg" : undefined}
                />
                <Row k="Atualiza a carteira" v="Somente ao salvar" />
              </dl>
              <Link href="/config/modelo" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-300 hover:text-ink-100">
                <Icon name="book" size={15} />
                Como o score é calculado
              </Link>
            </Card>

            <Card>
              <CardLabel>Ao salvar</CardLabel>
              <ul className="space-y-2.5 text-[13px] leading-[18px]">
                <Effect icon="history">Snapshot entra no histórico da conta</Effect>
                <Effect icon="chart">Score e situação da carteira atualizados</Effect>
                {d.risk === "sim" && d.createPlan && (
                  <Effect icon="flag" strong>
                    Plano de ação “Risco de saída” criado para {d.planOwner || "—"}
                  </Effect>
                )}
              </ul>
              <div className="flex items-center gap-2.5 rounded-lg">
                <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink-800 text-[11px] font-semibold text-ink-100">
                  {(filler?.name ?? me.name).charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-ink-100">
                    Registrado por {filler?.name ?? me.name}
                    {delegated ? ` (delegado por você)` : " (você)"}
                  </p>
                  <p className="text-[11px] text-ink-500">Autoria automática · alterações ficam no log</p>
                </div>
                {accounts.length > 1 && (
                  <button type="button" className="text-[12px] font-medium text-ink-300 hover:text-ink-100" onClick={() => setDelegating((v) => !v)} aria-expanded={delegating}>
                    Delegar
                  </button>
                )}
              </div>
              {delegating && (
                <select className="field h-9" value={d.filledBy} onChange={(e) => set({ filledBy: e.target.value })} aria-label="Registrado por">
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              )}
            </Card>

            <div className="space-y-2">
              <SubmitButton className="btn-primary w-full justify-center" pendingLabel="Salvando check-in…" disabled={pending > 0}>
                <Icon name="check" size={16} />
                Salvar check-in
              </SubmitButton>
              <div className="flex items-center justify-between gap-3 text-[12px]">
                <span className="text-ink-500">{pending > 0 ? `Responda ${pending} ${pending === 1 ? "pendência" : "pendências"} para salvar` : "Tudo respondido"}</span>
                <button type="button" onClick={discard} className="font-medium text-ink-300 hover:text-ink-100">
                  Descartar rascunho
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* ------------------------------ gaveta: roteiro ------------------------------ */}
      <SidePanel open={script} onClose={() => setScript(false)} label="Roteiro da ligação" width={416}>
        <div className="space-y-2 border-b border-[var(--border-hair)] p-5">
          <div className="flex items-center gap-2.5">
            <Icon name="book" size={18} className="text-ink-300" />
            <h2 className="flex-1 font-display text-[17px] font-semibold text-ink-100">Roteiro da ligação</h2>
            <button type="button" onClick={() => setScript(false)} className="modal-x" aria-label="Fechar">
              <Icon name="x" size={16} />
            </button>
          </div>
          <p className="text-[13px] leading-[19px] text-ink-300">
            Leia as perguntas em voz alta, na ordem. O roteiro não salva nada — a nota que o cliente der você registra no formulário ao lado.
          </p>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {scales.map((s, i) => {
            const c = COPY[s.key];
            return (
              <div key={s.key} className="space-y-2">
                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase text-ink-500">
                  <span className="tnum">{String(i + 1).padStart(2, "0")}</span>
                  {c?.title ?? s.key}
                </p>
                <p className="text-[15px] font-medium leading-[22px] text-ink-100">“{s.question}”</p>
                {c && <p className="text-[12px] text-ink-300">{c.tip}</p>}
                {c && (
                  <p className="text-[12px] text-ink-500">
                    1 = {c.lo} · 5 = {c.hi}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <p className="m-5 mt-0 flex gap-2.5 rounded-[10px] bg-ink-850 p-3 text-[12px] leading-[17px] text-ink-300">
          <Icon name="alertCircle" size={15} className="mt-0.5 shrink-0" />
          Presença, adimplência, renovação e risco são fatos objetivos — preencha depois da ligação, sem perguntar ao cliente.
        </p>
      </SidePanel>

      {/* ------------------------- gaveta: ficha e histórico ------------------------- */}
      <SidePanel open={ficha} onClose={() => setFicha(false)} label="Ficha e histórico" width={440}>
        <div className="flex items-center gap-2.5 border-b border-[var(--border-hair)] p-5">
          <h2 className="flex-1 font-display text-[17px] font-semibold text-ink-100">Ficha e histórico</h2>
          <button type="button" onClick={() => setFicha(false)} className="modal-x" aria-label="Fechar">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          <dl className="divide-y divide-[var(--border-hair)] rounded-lg border border-[var(--border-hair)] text-[13px]">
            {[
              ["Tipo", client.typeLabel],
              ["GT", client.gtName ?? "—"],
              ["Account", client.accountName ?? "—"],
              ["MRR", brl(client.mrr)],
              ["Renovação", client.renewalDate ? dateBR(client.renewalDate) : "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3 px-3 py-2.5">
                <dt className="text-ink-400">{k}</dt>
                <dd className="truncate font-medium text-ink-100">{v}</dd>
              </div>
            ))}
          </dl>
          <div>
            <h3 className="label mb-2">Check-ins recentes</h3>
            {history.length === 0 ? (
              <p className="text-[13px] text-ink-400">Nenhum check-in registrado ainda. Este será o primeiro ponto da curva.</p>
            ) : (
              <ul className="divide-y divide-[var(--border-hair)]">
                {history.map((h) => (
                  <li key={h.id} className="py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="tnum text-[13px] font-semibold text-ink-100">{dateBR(h.date)}</span>
                      <span className="truncate text-[11px] text-ink-500">{h.filler ?? "—"}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {h.scales.map((n, i) => (
                        <span
                          key={i}
                          className={`tnum inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold ${
                            n === null ? "bg-ink-850 text-ink-600" : n >= 4 ? "bg-verde-dim text-verde-fg" : n === 3 ? "bg-ink-800 text-ink-300" : "bg-vermelho-dim text-vermelho-fg"
                          }`}
                        >
                          {n ?? "—"}
                        </span>
                      ))}
                    </div>
                    {h.risk && <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-snug text-vermelho-fg">{h.riskNote || "risco explícito"}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link href={`/clientes/${client.id}`} className="btn w-full justify-center">
            <Icon name="external" size={14} />
            Abrir a ficha completa
          </Link>
        </div>
      </SidePanel>
    </form>
  );
}

/** Valores do formulário no formato que `parseCheckinForm` e a prévia entendem. */
function formValues(d: Draft, scales: Scale[]): Record<string, string> {
  const v: Record<string, string> = {
    ref_date: d.refDate,
    filled_by: d.filledBy,
    attendance: d.attendance,
    payment_ok: d.payment,
    renewal_date: d.renewal,
    risk_flag: d.risk,
    risk_note: d.risk === "sim" ? d.riskNote : "",
    summary: d.summary,
  };
  for (const s of scales) {
    const a = d.scales[s.key];
    v[s.key] = typeof a === "number" ? String(a) : "";
  }
  if (d.risk === "sim" && d.createPlan) {
    v.create_plan = "on";
    v.plan_owner = d.planOwner;
    v.plan_due = d.planDue;
  }
  return v;
}

/* ------------------------------- peças da tela ------------------------------- */

const Sep = () => <span className="text-ink-500">·</span>;

function RenewalIn({ from, to }: { from: string; to: string }) {
  const days = Math.round((new Date(to + "T12:00:00Z").getTime() - new Date(from + "T12:00:00Z").getTime()) / 86_400_000);
  return <span className="text-[12px] text-ink-500">{days < 0 ? `vencida há ${-days} dias` : `em ${days} dias`}</span>;
}

function StepBadge({ n }: { n: number }) {
  return <span className="tnum grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md bg-ink-800 text-[12px] font-semibold text-ink-100">{n}</span>;
}

function Section({
  n,
  title,
  tag,
  count,
  hint,
  children,
}: {
  n: number;
  title: string;
  tag: { icon: IconName; label: string };
  count: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel" aria-label={title}>
      <header className="space-y-1.5 p-4 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
          <StepBadge n={n} />
          <h2 className="text-[15px] font-semibold text-ink-100">{title}</h2>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-2 py-0.5 text-[11px] font-medium text-ink-300">
            <Icon name={tag.icon} size={12} />
            {tag.label}
          </span>
          <span className="ml-auto text-[12px] text-ink-300">{count}</span>
        </div>
        <p className="text-[13px] leading-[19px] text-ink-300">{hint}</p>
      </header>
      {children}
    </section>
  );
}

function Rating({ id, scale, value, onChange, last }: { id: string; scale: Scale; value: Answer; onChange: (v: Answer) => void; last: boolean }) {
  const c = COPY[scale.key];
  const unanswered = value === null;
  const caption =
    value === "np"
      ? { text: "Não perguntado nesta ligação", on: false }
      : typeof value === "number"
        ? { text: `${value} · ${scale.anchors[value]}`, on: true }
        : { text: "1 = muito negativo · 5 = muito positivo", on: false };
  return (
    <div id={id} className={`grid gap-3 border-t border-[var(--border-hair)] px-4 py-4 sm:px-6 md:grid-cols-[minmax(0,1fr)_332px] md:gap-6 ${unanswered ? "bg-white/[0.02]" : ""} ${last ? "" : ""}`}>
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <h3 className="text-[14px] font-medium text-ink-100">{c?.title ?? scale.key}</h3>
          {unanswered && (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-amarelo-fg">
              <span className="h-1.5 w-1.5 rounded-full bg-amarelo" />
              Pendente
            </span>
          )}
        </div>
        <p className="text-[13px] text-ink-300">{c?.short ?? scale.question}</p>
      </div>
      <div className="space-y-1.5">
        <div className="grid grid-cols-[repeat(5,minmax(0,1fr))_64px] gap-1" role="radiogroup" aria-label={c?.title ?? scale.key}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              onClick={() => onChange(n)}
              className={`h-[34px] rounded-[7px] border text-[13px] transition-colors ${
                value === n ? "border-ink-100 bg-ink-100 font-semibold text-ink-950" : "border-[var(--border-strong)] bg-ink-850 font-medium text-ink-300 hover:text-ink-100"
              }`}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={value === "np"}
            onClick={() => onChange("np")}
            className={`h-[34px] rounded-[7px] border text-[12px] font-medium transition-colors ${
              value === "np" ? "border-ink-300 bg-ink-800 text-ink-100" : "border-[var(--border-hair)] text-ink-500 hover:text-ink-100"
            }`}
            title="Não perguntado nesta ligação"
          >
            N/P
          </button>
        </div>
        <p className={`text-[12px] ${caption.on ? "text-ink-100" : "text-ink-500"}`}>{caption.text}</p>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[var(--border-hair)] pt-3">
      <p className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500 sm:px-6">{label}</p>
      {children}
    </div>
  );
}

function Fact({ title, hint, children, last }: { title: string; hint: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={`flex flex-col gap-3 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between md:gap-6 ${last ? "" : "border-b border-[var(--border-hair)]"}`}>
      <div className="min-w-0">
        <h3 className="text-[14px] font-medium text-ink-100">{title}</h3>
        <p className="text-[13px] text-ink-300">{hint}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Seg<T extends string>({
  label,
  value,
  onChange,
  options,
  danger,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
  danger?: T;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => {
        const on = value === v;
        const bad = on && danger === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(v)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-[7px] border px-3 text-[13px] transition-colors ${
              bad
                ? "border-vermelho/40 bg-vermelho-dim font-semibold text-vermelho-fg"
                : on
                  ? "border-ink-100 bg-ink-100 font-semibold text-ink-950"
                  : "border-[var(--border-strong)] bg-ink-850 font-medium text-ink-300 hover:text-ink-100"
            }`}
          >
            {bad && <Icon name="alert" size={13} />}
            {l}
          </button>
        );
      })}
    </div>
  );
}

const Card = ({ children }: { children: React.ReactNode }) => <div className="panel space-y-3.5 p-3.5">{children}</div>;
const CardLabel = ({ children }: { children: React.ReactNode }) => <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500">{children}</p>;

function Row({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-500">{k}</dt>
      <dd className={`font-medium ${tone ?? "text-ink-300"}`}>{v}</dd>
    </div>
  );
}

function Effect({ icon, children, strong }: { icon: IconName; children: React.ReactNode; strong?: boolean }) {
  return (
    <li className={`flex items-start gap-2.5 ${strong ? "text-ink-100" : "text-ink-300"}`}>
      <Icon name={icon} size={15} className="mt-px shrink-0" />
      <span>{children}</span>
    </li>
  );
}
