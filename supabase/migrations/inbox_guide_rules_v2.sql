-- Guia da empresa: regras tiradas da leitura de 100 conversas (dez/2025 – out/2026).
-- Só insere as que ainda não existem (por título), para poder correr de novo.

INSERT INTO company_guide (section, title, content, source)
SELECT v.section, v.title, v.content, 'manual'
FROM (VALUES
  ('Processos', 'Made for Spain & Portugal (MFSP): tipos de email',
   '"Availability Request"/"Service Availability" = só pedido de disponibilidade ("this email is a request, not a confirmation") → venda Pending, não confirmar. "Confirmation"/"Service Confirmation" = reserva → confirmar. Prefixo "CLX:" = cancelamento. "CHANGE:" = alteração. "FINAL DETAILS" = dados dos clientes. "Chequeo"/"Reconfirmation" (guestrelations) = reconfirmar ("The tour is confirmed."). O código MFSP tem de constar na fatura.'),
  ('Processos', 'The Little Orange (TLO): tipos de email',
   'Assunto "TLO - Pedido de Reserva - NNNN" = reserva; "TLO - Pedido de Disponibilidade - NNNN" = só disponibilidade/pré-reserva. Guardar o número TLO na venda. Às vezes duas colegas enviam o mesmo pedido: verificar se já existe venda com esse número antes de criar outra.'),
  ('Processos', 'Tours for You (TFY): tipos de email',
   '"Link para validação de serviços (PRxxxx)" vem de no-reply@atlastfy.com: responder ao consultor em cc, não ao no-reply. Guardar o código PR/OC na venda. Se mudarem o código do mesmo serviço, atualizar a venda e pedir que avisem sempre que o ID muda.'),
  ('Processos', 'Código da agência na venda e na fatura',
   'Guardar sempre a referência da agência (MFSP…, TLO nº, PR… da TFY, TLA…) no nome/ID da venda. A fatura tem de indicar essa referência.'),
  ('Serviços', 'Horários-padrão',
   'Old School to New School (com ou sem chef): 11h00–15h00. Fisherman Road: 11h00. Cooking Class no Barro: 11h00–15h00 (pode ser 10h00–14h00). Cooking class/jantar ao fim do dia: 18h30/19h00–22h00/22h30. Podemos atrasar até 30 min ("We prefer to start at 11am to beat the crowds"). Não fazemos tours à tarde.'),
  ('Serviços', 'Pontos de encontro',
   'Old School to New School: Estação de São Bento às 11h00, ou o guia vai ao hotel do cliente. Cooking class: porta principal do Mercado do Bolhão (Rua Formosa); fim no Restaurante Barro. Drop-off da tour: em frente às Caves Bombarda. Hotel em Gaia: Ourivesaria Carneiro, ou ir ao hotel com táxi pago pela agência. MFSP: encontro sempre no hotel do cliente (táxi já incluído pela MFSP).'),
  ('Serviços', 'Barro vs Chef''s House',
   'Desde 2027 a Cooking Class no Restaurante Barro é para grupos de 10 a 20 pessoas (já fizemos 24). Abaixo de 10 pessoas é Cooking Class at Chef''s House. Se a casa do chef não estiver disponível, propor o Barro ou outra data; se a agência vendeu "em casa do chef", tentar acomodar.'),
  ('Serviços', 'Fisherman Road e mau tempo',
   'A Fisherman Road é sobretudo ao ar livre: não recomendar em datas com mau tempo provável (outono/inverno). Propor em alternativa a Old School to New School com foco em marisco.'),
  ('Serviços', 'Transporte',
   'Old School to New School é uma tour a pé: não precisa de carro ("This is a walking tour, no need for transportation"), salvo limitações de mobilidade — aí recomendar transporte. Para grupos de 6 ou mais com hotel longe, melhor ser a agência a organizar o transfer.'),
  ('Respostas', 'Com ou sem chef',
   'Old School to New School e Fisherman Road existem com e sem chef. Se o pedido não for claro, perguntar "Would you like to move forward with or without a chef?". Confirmar sempre a variante pedida antes de responder (erro já aconteceu).'),
  ('Respostas', 'Responder no próprio dia',
   'Responder a todos os pedidos no próprio dia útil. Se ainda não houver resposta (disponibilidade, preço de fornecedor), enviar logo "Obrigado pelo pedido! Estamos a verificar e respondemos em breve." Já perdemos uma venda por responder 3 dias depois.'),
  ('Respostas', 'Fórmulas de confirmação',
   'Disponibilidade: "Obrigado pelo pedido! Temos sim disponibilidade para [tour] no dia [X] pelas [h]. O preço é de X € + IVA por pessoa, total de Y €. Avanço com a reserva?" Confirmação: "Confirmado do nosso lado! Aguardamos a partilha de um contacto telefónico e de quaisquer restrições alimentares/de mobilidade existentes." Cancelamento: agradecer e "Esperamos trabalhar convosco noutra oportunidade."'),
  ('Respostas', 'Não colar resumos internos',
   'Nunca colar no email o bloco interno da app ("ID: … Status: Pending Client: … Type: …"). Para resumir uma reserva usar uma frase: data, nº de pessoas, serviço e horário.'),
  ('Respostas', 'Incidentes',
   'Se algo correr mal num serviço: email no próprio dia, pedido de desculpa por escrito e compensação (não cobrar o serviço ou devolver parte). Com a MFSP, durante a viagem do cliente contactar também o Guest Relations (24/7).'),
  ('Clientes', 'Eventos com bilhete (Out of the Blue, Angeiras)',
   'Pedidos de inscrição em eventos: responder com o link de compra de bilhetes. Se esgotado: "Os bilhetes estão esgotados, mas vamos incluí-los na lista de espera." Responder no próprio dia — atrasos geram frustração.'),
  ('Clientes', 'Clientes diretos e referências',
   'Clientes que vêm por recomendação: agradecer a recomendação logo na primeira frase. Perguntar hotel e restrições, e forma de pagamento (transferência ou numerário no dia). Para faturar pedir nome, morada e NIF (VAT). Combinar quem contacta o cliente antes da tour e cumprir.'),
  ('Despesas', 'Faturação a clientes e agências',
   'Enviar a fatura até 7 dias depois do serviço (as agências já tiveram de pedir várias vezes). Dados bancários sempre da COME FOOD TOURS, LDA (Crédito Agrícola). Antes de enviar confirmar: o anexo está mesmo anexado e é a fatura deste cliente/serviço. MFSP: faturas para o departamento de contas (r.bautista), com a comissão já deduzida se pedido.'),
  ('Disponibilidade', 'Pré-reservas',
   'Quando a agência está em fase de proposta, oferecer bloquear a data sem custos com prazo ("querem que bloqueie a data enquanto esperam?"). Antes do prazo, perguntar se avança; se não avançar, libertar a data.')
) AS v(section, title, content)
WHERE NOT EXISTS (SELECT 1 FROM company_guide g WHERE g.title = v.title);
