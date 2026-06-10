# Setup Manual: Criar Tabela de Push Notifications

## ⚠️ Situação Atual

A tabela `push_subscriptions` **não existe no banco de dados**. Você precisa criá-la manualmente no Supabase.

## ✅ Método 1: Via Supabase Studio (Recomendado)

### Passo 1: Abrir Supabase Studio
1. Vá para [https://app.supabase.com](https://app.supabase.com)
2. Selecione seu projeto Limiar
3. No menu lateral, clique em **"SQL Editor"**

### Passo 2: Executar SQL
Cole e execute o seguinte SQL:

```sql
-- Create push_subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL,
  p256dh_key  text NOT NULL,
  auth_key    text NOT NULL,
  user_agent  text,
  created_at  timestamptz DEFAULT now() NOT NULL,
  updated_at  timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, endpoint)
);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS push_subscriptions_user_created
  ON push_subscriptions(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Create policy allowing users to manage their own subscriptions
CREATE POLICY "Users can manage own push subscriptions"
  ON push_subscriptions FOR ALL USING (auth.uid() = user_id);

-- Create trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS set_updated_at ON push_subscriptions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
```

### Passo 3: Verificar
Após executar, você deve ver a tabela aparecer em **"Tables"** no menu lateral.

---

## ✅ Método 2: Via Supabase CLI (Para Produção)

Se estiver usando Supabase CLI localmente:

```bash
# Fazer login
supabase login

# Criar migração
supabase migration new create_push_subscriptions

# Editar a migração criada em supabase/migrations/
# (copiar o SQL acima para o arquivo)

# Executar localmente
supabase migration up

# Push para remoto (produção)
supabase db push
```

---

## 🧪 Testando Depois da Criação

### 1. Verificar que a tabela existe
```sql
-- Executar no Supabase SQL Editor
SELECT * FROM push_subscriptions LIMIT 1;
```

### 2. Testar no app
- Abra http://localhost:3001
- Vá para **Settings** (⚙️)
- Clique em **"Ativar notificações push"**
- Permita notificações no navegador
- Veja a mensagem "Notificações ativas — 05:30h e 22:00h (BRT)"

### 3. Verificar dados salvos
```sql
-- No Supabase SQL Editor
SELECT id, user_id, endpoint, created_at 
FROM push_subscriptions 
ORDER BY created_at DESC;
```

---

## 🚨 Se Tiver Erro ao Executar SQL

### Erro: "does not exist" ou "permission denied"
- Certifique-se de estar logado no Supabase como **proprietário do projeto**
- Verifique se selecionou o **projeto correto**

### Erro: "UNIQUE constraint conflict"
- Já existe um registro com (user_id, endpoint)
- Execute: `DELETE FROM push_subscriptions WHERE user_id = '...';`

### Erro: "role does not exist"
- A função `set_updated_at` pode não existir
- Ela já deve estar criada no schema geral
- Verifique em: **Database** → **Functions** → procure por `set_updated_at`

---

## 📋 Checklist de Configuração

- [ ] Tabela `push_subscriptions` criada no Supabase
- [ ] Index `push_subscriptions_user_created` criado
- [ ] RLS habilitado
- [ ] Policy "Users can manage own push subscriptions" criada
- [ ] Trigger `set_updated_at` configurado
- [ ] Dev server rodando (`npm run dev`)
- [ ] VAPID keys em `.env.local`
- [ ] Service worker em `/public/sw.js`
- [ ] Notificações habilitadas em Settings
- [ ] Permissão de notificações concedida no navegador

---

## 🔍 Dados Essenciais

A tabela armazena:
- **id**: UUID único para cada subscrição
- **user_id**: ID do usuário (referencia auth.users)
- **endpoint**: URL do servidor FCM para enviar notificações
- **p256dh_key**: Chave pública para criptografia
- **auth_key**: Chave de autenticação
- **user_agent**: Informação do navegador/dispositivo
- **created_at**: Data de criação
- **updated_at**: Data da última atualização

---

## 📞 Suporte

Se tiver dúvidas:
1. Verifique se a tabela existe via SQL Editor
2. Abra DevTools (F12) no navegador e procure por erros no Console
3. Verifique os logs do servidor (`npm run dev` output)
4. Leia `PUSH_NOTIFICATIONS_DEBUG.md` para mais detalhes
