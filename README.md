# Conselho

App de mensagens do grupo de amigos. O app inteiro é o grupo: chat, Conselho (pautas e votações), figurinhas e ligação em grupo.

## Como baixar

- **Android:** baixe o APK em [Releases → Conselho.apk](https://github.com/carlosandre1514-prog/Conselho/releases/download/apk/Conselho.apk) e instale (permita "instalar apps desconhecidos" se o celular pedir).
- **iPhone e PC:** abra [carlosandre1514-prog.github.io/Conselho](https://carlosandre1514-prog.github.io/Conselho/) no navegador. No iPhone, use Safari → Compartilhar → **Adicionar à Tela de Início**.

## Primeiro acesso

1. Digite o **código de acesso** do grupo (fica na aba Membros).
2. Escolha seu nome e um usuário.
3. Crie sua **senha**. Ela desbloqueia o app toda vez que você abrir.

A primeira pessoa a entrar vira **admin** e pode gerar um código novo.

## O que tem

- **Chat:** texto, foto, vídeo, áudio (toque no microfone), figurinhas. Segure uma mensagem sua para apagar.
- **Ligação em grupo:** botão de telefone no topo do chat. Escolha voz ou vídeo; quem entrar depois aparece na hora.
- **Conselho:** pautas com discussão e votações (anônima ou aberta, uma ou várias escolhas, com prazo).
- **Figurinhas:** crie de foto, GIF ou vídeo (recortar, tirar fundo, texto, desenho, trecho e velocidade). Exporte em .webp.
- **Perfil:** foto, cor do nome, fundo do chat (cor ou foto), transparência das bolhas, trocar senha.

## Como funciona por dentro

- `www/`: o app (HTML, CSS e JavaScript, sem build). Roda como site (PWA) e dentro do APK.
- `supabase/`: banco de dados, regras de segurança e a função `entrar` (primeiro acesso).
- `.github/workflows/`: a cada envio pro `main`, o GitHub gera o APK novo e atualiza o site.
- `android-signing/debug.keystore`: chave fixa de assinatura do APK, pra cada versão nova instalar por cima da anterior sem desinstalar.

## Observações

- As ligações usam conexão direta entre os celulares (WebRTC). Funcionam na maioria das redes; se em algum 4G não conectar, dá pra adicionar um servidor TURN em `www/js/config.js`.
- Notificações com o app fechado ainda não estão nesta versão.
