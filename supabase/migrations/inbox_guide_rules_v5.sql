-- Guia: regras dos últimos pedidos (despesas como as anteriores, a própria
-- reserva não é conflito, emails ligados à venda, notificações, pendentes/tratados).
INSERT INTO company_guide (section, title, content, source)
SELECT v.section, v.title, v.content, 'manual'
FROM (VALUES
  ('Despesas', 'Registar despesas como as anteriores do fornecedor',
   'Uma fatura nova regista-se como as despesas anteriores do mesmo fornecedor: mesmo nome, método de pagamento, conta, estado e despesa de sócio (ex.: o seguro automóvel de 67,87 €/mês é despesa de sócio do António, paga com Cartão COME). Se a despesa já existe (veio do banco ou do cartão) sem fatura, anexar a fatura a essa despesa em vez de criar outra; se já tem fatura, não registar de novo.'),
  ('Disponibilidade', 'A própria reserva não é conflito',
   'Ao verificar disponibilidade para uma reserva que já existe na app, comparar pelo ID da venda: uma venda com o mesmo ID (ou o mesmo código da agência, incl. _1, _2…) é esta reserva e não ocupa a data. Só uma venda com outro ID é conflito.'),
  ('Processos', 'Emails ligados à venda',
   'Todo o email sobre uma venda fica ligado a ela (aparece em Emails na página do serviço). Quando entra um email sem venda, procurar o código da agência no assunto/texto: se corresponde a uma venda (ou às vendas _1, _2… do mesmo pedido), ligar automaticamente. Antes de responder, ler também as outras conversas já ligadas à venda.'),
  ('Processos', 'Notificações automáticas',
   'Notificações de sistemas (Vercel, GitHub, deploys, merges), newsletters, questionários e apps de viagem são lidas e arquivadas na etiqueta "Notificações" do Gmail. Só as importantes (falhas, erros, alertas de segurança, pagamentos falhados, limites, prazos legais) ficam na caixa com estrela e destacadas na app.'),
  ('Processos', 'Caixa de entrada: pendentes e tratados',
   'Pendente = precisa de resposta/ação nossa ou ainda está por ler no Gmail. Tratado = lido e sem nada a fazer (fica lido no Gmail) e não aparece nos pendentes; se chegar um email novo nessa conversa, volta à fila. Eliminar = mover para o lixo do Gmail. Emails que enviamos (pela app ou no Gmail) atualizam o ponto de situação, as tarefas e as sugestões da conversa.')
) AS v(section, title, content)
WHERE NOT EXISTS (SELECT 1 FROM company_guide g WHERE g.title = v.title);
