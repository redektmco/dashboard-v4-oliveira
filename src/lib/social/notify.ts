// ============================================================
// Notificação da equipe — melhor esforço, sem dependência externa.
//
// Dispara um POST para o webhook em `SOCIAL_NOTIFY_WEBHOOK` quando o
// cliente termina de avaliar um projeto. O corpo carrega `text`, que
// já é o formato aceito por Slack / Discord / Mattermost / Zapier —
// basta colar a Incoming Webhook URL na env. Sem a env, é no-op.
// ============================================================
import type { Project } from "./types";

export async function notifyProjectEvaluated(
  project: Pick<Project, "title" | "clientName">,
  summary: { total: number; approved: number; rejected: number },
): Promise<void> {
  const url = process.env.SOCIAL_NOTIFY_WEBHOOK;
  if (!url) return;

  const plural = (n: number) => (n === 1 ? "" : "s");
  const text =
    `✅ ${project.clientName} terminou de avaliar “${project.title}”: ` +
    `${summary.approved} aprovado${plural(summary.approved)}, ` +
    `${summary.rejected} reprovado${plural(summary.rejected)} de ${summary.total}.`;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        event: "project_evaluated",
        project: { title: project.title, client: project.clientName },
        summary,
      }),
    });
  } catch {
    // Nunca deixa a notificação quebrar a decisão do cliente.
  }
}
