<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


## Fluxo de agentes

- O principal define escopo, baseline, critérios de sucesso e donos dos arquivos.
- Até três agentes ativos: principal e dois trabalhadores; sem subdelegação.
- GPT-6 Luna faz varreduras somente leitura; GPT-6.1 Sol implementa em worktree próprio por tarefa.
- Worktrees são autorizados neste fluxo; preservar alterações locais existentes.
- Cada arquivo tem um dono por vez. Um verificador independente examina achados e correções.
- Relatar evidências, diffs, testes e inconclusivos; resumo por tarefa de até 200 palavras.
- Guardar logs completos fora do checkout, remover segredos e registrar duração/usage quando disponível.
- Usar código para caminhos, limites, ownership, repetição e condições de parada.
- Limite de quatro rodadas, incluindo a primeira; parar após duas sem progresso mensurável.
- Progresso significa capacidade verificada, falha reproduzida resolvida ou teste relevante passando, sem regressões.
- Repetir falhas transitórias no máximo uma vez; não repetir edição parcial automaticamente.
- Reunir correções em worktree de integração e testar o conjunto antes de aprovar.
- Usar PGlite exclusivo, DATABASE_URL local explícita e um processo por diretório de banco.
- Presets de visualização nunca concedem permissões. Administração continua protegida no servidor.
- Não instalar dependências sem apresentar a necessidade. Push, merge e publicação exigem autorização.
