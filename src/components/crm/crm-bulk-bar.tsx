"use client";

import { useState, useTransition } from "react";
import { bulkArchive, bulkAssignOwner, bulkSetStage, bulkSetTarget, exportClients } from "@/actions/crm";
import type { CrmRow } from "@/lib/crm/board";
import { STAGE_LABEL, type Stage, type User } from "@/lib/model/types";
import { targetFields } from "@/lib/model/target-fields";
import { downloadCsv } from "../churn/controls";
import { ConfirmDialog, ImpactList, Modal } from "../modal";
import { Icon } from "../icon";
import { toast } from "../toast";

/**
 * Barra que aparece sobre a tabela quando há clientes selecionados.
 *
 * Toda ação diz quantos clientes afeta — antes de executar, não depois. As
 * destrutivas (arquivar) passam por `ConfirmDialog` com a lista de impacto,
 * que é o padrão do app para esse tipo de confirmação.
 */

export function CrmBulkBar({
  rows,
  users,
  isAdmin,
  onClear,
  archivedView,
}: {
  /** Só os clientes selecionados, já resolvidos. */
  rows: CrmRow[];
  users: User[];
  isAdmin: boolean;
  onClear: () => void;
  /** Na aba Arquivados a ação é restaurar, não arquivar. */
  archivedView: boolean;
}) {
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<null | "owner" | "stage" | "metas">(null);
  const [confirming, setConfirming] = useState(false);

  const ids = rows.map((r) => r.id);
  const n = ids.length;
  if (!n) return null;

  const run = (fn: () => Promise<{ ok?: string; error?: string } | null>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r?.error) toast(r.error, { tone: "error" });
      else if (r?.ok) {
        toast(r.ok);
        onClear();
      }
      after?.();
    });

  const doExport = () =>
    start(async () => {
      const r = await exportClients(ids);
      if (r.error) {
        toast(r.error, { tone: "error" });
        return;
      }
      downloadCsv(
        `clientes-${new Date().toISOString().slice(0, 10)}.csv`,
        ["ID", "Cliente", "Segmento", "Account", "GT", "MRR", "Início", "Renovação", "Serviços", "Situação"],
        r.rows ?? [],
      );
      toast(`${r.rows?.length ?? 0} clientes exportados.`);
    });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-ink-800 px-3 py-2">
        <span className="text-[13px] font-semibold text-ink-100">
          <span className="tnum">{n}</span> {n === 1 ? "selecionado" : "selecionados"}
        </span>
        <span className="h-4 w-px bg-[var(--border-hair)]" />

        <BulkButton icon="target" label="Definir forecast" onClick={() => setDialog("metas")} disabled={pending} />
        <BulkButton icon="userCog" label="Atribuir responsável" onClick={() => setDialog("owner")} disabled={pending} />
        <BulkButton icon="handshake" label="Alterar etapa" onClick={() => setDialog("stage")} disabled={pending} />
        {isAdmin && <BulkButton icon="download" label="Exportar" onClick={doExport} disabled={pending} />}
        <BulkButton
          icon={archivedView ? "refresh" : "trash"}
          label={archivedView ? "Restaurar" : "Arquivar"}
          onClick={() => (archivedView ? run(() => bulkArchive(ids, false)) : setConfirming(true))}
          disabled={pending}
          danger={!archivedView}
        />

        <span className="flex-1" />
        <button type="button" onClick={onClear} className="flex items-center gap-1.5 text-[12px] text-ink-400 hover:text-ink-100">
          <Icon name="x" size={13} />
          Limpar seleção
        </button>
      </div>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Arquivar ${n} ${n === 1 ? "cliente" : "clientes"}?`}
        confirmLabel="Arquivar"
        pendingLabel="Arquivando…"
        tone="danger"
        onConfirm={async () => {
          const r = await bulkArchive(ids, true);
          if (r?.error) return r.error;
          onClear();
          return r ?? undefined;
        }}
      >
        <p className="text-[13px] text-ink-300">
          Os clientes saem da carteira e das filas de check-in, mas nada é apagado: metas, histórico e integrações continuam
          guardados e voltam se você restaurar.
        </p>
        <ImpactList
          items={[
            { label: "Clientes afetados", count: n },
            { label: "MRR que sai da carteira", count: Math.round(rows.reduce((s, r) => s + r.mrr, 0)) },
            ...(rows.some((r) => r.churn) ? [{ label: "Com churn em aberto", count: rows.filter((r) => r.churn).length, tone: "danger" as const }] : []),
          ]}
        />
      </ConfirmDialog>

      <OwnerDialog open={dialog === "owner"} onClose={() => setDialog(null)} users={users} n={n} onApply={(field, userId) => run(() => bulkAssignOwner(ids, field, userId), () => setDialog(null))} pending={pending} />
      <StageDialog open={dialog === "stage"} onClose={() => setDialog(null)} n={n} onApply={(stage) => run(() => bulkSetStage(ids, stage), () => setDialog(null))} pending={pending} />
      <TargetDialog open={dialog === "metas"} onClose={() => setDialog(null)} rows={rows} n={n} onApply={(key, value) => run(() => bulkSetTarget(ids, key, value), () => setDialog(null))} pending={pending} />
    </>
  );
}

function BulkButton({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] transition-colors disabled:opacity-50 ${
        danger ? "text-vermelho-fg hover:bg-vermelho-dim" : "text-ink-200 hover:bg-ink-850 hover:text-ink-100"
      }`}
    >
      <Icon name={icon} size={13} />
      {label}
    </button>
  );
}

/* ---------------------------- diálogos ----------------------------- */

function OwnerDialog({
  open,
  onClose,
  users,
  n,
  onApply,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  users: User[];
  n: number;
  onApply: (field: "account_user_id" | "gt_user_id", userId: number | null) => void;
  pending: boolean;
}) {
  const [field, setField] = useState<"account_user_id" | "gt_user_id">("account_user_id");
  const [userId, setUserId] = useState("");
  const role = field === "account_user_id" ? "account" : "gt";
  const list = users.filter((u) => u.role === role);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Atribuir responsável"
      description={`A mudança vale para os ${n} clientes selecionados.`}
      footer={
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() => onApply(field, userId ? Number(userId) : null)}
          >
            {pending ? "Aplicando…" : `Aplicar a ${n}`}
          </button>
        </div>
      }
    >
      <label className="flex flex-col gap-1.5">
        <span className="label">Papel</span>
        <select value={field} onChange={(e) => { setField(e.target.value as typeof field); setUserId(""); }} className="field">
          <option value="account_user_id">Account</option>
          <option value="gt_user_id">GT (gestor de tráfego)</option>
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="label">Responsável</span>
        <select value={userId} onChange={(e) => setUserId(e.target.value)} className="field">
          <option value="">Sem responsável</option>
          {list.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
    </Modal>
  );
}

function StageDialog({
  open,
  onClose,
  n,
  onApply,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  n: number;
  onApply: (stage: Stage | null) => void;
  pending: boolean;
}) {
  const [stage, setStage] = useState<string>("");
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Alterar etapa do relacionamento"
      description={`Fixa a etapa dos ${n} clientes selecionados, sobrepondo o cálculo automático.`}
      footer={
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={() => onApply((stage || null) as Stage | null)}>
            {pending ? "Aplicando…" : `Aplicar a ${n}`}
          </button>
        </div>
      }
    >
      <label className="flex flex-col gap-1.5">
        <span className="label">Etapa</span>
        <select value={stage} onChange={(e) => setStage(e.target.value)} className="field">
          <option value="">Automática (pelo contrato, churn e renovação)</option>
          {(Object.keys(STAGE_LABEL) as Stage[]).map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
    </Modal>
  );
}

function TargetDialog({
  open,
  onClose,
  rows,
  n,
  onApply,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  rows: CrmRow[];
  n: number;
  onApply: (key: string, value: number) => void;
  pending: boolean;
}) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  // Só as metas que existem para TODOS os selecionados — aplicar "receita"
  // num cliente de geração de lead não significa nada.
  const common = commonFields(rows);
  const num = Number(value.replace(",", "."));
  const valid = Boolean(key) && Number.isFinite(num);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Definir forecast em massa"
      description={`O valor vale para os ${n} clientes selecionados, a partir de hoje.`}
      footer={
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" disabled={pending || !valid} onClick={() => onApply(key, num)}>
            {pending ? "Aplicando…" : `Aplicar a ${n}`}
          </button>
        </div>
      }
    >
      {common.length === 0 ? (
        <p className="text-[13px] text-amarelo-fg">
          Os clientes selecionados são de tipos diferentes e não têm nenhum indicador em comum. Selecione contas do mesmo tipo.
        </p>
      ) : (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="label">Indicador do forecast</span>
            <select value={key} onChange={(e) => setKey(e.target.value)} className="field">
              <option value="">Escolha o indicador</option>
              {common.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="label">Valor</span>
            <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" className="field" placeholder="0" />
          </label>
          <p className="text-[12px] text-ink-500">
            O forecast é versionado: o valor antigo continua no histórico e o novo passa a valer de hoje em diante.
          </p>
        </>
      )}
    </Modal>
  );
}

/** Os indicadores de forecast comuns a todos os tipos de conta da seleção. */
function commonFields(rows: CrmRow[]) {
  const byType = new Map<string, ReturnType<typeof targetFields>>();
  for (const r of rows) if (!byType.has(r.accountType)) byType.set(r.accountType, targetFields(r.accountType));
  const lists = [...byType.values()];
  if (!lists.length) return [];
  return lists[0].filter((f) => lists.every((l) => l.some((x) => x.key === f.key)));
}
