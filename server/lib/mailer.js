/**
 * Disparo de e-mails transacionais (Resend)
 * =========================================
 *
 * Um único lugar envia os e-mails dos quatro apps: boas-vindas no cadastro e
 * recuperação de senha. Usa a API HTTP do Resend direto por `fetch` — sem SDK
 * novo no projeto.
 *
 * Configuração (`.env`):
 *   RESEND_API_KEY=re_xxx           # resend.com → API Keys
 *   MAIL_FROM="Nexmarket <nao-responda@seudominio.com>"
 *   APP_BASE_URL=https://app.seudominio.com   # usado nos links do e-mail
 *
 * Sem `RESEND_API_KEY` o servidor continua funcionando: os e-mails são
 * apenas registrados no log (modo dev), nunca enviados silenciosamente para
 * o vazio sem aviso.
 */

const RESEND_API = 'https://api.resend.com/emails';

const {
  RESEND_API_KEY = '',
  MAIL_FROM = 'Nexmarket <onboarding@resend.dev>',
  APP_BASE_URL = '',
  PUBLIC_URL = '',
  // Preenchida automaticamente pelo Render — usada quando as outras faltam.
  RENDER_EXTERNAL_URL = '',
} = process.env;

export const mailEnabled = !!RESEND_API_KEY;

const APP_LABELS = {
  cliente: 'Nexmarket',
  loja: 'Nexmarket Loja',
  entregador: 'Nexmarket Entregador',
  empresa: 'Nexmarket Empresa',
};

/** Envia um e-mail. Devolve `{ sent, id }` — nunca lança para não derrubar
 *  um cadastro por causa do e-mail. */
export async function sendMail({ to, subject, html, text }) {
  if (!mailEnabled) {
    console.warn(`[mail] RESEND_API_KEY ausente — e-mail NÃO enviado para ${to}: "${subject}"`);
    return { sent: false, skipped: true };
  }
  try {
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: MAIL_FROM, to: [to], subject, html, text }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error('[mail] Resend recusou o envio:', res.status, detail);
      return { sent: false, error: detail };
    }
    const data = await res.json();
    return { sent: true, id: data.id };
  } catch (e) {
    console.error('[mail] falha ao enviar:', e.message);
    return { sent: false, error: e.message };
  }
}

/* ------------------------------- Templates -------------------------------- */

const BRAND = '#58CC02';

function layout({ title, intro, cta, ctaUrl, footer, extra = '' }) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#F7F7F7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fff;border-radius:20px;border:2px solid #E5E5E5;">
    <tr><td style="padding:32px;">
      <div style="width:56px;height:56px;background:${BRAND};border-radius:16px;text-align:center;line-height:56px;font-size:28px;">🛒</div>
      <h1 style="margin:20px 0 8px;font-size:22px;color:#111;font-weight:800;">${title}</h1>
      <p style="margin:0 0 20px;color:#444;font-size:15px;line-height:1.5;">${intro}</p>
      ${
        cta && ctaUrl
          ? `<a href="${ctaUrl}" style="display:inline-block;background:${BRAND};color:#fff;font-weight:700;font-size:16px;padding:14px 28px;border-radius:14px;text-decoration:none;">${cta}</a>
             <p style="margin:16px 0 0;color:#888;font-size:12px;line-height:1.5;">Se o botão não funcionar, copie e cole este endereço no navegador:<br><span style="color:#555;word-break:break-all;">${ctaUrl}</span></p>`
          : ''
      }
      ${extra}
      <hr style="border:none;border-top:1px solid #EEE;margin:24px 0;">
      <p style="margin:0;color:#999;font-size:12px;line-height:1.5;">${footer}</p>
    </td></tr>
  </table>
</body></html>`;
}

export function welcomeEmail({ name, app }) {
  const appLabel = APP_LABELS[app] || 'Nexmarket';
  const first = (name || '').split(' ')[0];
  const intro =
    app === 'entregador'
      ? 'Sua conta foi criada! O próximo passo é enviar seus documentos (CNH, documento do veículo, foto e comprovante de residência). Assim que a nossa equipe aprovar, você já pode ficar online e receber corridas.'
      : app === 'loja'
        ? 'Sua conta de loja foi criada! Cadastre seus produtos, defina horários e formas de pagamento para começar a vender.'
        : app === 'empresa'
          ? 'Seu acesso ao painel da plataforma foi criado. Use o mesmo e-mail e senha para entrar.'
          : 'Sua conta foi criada! Escolha um mercado e faça seu primeiro pedido — a entrega chega onde você estiver.';

  return {
    subject: `Bem-vindo à ${appLabel}!`,
    html: layout({
      title: first ? `Olá, ${first}! 👋` : 'Bem-vindo! 👋',
      intro,
      footer:
        'Você recebeu este e-mail porque criou uma conta na Nexmarket. Se não foi você, ignore esta mensagem.',
    }),
    text: `${first ? `Olá, ${first}!` : 'Bem-vindo!'}\n\n${intro}`,
  };
}

export function passwordResetEmail({ name, resetUrl, minutes = 60 }) {
  const first = (name || '').split(' ')[0];
  return {
    subject: 'Redefinir sua senha · Nexmarket',
    html: layout({
      title: 'Redefinir sua senha',
      intro: `${first ? `Olá, ${first}. ` : ''}Recebemos um pedido para redefinir a senha da sua conta Nexmarket. O link abaixo vale por ${minutes} minutos e só pode ser usado uma vez.`,
      cta: 'Criar nova senha',
      ctaUrl: resetUrl,
      footer:
        'Se você não pediu para redefinir a senha, ignore este e-mail — sua senha atual continua valendo.',
    }),
    text: `Para redefinir sua senha, abra: ${resetUrl}\nO link vale por ${minutes} minutos.`,
  };
}

export function passwordChangedEmail({ name }) {
  const first = (name || '').split(' ')[0];
  return {
    subject: 'Sua senha foi alterada · Nexmarket',
    html: layout({
      title: 'Senha alterada',
      intro: `${first ? `Olá, ${first}. ` : ''}A senha da sua conta Nexmarket acabou de ser alterada e já vale para todos os apps da plataforma.`,
      footer:
        'Não foi você? Fale com o suporte imediatamente — sua conta pode estar comprometida.',
    }),
    text: 'A senha da sua conta Nexmarket foi alterada.',
  };
}

/** URL da página de redefinição enviada no e-mail. */
export function buildResetUrl(token, app) {
  const base = APP_BASE_URL || PUBLIC_URL || RENDER_EXTERNAL_URL || '';
  const url = new URL('/redefinir-senha', base || 'http://localhost:8787');
  url.searchParams.set('token', token);
  if (app) url.searchParams.set('app', app);
  return url.toString();
}
