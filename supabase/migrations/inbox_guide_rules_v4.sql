-- Guia: preço não muda com restrições; Calendly = cliente Website; ID da venda obrigatório.
INSERT INTO company_guide (section, title, content, source)
SELECT v.section, v.title, v.content, 'manual'
FROM (VALUES
  ('Preços', 'Restrições não alteram o preço',
   'Restrições alimentares, alergias (mesmo anafiláticas) ou pedidos de menu sem peixe/marisco/carne não alteram o preço. Responder sempre com o preço da tabela (tabela de preços no email, antes do fecho) e confirmar que o menu é adaptado. Não prometer "proposta personalizada" por causa de restrições.'),
  ('Processos', 'Reservas do website (Calendly)',
   'Pedidos que chegam pelo Calendly (notifications@calendly.com) são vendas do cliente "Website". O nome de quem reservou vai em "Nomes" e o email/telefone dessa pessoa na venda.'),
  ('Processos', 'ID da venda (obrigatório)',
   'Todas as vendas têm ID. Agências: o código da agência (MFSP…, TLO nº, PR…/OC… da TFY). Website e clientes diretos: Nome_Apelido do cliente (ex.: Lynn_Hamilton). Um pedido com vários serviços cria uma venda por serviço com o ID + _1, _2, _3… (ex.: MFSP26111139_1, MFSP26111139_2).')
) AS v(section, title, content)
WHERE NOT EXISTS (SELECT 1 FROM company_guide g WHERE g.title = v.title);
UPDATE company_guide SET content = 'Guardar sempre a referência da agência (MFSP…, TLO nº, PR…/OC… da TFY) como ID da venda; com vários serviços no mesmo pedido, ID_1, ID_2… A fatura tem de indicar essa referência.', updated_at = now()
WHERE title = 'Código da agência na venda e na fatura';
