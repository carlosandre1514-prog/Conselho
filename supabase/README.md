# Banco de dados (Supabase)

Projeto Supabase: `conselho` (região São Paulo). Já está criado e configurado.

O que existe lá:

- **Tabelas**: `groups` (grupo e código de acesso), `profiles` (membros), `messages` (chat),
  `pautas`, `pauta_comments`, `polls` / `poll_options` / `poll_votes` (votações), `stickers` (figurinhas).
- **Segurança (RLS)**: cada pessoa só vê e mexe nos dados do próprio grupo. Votos de votação anônima
  ficam escondidos: o app só recebe a contagem.
- **Funções**: `check_code`, `create_pauta`, `create_poll`, `vote`, `poll_results`, `my_invite_code`, `regenerate_code`.
- **Storage**: bucket `media` (fotos, vídeos, áudios e figurinhas).
- **Edge Function** `entrar` (pasta `functions/entrar`): cria a conta no primeiro acesso, conferindo o código.

O SQL completo está em `migrations/001_schema.sql`.
