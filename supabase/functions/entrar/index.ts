// Edge Function "entrar": primeiro acesso ao Conselho.
// Recebe { code, name, username, password }, confere o código de acesso do grupo,
// cria a conta (já confirmada) e o perfil. Depois o app faz login normal com usuário + senha.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const COLORS = ["#D9AE55", "#6FA8DC", "#5BBF86", "#E58BB8", "#E0675A", "#B39DDB", "#4DD0E1", "#FFB74D"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Dados inválidos" }, 400);
  }

  const code = String(payload.code ?? "").trim().toUpperCase();
  const name = String(payload.name ?? "").trim().replace(/\s+/g, " ");
  const username = String(payload.username ?? "").trim().toLowerCase();
  const password = String(payload.password ?? "");

  if (!code) return json({ error: "Digite o código de acesso." }, 400);
  if (name.length < 1 || name.length > 40) return json({ error: "Nome precisa ter de 1 a 40 letras." }, 400);
  if (!/^[a-z0-9_.]{3,20}$/.test(username)) {
    return json({ error: "Usuário: 3 a 20 caracteres, só letras minúsculas, números, ponto ou _." }, 400);
  }
  if (password.length < 6) return json({ error: "A senha precisa ter pelo menos 6 caracteres." }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // código de convite (membro) ou código exclusivo da presidência (uso único)
  let isAdminCode = false;
  let { data: group, error: gErr } = await admin
    .from("groups").select("id").eq("invite_code", code).maybeSingle();
  if (gErr) return json({ error: "Erro ao conferir o código." }, 500);
  if (!group) {
    const { data: sec } = await admin.from("group_secrets").select("group_id").eq("admin_code", code).maybeSingle();
    if (sec) { group = { id: sec.group_id }; isAdminCode = true; }
  }
  if (!group) return json({ error: "Código de acesso inválido." }, 403);

  const { data: taken } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
  if (taken) return json({ error: "Esse usuário já existe. Escolha outro." }, 409);

  const email = `${username}@conselho.app`;
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, username },
  });
  if (cErr || !created.user) {
    const msg = /already/i.test(cErr?.message ?? "") ? "Esse usuário já existe. Escolha outro." : "Não deu pra criar a conta.";
    return json({ error: msg }, 400);
  }

  const role = isAdminCode ? "admin" : "membro";
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];

  const { error: pErr } = await admin.from("profiles").insert({
    id: created.user.id, group_id: group.id, name, username, role, color,
  });
  if (pErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: "Não deu pra criar o perfil." }, 500);
  }

  if (isAdminCode) await admin.from("group_secrets").update({ admin_code: null }).eq("group_id", group.id);

  await admin.from("messages").insert({
    group_id: group.id, user_id: created.user.id, kind: "system", body: `${name} entrou no Conselho`,
  });

  return json({ ok: true, email, role });
});
