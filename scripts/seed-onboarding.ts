/**
 * Semeia o Onboarding com uma estrutura de DEMONSTRAÇÃO.
 *   npx dotenv -e .env.local -- npx tsx scripts/seed-onboarding.ts
 *
 * Idempotente: apaga e recria apenas as categorias marcadas como demo
 * (is_demo = 1). Conteúdo real criado pelo CMS (is_demo = 0) não é tocado.
 * As categorias demo nascem publicadas, para validar o fluxo do funcionário.
 */
import { migrate, run } from "../src/lib/db";
import {
  createCategory,
  createLesson,
  createModule,
  setCategoryStatus,
  type LessonInput,
} from "../src/lib/onboarding/db";
import type { LessonType } from "../src/lib/onboarding/types";

type LessonSeed = Partial<LessonInput> & { title: string; type?: LessonType };
type ModuleSeed = { title: string; description?: string; lessons: LessonSeed[] };
type CategorySeed = { title: string; icon: string; description: string; modules: ModuleSeed[] };

const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"; // vídeo de exemplo (normaliza p/ embed)

const DEMO: CategorySeed[] = [
  {
    title: "Cultura & V4",
    icon: "award",
    description: "Quem somos, como pensamos e como trabalhamos na unidade Oliveira & Co.",
    modules: [
      {
        title: "Quem somos",
        description: "O ponto de partida de todo mundo que entra.",
        lessons: [
          {
            title: "Bem-vindo(a) à V4 Oliveira & Co.",
            type: "text",
            description: "Uma mensagem para o seu primeiro dia.",
            content:
              "# Bem-vindo(a)!\n\nQue bom ter você no time. Este portal vai te guiar do **primeiro dia** até você entender completamente como trabalhamos.\n\n> Nosso negócio é vender o seu.\n\nComece por aqui e siga na ordem — cada categoria foi pensada para a sua função.",
          },
          {
            title: "Nossos valores",
            type: "text",
            content:
              "## No que acreditamos\n\n- **Dono do resultado** — o número do cliente é o nosso número.\n- **Verdade acima de conforto** — dado na mesa, sempre.\n- **Ritmo** — semana que passa sem avanço é semana perdida.\n\nEsses valores aparecem nos nossos rituais e na forma como nos comunicamos.",
          },
          {
            title: "Como nos comunicamos",
            type: "text",
            content:
              "## Comunicação\n\n1. Assíncrono por padrão (registro escrito).\n2. Call quando destravar é mais rápido que escrever.\n3. Feedback direto e cedo.\n\n[Guia completo de comunicação](https://exemplo.com/comunicacao)",
          },
        ],
      },
      {
        title: "Como trabalhamos",
        lessons: [
          {
            title: "Rituais da unidade",
            type: "text",
            content:
              "## Rituais\n\n- **Daily** — 15 min, alinhamento do dia.\n- **Ritual semanal de performance** — o GT registra os números.\n- **Check-in mensal** — o Account traz a leitura do relacionamento.",
          },
          {
            title: "Sua primeira semana",
            type: "checklist",
            description: "Marque conforme for concluindo.",
            checklist: [
              { id: "c1", text: "Acessar o e-mail corporativo" },
              { id: "c2", text: "Entrar nos canais do time" },
              { id: "c3", text: "Ler a categoria da sua função" },
              { id: "c4", text: "Conversar com seu líder direto" },
            ],
          },
        ],
      },
    ],
  },
  {
    title: "Account",
    icon: "users",
    description: "Entenda como funciona a operação de Account e quais são suas responsabilidades.",
    modules: [
      {
        title: "Introdução",
        lessons: [
          { title: "O papel do Account", type: "text", content: "## O papel do Account\n\nVocê é a ponte entre o cliente e a operação. Garante que a estratégia acordada vire entrega e que o cliente enxergue o valor gerado." },
          { title: "Responsabilidades", type: "text", content: "## Responsabilidades\n\n- Conduzir as reuniões com o cliente.\n- Registrar o check-in mensal.\n- Acionar o time quando surge risco na conta." },
        ],
      },
      {
        title: "Processos",
        lessons: [
          { title: "Onboarding de cliente", type: "checklist", checklist: [
            { id: "a1", text: "Kickoff agendado" },
            { id: "a2", text: "Acessos coletados" },
            { id: "a3", text: "Metas registradas no painel" },
          ] },
          { title: "Reuniões e relatórios", type: "text", content: "## Cadência\n\nReunião mensal de resultados + relatório no padrão da unidade." },
        ],
      },
      {
        title: "Ferramentas",
        lessons: [
          { title: "CRM", type: "tool", icon: "🗂️", externalUrl: "https://exemplo.com/crm", content: "Onde vive o funil dos clientes. Peça acesso ao seu líder." },
          { title: "Notion", type: "tool", icon: "📓", externalUrl: "https://notion.so", content: "Base de conhecimento e SOPs." },
        ],
      },
    ],
  },
  {
    title: "Designer",
    icon: "image",
    description: "Conheça nosso processo criativo, padrões de entrega e organização.",
    modules: [
      {
        title: "Processo criativo",
        lessons: [
          { title: "Padrões de entrega", type: "text", content: "## Padrões\n\nToda peça segue o guia de marca do cliente e passa por revisão antes de ir ao ar." },
          { title: "Organização de arquivos", type: "text", content: "## Arquivos\n\nEstrutura de pastas por cliente > mês > formato. Nada solto na raiz." },
        ],
      },
      {
        title: "Ferramentas",
        lessons: [
          { title: "Figma", type: "tool", icon: "🎨", externalUrl: "https://figma.com", content: "Design e prototipação. Use as bibliotecas compartilhadas." },
          { title: "Canva", type: "tool", icon: "🖌️", externalUrl: "https://canva.com", content: "Para peças rápidas e templates do cliente." },
        ],
      },
    ],
  },
  {
    title: "Gestor de Tráfego",
    icon: "chart",
    description: "O ritual semanal, as plataformas e como lemos performance.",
    modules: [
      {
        title: "Fundamentos",
        lessons: [
          { title: "O papel do GT", type: "text", content: "## O papel do GT\n\nVocê transforma verba em resultado e registra a performance toda semana no painel." },
          { title: "Ritual semanal (vídeo)", type: "video", videoUrl: YT, content: "Assista e depois registre sua primeira semana." },
        ],
      },
      {
        title: "Plataformas",
        lessons: [
          { title: "Meta Ads", type: "tool", icon: "📘", externalUrl: "https://business.facebook.com", content: "Gerenciador de anúncios da Meta." },
          { title: "Google Ads", type: "tool", icon: "🔎", externalUrl: "https://ads.google.com", content: "Campanhas de search e performance max." },
        ],
      },
    ],
  },
  {
    title: "Social Media",
    icon: "message",
    description: "O papel do social, o fluxo de aprovação e o planejamento.",
    modules: [
      {
        title: "Introdução",
        lessons: [
          { title: "O papel do Social Media", type: "text", content: "## O papel do Social\n\nVocê cuida da presença e da aprovação de criativos com o cliente." },
        ],
      },
      {
        title: "Fluxo de aprovação",
        lessons: [
          { title: "Como funciona a aprovação (vídeo)", type: "video", videoUrl: YT },
          { title: "Planejamento", type: "text", content: "## Planejamento\n\nO calendário nasce do briefing do mês e passa pela aprovação por swipe." },
        ],
      },
    ],
  },
  {
    title: "Acessos Gerais",
    icon: "key",
    description: "Central de ferramentas e sistemas usados na unidade.",
    modules: [
      {
        title: "Ferramentas",
        lessons: [
          { title: "Google Workspace", type: "tool", icon: "📧", externalUrl: "https://workspace.google.com", content: "E-mail, Drive e Agenda." },
          { title: "Notion", type: "tool", icon: "📓", externalUrl: "https://notion.so", content: "Base de conhecimento." },
          { title: "ClickUp", type: "tool", icon: "✅", externalUrl: "https://clickup.com", content: "Gestão de demandas." },
          { title: "Meta Business", type: "tool", icon: "📘", externalUrl: "https://business.facebook.com", content: "Ativos de anúncio e páginas." },
          { title: "Figma", type: "tool", icon: "🎨", externalUrl: "https://figma.com", content: "Arquivos de design." },
        ],
      },
    ],
  },
];

function toInput(l: LessonSeed): LessonInput {
  return {
    title: l.title,
    description: l.description ?? "",
    type: l.type ?? "text",
    content: l.content ?? "",
    videoUrl: l.videoUrl ?? null,
    externalUrl: l.externalUrl ?? null,
    thumbUrl: l.thumbUrl ?? null,
    icon: l.icon ?? null,
    checklist: l.checklist ?? [],
  };
}

async function main() {
  await migrate();

  // Remove só o que é demo — conteúdo real do CMS fica intacto.
  await run("DELETE FROM ob_categories WHERE is_demo = 1");

  let cats = 0;
  let mods = 0;
  let lessons = 0;

  for (let ci = 0; ci < DEMO.length; ci++) {
    const c = DEMO[ci];
    const slug = c.title
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const categoryId = await createCategory({
      slug,
      title: c.title,
      description: c.description,
      icon: c.icon,
      ord: ci,
      isDemo: true,
    });
    await setCategoryStatus(categoryId, "published");
    cats++;

    for (let mi = 0; mi < c.modules.length; mi++) {
      const m = c.modules[mi];
      const moduleId = await createModule({
        categoryId,
        title: m.title,
        description: m.description ?? "",
        ord: mi,
      });
      mods++;
      for (let li = 0; li < m.lessons.length; li++) {
        await createLesson(moduleId, li, toInput(m.lessons[li]));
        lessons++;
      }
    }
  }

  console.log(`Seed do onboarding pronto: ${cats} categorias, ${mods} módulos, ${lessons} aulas (demo, publicadas).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
