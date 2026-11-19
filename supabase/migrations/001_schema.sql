-- Conselho: estrutura completa do banco (já aplicada no projeto Supabase "conselho").
create extension if not exists pgcrypto;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  username text not null unique check (username ~ '^[a-z0-9_.]{3,20}$'),
  color text not null default '#D9AE55' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  avatar_url text,
  role text not null default 'membro' check (role in ('admin','membro')),
  last_seen timestamptz default now(),
  created_at timestamptz not null default now()
);

create or replace function public.my_group() returns uuid
language sql stable security definer set search_path = public
as $$ select group_id from public.profiles where id = auth.uid() $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false) $$;

create table public.messages (
  id bigint generated always as identity primary key,
  group_id uuid not null default public.my_group() references public.groups(id) on delete cascade,
  user_id uuid default auth.uid() references public.profiles(id) on delete set null,
  kind text not null default 'text' check (kind in ('text','image','video','audio','sticker','pauta','poll','call','system')),
  body text check (char_length(body) <= 4000),
  media_url text,
  meta jsonb not null default '{}'::jsonb,
  reply_to bigint references public.messages(id) on delete set null,
  created_at timestamptz not null default now()
);
create index messages_group_created on public.messages (group_id, created_at desc);

create table public.pautas (
  id bigint generated always as identity primary key,
  group_id uuid not null default public.my_group() references public.groups(id) on delete cascade,
  author_id uuid default auth.uid() references public.profiles(id) on delete set null,
  title text not null check (char_length(title) between 3 and 140),
  description text check (char_length(description) <= 4000),
  status text not null default 'discussao' check (status in ('discussao','votacao','aprovada','rejeitada','encerrada')),
  created_at timestamptz not null default now()
);
create index pautas_group on public.pautas (group_id, created_at desc);

create table public.pauta_comments (
  id bigint generated always as identity primary key,
  pauta_id bigint not null references public.pautas(id) on delete cascade,
  user_id uuid default auth.uid() references public.profiles(id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index pauta_comments_pauta on public.pauta_comments (pauta_id, created_at);

create table public.polls (
  id bigint generated always as identity primary key,
  group_id uuid not null default public.my_group() references public.groups(id) on delete cascade,
  pauta_id bigint references public.pautas(id) on delete cascade,
  author_id uuid default auth.uid() references public.profiles(id) on delete set null,
  question text not null check (char_length(question) between 3 and 200),
  anonymous boolean not null default true,
  multiple boolean not null default false,
  closes_at timestamptz,
  total_votes int not null default 0,
  voters int not null default 0,
  created_at timestamptz not null default now()
);
create index polls_group on public.polls (group_id, created_at desc);
create index polls_pauta on public.polls (pauta_id);

create table public.poll_options (
  id bigint generated always as identity primary key,
  poll_id bigint not null references public.polls(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 100),
  position int not null default 0
);
create index poll_options_poll on public.poll_options (poll_id);

create table public.poll_votes (
  poll_id bigint not null references public.polls(id) on delete cascade,
  option_id bigint not null references public.poll_options(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (option_id, user_id)
);
create index poll_votes_poll_user on public.poll_votes (poll_id, user_id);

create table public.stickers (
  id bigint generated always as identity primary key,
  group_id uuid not null default public.my_group() references public.groups(id) on delete cascade,
  owner_id uuid default auth.uid() references public.profiles(id) on delete set null,
  pack text not null default 'Do grupo' check (char_length(pack) between 1 and 40),
  url text not null,
  created_at timestamptz not null default now()
);
create index stickers_group on public.stickers (group_id, created_at desc);

-- ---------- segurança (RLS) ----------
alter table public.groups enable row level security;
alter table public.profiles enable row level security;
alter table public.messages enable row level security;
alter table public.pautas enable row level security;
alter table public.pauta_comments enable row level security;
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
alter table public.stickers enable row level security;

create policy "membros veem o grupo" on public.groups for select to authenticated using (id = public.my_group());
create policy "admin edita o grupo" on public.groups for update to authenticated using (id = public.my_group() and public.is_admin()) with check (id = public.my_group());

create policy "membros veem membros" on public.profiles for select to authenticated using (group_id = public.my_group());
create policy "cada um edita o seu perfil" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (name, color, avatar_url, last_seen) on public.profiles to authenticated;

create policy "ler mensagens do grupo" on public.messages for select to authenticated using (group_id = public.my_group());
create policy "enviar mensagem" on public.messages for insert to authenticated with check (group_id = public.my_group() and user_id = auth.uid() and kind in ('text','image','video','audio','sticker','call'));
create policy "apagar a propria mensagem" on public.messages for delete to authenticated using (user_id = auth.uid());

create policy "ler pautas" on public.pautas for select to authenticated using (group_id = public.my_group());
create policy "autor ou admin atualiza pauta" on public.pautas for update to authenticated using (group_id = public.my_group() and (author_id = auth.uid() or public.is_admin())) with check (group_id = public.my_group());

create policy "ler comentarios" on public.pauta_comments for select to authenticated using (exists (select 1 from public.pautas p where p.id = pauta_id and p.group_id = public.my_group()));
create policy "comentar" on public.pauta_comments for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.pautas p where p.id = pauta_id and p.group_id = public.my_group()));

create policy "ler votacoes" on public.polls for select to authenticated using (group_id = public.my_group());
create policy "ler opcoes" on public.poll_options for select to authenticated using (exists (select 1 from public.polls p where p.id = poll_id and p.group_id = public.my_group()));
create policy "ver o proprio voto" on public.poll_votes for select to authenticated using (user_id = auth.uid());

create policy "ler figurinhas" on public.stickers for select to authenticated using (group_id = public.my_group());
create policy "criar figurinha" on public.stickers for insert to authenticated with check (group_id = public.my_group() and owner_id = auth.uid());
create policy "apagar a propria figurinha" on public.stickers for delete to authenticated using (owner_id = auth.uid());

-- ---------- funções ----------
create or replace function public.check_code(p_code text) returns text
language sql stable security definer set search_path = public
as $$ select name from public.groups where invite_code = upper(trim(p_code)) $$;

create or replace function public.create_pauta(p_title text, p_description text) returns bigint
language plpgsql security definer set search_path = public
as $$
declare v_group uuid := public.my_group(); v_id bigint;
begin
  if v_group is null then raise exception 'sem grupo'; end if;
  insert into public.pautas (group_id, author_id, title, description)
  values (v_group, auth.uid(), trim(p_title), nullif(trim(p_description), ''))
  returning id into v_id;
  insert into public.messages (group_id, user_id, kind, body, meta)
  values (v_group, auth.uid(), 'pauta', trim(p_title), jsonb_build_object('pauta_id', v_id));
  return v_id;
end $$;

create or replace function public.create_poll(p_question text, p_options text[], p_anonymous boolean, p_multiple boolean, p_hours int, p_pauta_id bigint) returns bigint
language plpgsql security definer set search_path = public
as $$
declare v_group uuid := public.my_group(); v_id bigint; v_opt text; v_pos int := 0;
begin
  if v_group is null then raise exception 'sem grupo'; end if;
  if coalesce(array_length(p_options, 1), 0) < 2 then raise exception 'precisa de pelo menos 2 opções'; end if;
  if coalesce(array_length(p_options, 1), 0) > 10 then raise exception 'no máximo 10 opções'; end if;
  if p_pauta_id is not null and not exists (select 1 from public.pautas where id = p_pauta_id and group_id = v_group) then
    raise exception 'pauta inválida';
  end if;
  insert into public.polls (group_id, pauta_id, author_id, question, anonymous, multiple, closes_at)
  values (v_group, p_pauta_id, auth.uid(), trim(p_question), coalesce(p_anonymous, true), coalesce(p_multiple, false),
          case when p_hours is null or p_hours <= 0 then null else now() + make_interval(hours => p_hours) end)
  returning id into v_id;
  foreach v_opt in array p_options loop
    if char_length(trim(v_opt)) > 0 then
      insert into public.poll_options (poll_id, label, position) values (v_id, trim(v_opt), v_pos);
      v_pos := v_pos + 1;
    end if;
  end loop;
  if p_pauta_id is not null then update public.pautas set status = 'votacao' where id = p_pauta_id; end if;
  insert into public.messages (group_id, user_id, kind, body, meta)
  values (v_group, auth.uid(), 'poll', trim(p_question), jsonb_build_object('poll_id', v_id, 'pauta_id', p_pauta_id));
  return v_id;
end $$;

create or replace function public.vote(p_poll_id bigint, p_option_ids bigint[]) returns void
language plpgsql security definer set search_path = public
as $$
declare v_poll public.polls%rowtype;
begin
  select * into v_poll from public.polls where id = p_poll_id and group_id = public.my_group();
  if not found then raise exception 'votação não encontrada'; end if;
  if v_poll.closes_at is not null and v_poll.closes_at < now() then raise exception 'votação encerrada'; end if;
  if not v_poll.multiple and coalesce(array_length(p_option_ids, 1), 0) > 1 then raise exception 'só uma opção'; end if;
  if exists (select 1 from unnest(p_option_ids) o where o not in (select id from public.poll_options where poll_id = p_poll_id)) then
    raise exception 'opção inválida';
  end if;
  delete from public.poll_votes where poll_id = p_poll_id and user_id = auth.uid();
  insert into public.poll_votes (poll_id, option_id, user_id) select p_poll_id, o, auth.uid() from unnest(p_option_ids) o;
  update public.polls set
    total_votes = (select count(*) from public.poll_votes where poll_id = p_poll_id),
    voters = (select count(distinct user_id) from public.poll_votes where poll_id = p_poll_id)
  where id = p_poll_id;
end $$;

create or replace function public.poll_results(p_poll_id bigint)
returns table (option_id bigint, label text, pos int, votes int, voters text[], mine boolean)
language sql stable security definer set search_path = public
as $$
  select o.id, o.label, o.position,
         (select count(*)::int from public.poll_votes v where v.option_id = o.id),
         case when p.anonymous then null else
           (select array_agg(pr.name order by pr.name) from public.poll_votes v join public.profiles pr on pr.id = v.user_id where v.option_id = o.id)
         end,
         exists (select 1 from public.poll_votes v where v.option_id = o.id and v.user_id = auth.uid())
  from public.poll_options o
  join public.polls p on p.id = o.poll_id
  where o.poll_id = p_poll_id and p.group_id = public.my_group()
  order by o.position
$$;

create or replace function public.regenerate_code() returns text
language plpgsql security definer set search_path = public
as $$
declare v_code text; v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int;
begin
  if not public.is_admin() then raise exception 'só admin'; end if;
  v_code := 'CNS-';
  for i in 1..6 loop v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1); end loop;
  update public.groups set invite_code = v_code where id = public.my_group();
  return v_code;
end $$;

create or replace function public.my_invite_code() returns text
language sql stable security definer set search_path = public
as $$ select invite_code from public.groups where id = public.my_group() $$;

revoke all on function public.check_code(text) from public;
grant execute on function public.check_code(text) to anon, authenticated;
revoke all on function public.create_pauta(text, text) from public, anon;
revoke all on function public.create_poll(text, text[], boolean, boolean, int, bigint) from public, anon;
revoke all on function public.vote(bigint, bigint[]) from public, anon;
revoke all on function public.poll_results(bigint) from public, anon;
revoke all on function public.regenerate_code() from public, anon;
revoke all on function public.my_invite_code() from public, anon;
revoke all on function public.my_group() from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.create_pauta(text, text) to authenticated;
grant execute on function public.create_poll(text, text[], boolean, boolean, int, bigint) to authenticated;
grant execute on function public.vote(bigint, bigint[]) to authenticated;
grant execute on function public.poll_results(bigint) to authenticated;
grant execute on function public.regenerate_code() to authenticated;
grant execute on function public.my_invite_code() to authenticated;
grant execute on function public.my_group() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- ---------- tempo real ----------
alter publication supabase_realtime add table public.messages, public.pautas, public.pauta_comments, public.polls, public.profiles, public.stickers;

-- ---------- arquivos ----------
insert into storage.buckets (id, name, public, file_size_limit) values ('media', 'media', true, 52428800) on conflict (id) do nothing;
create policy "membros enviam midia" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "dono apaga midia" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and owner = auth.uid());

-- ---------- grupo inicial ----------
insert into public.groups (name, invite_code) values ('Conselho', 'CNS-XXXXXX'); -- o código real foi gerado aleatoriamente

-- ---------- v0.2: reações e fotos de quem votou ----------
create table public.message_reactions (
  message_id bigint not null references public.messages(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.message_reactions replica identity full;
alter table public.message_reactions enable row level security;
create policy "ver reacoes" on public.message_reactions for select to authenticated using (exists (select 1 from public.messages m where m.id = message_id and m.group_id = public.my_group()));
create policy "reagir" on public.message_reactions for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.messages m where m.id = message_id and m.group_id = public.my_group()));
create policy "trocar reacao" on public.message_reactions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "tirar reacao" on public.message_reactions for delete to authenticated using (user_id = auth.uid());
alter publication supabase_realtime add table public.message_reactions;
-- poll_results passou a devolver também voter_ids (uuid[])
