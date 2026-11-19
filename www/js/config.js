// Configuração pública do app (essas chaves são públicas e podem ficar no código).
export const SUPABASE_URL = 'https://dvspyqnjhmclxhlqsqyc.supabase.co';
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR2c3B5cW5qaG1jbHhobHFzcXljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1MTAwNTIsImV4cCI6MjExMDA4NjA1Mn0.S9WDMZSzMXb18vOJO034HXrrLWyVdAEs26PboaX79mc';

// Servidores para as ligações (WebRTC). STUN resolve a maioria das redes.
// Se alguma ligação não conectar no 4G, dá pra adicionar um servidor TURN aqui.
export const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

// Depois de quantos segundos fora do app ele pede a senha de novo.
export const LOCK_AFTER_MS = 10_000;

export const APP_VERSION = '0.8.1';
