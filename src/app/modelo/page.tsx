import { DIMENSIONS, SCALE_ANCHORS, fieldsFor } from "@/lib/model/catalog";
import { getConfig, getWeights } from "@/lib/repo";
import { ACCOUNT_TYPE_LABEL, type AccountType } from "@/lib/model/types";
import { PageHeader, Panel, TableScroll } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const TYPES: AccountType[] = ["lead_gen", "ecommerce", "branding"];

export default async function ModeloPage() {
  await requireUser();
  const [weights, cfg] = await Promise.all([getWeights(), getConfig()]);
  const total = DIMENSIONS.reduce((a, d) => a + (weights[d.key] ?? d.defaultWeight), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="O modelo, aberto"
        description="Nenhum peso é chute — cada um sai de duas perguntas objetivas: quão cedo a dimensão avisa o churn, e quão confiável é o dado. Dado duro e antecipatório pesa mais; nota subjetiva pesa menos porque tem ruído."
      />

      <Panel
        title="Pesos das dimensões"
        subtitle={`Somam ${total}%. São hipótese inicial defensável — a recalibração trimestral troca hipótese por evidência.`}
      >
        <TableScroll>
<table className="data-table">
          <thead>
            <tr>
              <th>Dimensão</th>
              <th>Origem</th>
              <th className="text-right">Peso</th>
              <th>Justificativa</th>
            </tr>
          </thead>
          <tbody>
            {DIMENSIONS.map((d) => {
              const w = weights[d.key] ?? d.defaultWeight;
              return (
                <tr key={d.key}>
                  <td className="font-medium text-ink-100">{d.label}</td>
                  <td className="text-ink-400">{d.source}</td>
                  <td className="tnum text-right">
                    <span className="font-semibold">{w}%</span>
                    {w !== d.defaultWeight && (
                      <div className="text-[11px] text-amarelo-fg">padrão {d.defaultWeight}%</div>
                    )}
                  </td>
                  <td className="max-w-[560px] text-ink-400">{d.rationale}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
</TableScroll>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Réguas de normalização" subtitle="Três réguas cobrem todo campo — tudo vira 0–100.">
          <div className="space-y-4 px-4 py-4 text-sm">
            <Rule
              title="Régua A — quanto maior melhor"
              code="score = min(100, (real / meta) × 100)"
              note="Leads, faturamento, ROAS, alcance. Teto em 100: bater 150% da meta não vale mais que bater 100% para fins de saúde — evita um super-mês mascarar um problema."
            />
            <Rule
              title="Régua B — quanto menor melhor"
              code="score = min(100, (meta / real) × 100)"
              note="CPL, CAC. Mesma lógica invertida."
            />
            <Rule
              title="Régua C — escala fixa"
              code={"score = ((nota − 1) / 4) × 100\nsim/não → 100 / 0\nsim/parcial/não → 100 / 50 / 0"}
              note="Notas de percepção e campos categóricos. 1→0, 3→50, 5→100."
            />
            <div className="rounded-lg bg-ink-850 px-3 py-2.5 text-xs leading-relaxed text-ink-400">
              <strong className="text-ink-200">Agregação:</strong> normaliza cada campo → média
              ponderada dos campos dentro da dimensão → média ponderada das dimensões → score 0–100.
              Campo sem dado sai do cálculo e os pesos do bloco são renormalizados, para não punir a
              conta por um campo que ainda não existe.
            </div>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Bandas" subtitle="Onde o coordenador decide o que fazer.">
            <div className="grid grid-cols-3 gap-px bg-ink-800">
              <BandBox label="Verde" range={`≥ ${cfg.greenFloor}`} cls="text-verde-fg" note="segue o ritmo" />
              <BandBox
                label="Amarelo"
                range={`${cfg.yellowFloor}–${cfg.greenFloor - 1}`}
                cls="text-amarelo-fg"
                note="janela onde a intervenção ainda muda o desfecho"
              />
              <BandBox
                label="Vermelho"
                range={`< ${cfg.yellowFloor}`}
                cls="text-vermelho-fg"
                note="ação imediata"
              />
            </div>
          </Panel>

          <Panel
            title="Overrides"
            subtitle="Média ponderada esconde um sinal fatal atrás de quatro bons. Estes furam a média."
          >
            <TableScroll>
<table className="data-table">
              <thead>
                <tr>
                  <th>Gatilho</th>
                  <th>Origem</th>
                  <th>Efeito</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Inadimplência</td>
                  <td className="text-ink-400">Account</td>
                  <td className="font-semibold text-vermelho-fg">vermelho</td>
                </tr>
                <tr>
                  <td>Flag de risco explícito = sim</td>
                  <td className="text-ink-400">Account</td>
                  <td className="font-semibold text-vermelho-fg">vermelho</td>
                </tr>
                <tr>
                  <td>Tracking quebrado</td>
                  <td className="text-ink-400">GT</td>
                  <td className="font-semibold text-amarelo-fg">teto de amarelo</td>
                </tr>
                <tr>
                  <td>
                    Performance &lt; {cfg.underMetaThreshold}% por {cfg.underMetaCycles} ciclos
                  </td>
                  <td className="text-ink-400">GT</td>
                  <td className="font-semibold text-vermelho-fg">vermelho</td>
                </tr>
              </tbody>
            </table>
</TableScroll>
          </Panel>

          <Panel title="Confiança do dado" subtitle="Separada da nota, sempre visível ao lado dela.">
            <TableScroll>
<table className="data-table">
              <thead>
                <tr>
                  <th>Condição</th>
                  <th>Confiança</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    Performance ≤ {cfg.perfMaxAgeDays}d e check-in ≤ {cfg.checkinMaxAgeDays}d
                  </td>
                  <td className="font-semibold text-verde-fg">Alta</td>
                </tr>
                <tr>
                  <td>Uma das duas origens desatualizada</td>
                  <td className="font-semibold text-amarelo-fg">Média</td>
                </tr>
                <tr>
                  <td>Ambas velhas ou faltando</td>
                  <td className="font-semibold text-vermelho-fg">Baixa</td>
                </tr>
              </tbody>
            </table>
</TableScroll>
            <p className="px-4 py-3 text-xs leading-relaxed text-ink-400">
              Confiança baixa não zera o score — avisa o coordenador para não agir cego sobre número
              podre. Um 82 com confiança baixa é um &ldquo;não sei&rdquo;, não um &ldquo;está tudo
              bem&rdquo;.
            </p>
          </Panel>
        </div>
      </div>

      <Panel
        title="Âncoras da escala 1–5"
        subtitle="A nota é a resposta do cliente à pergunta feita ao vivo na call. A âncora é a conferência do Account — é o que mantém dois Accounts na mesma régua. Cada pergunta do check-in tem a sua própria versão destas descrições."
      >
        <TableScroll>
<table className="data-table">
          <thead>
            <tr>
              <th className="w-16">Nota</th>
              <th>Significado</th>
              <th className="text-right">Pontos</th>
            </tr>
          </thead>
          <tbody>
            {[5, 4, 3, 2, 1].map((n) => (
              <tr key={n}>
                <td className="tnum font-bold">{n}</td>
                <td className="text-ink-300">{SCALE_ANCHORS[n]}</td>
                <td className="tnum text-right text-ink-400">{((n - 1) / 4) * 100}</td>
              </tr>
            ))}
          </tbody>
        </table>
</TableScroll>
      </Panel>

      {TYPES.map((t) => (
        <Panel
          key={t}
          title={`Campos — ${ACCOUNT_TYPE_LABEL[t]}`}
          subtitle="Cada campo tem definição objetiva: o preenchedor reporta um fato, não interpreta."
        >
          <TableScroll>
<table className="data-table">
            <thead>
              <tr>
                <th>Campo</th>
                <th>Quem preenche</th>
                <th>Dimensão</th>
                <th className="text-right">Peso no bloco</th>
                <th>Definição e justificativa do peso</th>
              </tr>
            </thead>
            <tbody>
              {fieldsFor(t).map((f) => (
                <tr key={f.key + f.source}>
                  <td className="max-w-[280px] font-medium text-ink-100">
                    {f.label}
                    {f.question && (
                      <div className="mt-1 text-[11px] font-normal italic leading-snug text-ink-500">
                        &ldquo;{f.question}&rdquo;
                      </div>
                    )}
                  </td>
                  <td className="text-ink-400">{f.source === "gt" ? "GT" : "Account"}</td>
                  <td className="text-ink-400">
                    {DIMENSIONS.find((d) => d.key === f.dimension)!.label}
                  </td>
                  <td className="tnum text-right">{f.weight}</td>
                  <td className="max-w-[520px] text-xs leading-relaxed text-ink-400">
                    {f.definition}
                    <div className="mt-1 text-ink-500">
                      <strong className="text-ink-400">Peso:</strong> {f.weightRationale}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
</TableScroll>
        </Panel>
      ))}

      <Panel title="Calibração — trocar hipótese por evidência" subtitle="Trimestral.">
        <ol className="list-inside list-decimal space-y-2 px-4 py-4 text-sm text-ink-300">
          <li>Rodar 60–90 dias com os pesos atuais, guardando todo snapshot.</li>
          <li>Marcar os desfechos: quem deu churn, quem sofreu downgrade, quem renovou bem.</li>
          <li>
            Olhar para trás: qual era o score — e cada dimensão — desses clientes 30/60/90 dias antes
            do desfecho.
          </li>
          <li>
            Ajustar: a dimensão que melhor separou &ldquo;quem saiu&rdquo; de &ldquo;quem ficou&rdquo;
            ganha peso; a que não separou nada, perde.
          </li>
          <li>Repetir trimestralmente.</li>
        </ol>
        <p className="px-4 pb-4 text-xs text-ink-500">
          Alterar os pesos em Config reescreve a série inteira dos últimos 90 dias, para que a
          comparação com o desfecho continue válida.
        </p>
      </Panel>
    </div>
  );
}

function Rule({ title, code, note }: { title: string; code: string; note: string }) {
  return (
    <div>
      <h3 className="font-display text-[15px] font-semibold text-ink-100">{title}</h3>
      <pre className="mt-1.5 whitespace-pre-wrap rounded-lg bg-ink-950 px-3 py-2 font-mono text-xs text-v4-red">
        {code}
      </pre>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-400">{note}</p>
    </div>
  );
}

function BandBox({
  label,
  range,
  cls,
  note,
}: {
  label: string;
  range: string;
  cls: string;
  note: string;
}) {
  return (
    <div className="bg-ink-900 px-4 py-3">
      <div className={`text-sm font-semibold ${cls}`}>{label}</div>
      <div className="tnum mt-0.5 text-lg font-semibold">{range}</div>
      <div className="mt-1 text-[11px] leading-snug text-ink-500">{note}</div>
    </div>
  );
}
