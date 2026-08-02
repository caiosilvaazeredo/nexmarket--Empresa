# Guia rápido: e-mails e conta única

Dois assuntos resolvidos aqui: **uma conta por pessoa** nos quatro apps e o
**disparo de e-mails** de cadastro e recuperação de senha.

---

## 1. Ligar o e-mail em ~5 minutos (Resend)

1. Crie a conta em **https://resend.com** (grátis, 3.000 e-mails/mês).
2. No painel: **API Keys → Create API Key** → copie o valor `re_...`.
3. No `server/.env`:

```bash
RESEND_API_KEY="re_sua_chave_aqui"
MAIL_FROM="Nexmarket <onboarding@resend.dev>"
APP_BASE_URL="https://pagamentos.seudominio.com"   # onde este servidor roda
```

4. Reinicie o servidor: `npm start`. Pronto.

> **Sobre o remetente:** `onboarding@resend.dev` funciona na hora, mas o
> Resend só entrega para **o e-mail dono da conta** — serve para testar. Para
> enviar a qualquer pessoa, vá em **Domains → Add Domain**, informe seu
> domínio e cadastre no seu DNS os registros que o Resend mostrar (SPF/DKIM,
> ~10 min). Depois troque para `MAIL_FROM="Nexmarket <nao-responda@seudominio.com>"`.

**Testando sem esperar cadastro:**

```bash
curl -X POST http://localhost:8787/api/auth/forgot-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"voce@seudominio.com","app":"cliente"}'
```

Sem `RESEND_API_KEY` o servidor **não quebra**: ele registra no log que o
e-mail não foi enviado e a resposta traz `warning`, para você não achar que
enviou.

### O que é enviado

| Quando | E-mail |
|---|---|
| Cadastro em qualquer app | Boas-vindas, com texto específico do app (o do entregador já avisa sobre os documentos) |
| "Esqueci minha senha" | Link de redefinição válido por 60 minutos, uso único |
| Senha alterada | Aviso de segurança |

O link abre a página `/redefinir-senha` **deste servidor** — funciona em
qualquer navegador, sem precisar de app instalado.

---

## 2. Conta única entre os quatro apps

### O problema

`joao@x.com` conseguia se cadastrar nos quatro apps e virava **quatro contas
diferentes**: cliente e entregador nasciam no Firebase Auth, enquanto loja e
empresa geravam `randomUUID()` em `staffCredentials/{app}/accounts/{email}`.
Pedidos, entregas e permissões da mesma pessoa ficavam em uids distintos.

### Como ficou

Agora existe `identities/{emailLower}`:

```jsonc
{
  "uid": "abc123",                  // sempre o uid do Firebase Auth
  "email": "joao@x.com",
  "roles": { "cliente": true, "entregador": true },
  "passwordHash": "$2a$12$...",     // senha única da plataforma
  "active": true
}
```

- **Um e-mail = um uid**, em todos os apps.
- **Papéis se acumulam**: quem é cliente pode virar entregador com o mesmo
  login. Tentar se cadastrar duas vezes no *mesmo* app devolve 409 com
  "faça login em vez de criar outra".
- **Senha única**: gravada em bcrypt (login de loja/empresa/entregador) e
  espelhada no Firebase Auth (login do cliente). Trocar a senha vale para tudo.
- **Papel é verificado no login**: senha certa em app sem o papel devolve
  "Esta conta não tem acesso ao app de Loja" — não entra por engano.
- Admin da Empresa **continua exigindo convite** (`adminInvites`).

### Migração de quem já usa

Automática e invisível: no primeiro login, contas de
`staffCredentials/{app}/accounts/{email}` são copiadas para a identidade,
reaproveitando o uid do Firebase Auth quando ele existir e guardando o uid
antigo em `legacyUids` (para você conseguir reconciliar dados históricos).

Nada precisa ser rodado manualmente — mas se quiser conferir depois da
migração, os documentos ficam em `identities/`.

### Nos apps

Os apps Flutter chamam `POST /api/identity/claim` logo após cadastro e login,
registrando o papel. Configure a URL do servidor no build:

```bash
flutter run --dart-define=NEXMARKET_API=https://pagamentos.seudominio.com
flutter build apk --dart-define=NEXMARKET_API=https://pagamentos.seudominio.com
```

Sem essa variável o app continua funcionando (cai no Firebase Auth nativo),
só não registra os papéis nem usa o e-mail personalizado.

---

## 3. Rotas novas

| Rota | Para que serve |
|---|---|
| `POST /api/identity/claim` | Registra/acumula o papel da conta logada |
| `GET /api/identity/me` | Papéis da conta logada |
| `POST /api/auth/forgot-password` | Dispara o e-mail de redefinição |
| `GET /api/auth/reset-password?token=` | Valida o link antes do formulário |
| `POST /api/auth/reset-password` | Efetiva a nova senha (vale para todos os apps) |
| `GET /redefinir-senha?token=` | Página web que o link do e-mail abre |

Segurança: o token de redefinição é aleatório e só o **hash** dele é
guardado; expira em 60 min, vale uma vez, e a resposta de
`forgot-password` é sempre igual — exista a conta ou não — para não revelar
quais e-mails estão cadastrados.

---

## 4. Checklist

```bash
cd server
npm install
npm test          # 30 testes (identidade, papéis, migração, e-mails, Stripe)
npm run doctor    # diagnóstico da Stripe
npm start
```

- [ ] `RESEND_API_KEY` no `.env`
- [ ] `APP_BASE_URL` apontando para a URL pública deste servidor
- [ ] `FIREBASE_SERVICE_ACCOUNT` preenchida (obrigatória para identidade e login)
- [ ] Domínio verificado no Resend (para enviar a qualquer destinatário)
- [ ] Apps buildados com `--dart-define=NEXMARKET_API=...`
