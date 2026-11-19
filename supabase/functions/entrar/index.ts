// Edge Function "entrar": primeiro acesso ao Conselho.
// Recebe { code, name, username, password }, confere o convite (uso único) ou o código vitalício da presidência,
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

  // convite de uso único (membro) ou código vitalício da presidência (vinculado a uma conta só)
  let kind: "invite" | "admin" | null = null;
  let groupId: string | null = null;
  const { data: inv, error: iErr } = await admin.from("invites").select("group_id, used_at").eq("code", code).maybeSingle();
  if (iErr) return json({ error: "Erro ao conferir o código." }, 500);
  if (inv) {
    if (inv.used_at) return json({ error: "Esse convite já foi usado. Peça um novo pra presidência." }, 403);
    kind = "invite"; groupId = inv.group_id;
  } else {
    const { data: sec } = await admin.from("group_secrets").select("group_id, admin_user").eq("admin_code", code).maybeSingle();
    if (sec) {
      if (sec.admin_user) return json({ error: "Esse código é da presidência e já está vinculado a uma conta. Entre com o usuário e a senha dela." }, 403);
      kind = "admin"; groupId = sec.group_id;
    }
  }
  if (!kind || !groupId) return json({ error: "Código inválido." }, 403);
  const group = { id: groupId };

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

  const role = kind === "admin" ? "admin" : "membro";
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];

  const { error: pErr } = await admin.from("profiles").insert({
    id: created.user.id, group_id: group.id, name, username, role, color,
  });
  if (pErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: "Não deu pra criar o perfil." }, 500);
  }

  // marca o código como usado (se alguém usou ao mesmo tempo, desfaz)
  const claim = kind === "invite"
    ? await admin.from("invites").update({ used_by: created.user.id, used_name: name, used_at: new Date().toISOString() })
        .eq("code", code).is("used_at", null).select("code")
    : await admin.from("group_secrets").update({ admin_user: created.user.id })
        .eq("group_id", group.id).is("admin_user", null).select("group_id");
  if (claim.error || !claim.data?.length) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: "Esse código acabou de ser usado. Peça outro." }, 409);
  }

  await admin.from("messages").insert({
    group_id: group.id, user_id: created.user.id, kind: "system", body: `${name} entrou no Conselho`,
  });

  return json({ ok: true, email, role });
});
