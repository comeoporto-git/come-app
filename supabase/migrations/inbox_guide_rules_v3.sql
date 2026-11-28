-- Guia da empresa: regras tiradas da leitura de mais 100 conversas (fev–nov 2026)
-- e da revisão dos pedidos da The Little Orange. Só insere as que ainda não
-- existem (por título); as duas regras alteradas são atualizadas.

INSERT INTO company_guide (section, title, content, source)
SELECT v.section, v.title, v.content, 'manual'
FROM (VALUES
  ('Serviços', 'The Little Orange (TLO): nomes das tours',
   'A TLO usa nomes próprios para as nossas tours: "Taste Porto''s evolving food scene with a local expert" = Old School to New School + Chef. "Local food & wine expert journey" = Fisherman Road + Chef. "Exclusive cooking experience led by a local chef" / "Cooking class at the chef''s house" = Cooking Class at Chef''s House (se não houver, propor o Barro). "Chef at Home" = chef em casa. Para a TLO, a Old School e a Fisherman Road são SEMPRE com chef. Se a TLO escrever que é sem chef, não confirmar sem falar com a equipa. A TLO indica muitas vezes 11h00–14h00: o nosso horário é 11h00–15h00; se o cliente tiver de acabar mais cedo, dizê-lo e ajustar.'),
  ('Respostas', 'Responder a tudo o que foi perguntado',
   'Ler o último email até ao fim e responder a cada pergunta e a cada data alternativa proposta (ex.: "se não der, pode ser a 7 de outubro?"). Nunca recusar sem propor uma alternativa: outra data, outro serviço ou o Barro em vez da casa do chef. Já perdemos vendas por responder só "não temos disponibilidade".'),
  ('Respostas', 'Nome de quem escreve',
   'Cumprimentar pelo primeiro nome de quem assinou a última mensagem, escrito como ela escreve (Rachelle, não Rachel; Inês, não Ricardo). Se o email vem de um endereço genérico sem assinatura, usar só "Olá,". Quando a agência muda de pessoa ("I''m in charge of this trip now"), responder à nova pessoa.'),
  ('Respostas', 'Verificar antes de confirmar',
   'Antes de enviar uma confirmação, comparar com o pedido: data, nº de pessoas (se há mais nomes do que pax, perguntar), serviço, com/sem chef e horário. Já confirmámos datas de outra reserva por engano.'),
  ('Disponibilidade', 'Feriados e domingos',
   'Ao domingo não fazemos tours. Em feriados (25 de Abril, 1 de Maio, etc.) os mercados estão fechados: a Fisherman Road fica afetada — propor o dia anterior ou seguinte.'),
  ('Respostas', 'Reconfirmações e informações recebidas',
   'Responder sempre, numa linha, a reconfirmações ("Chequeo", "Reconfirmation"): "Everything is set for this tour." / "Está tudo confirmado." A informações enviadas (contactos, alergias, FINAL DETAILS): "Obrigado pela informação!" A comprovativos de pagamento: conferir o valor com a fatura e responder "Tudo ok, obrigado!" — ou pedir o valor em falta.'),
  ('Processos', 'Cancelamentos',
   'Cancelamento com antecedência: sem custos ("There is no cancellation fee as it is well in advance"), enviando a política de pagamento e cancelamento. Se o serviço ainda não foi faturado, não há crédito a dar. Perguntar sempre se os clientes querem outra data. Fechar com "Esperamos trabalhar convosco noutra oportunidade."'),
  ('Despesas', 'Dados de faturação da COME',
   'Reservar e pedir faturas a fornecedores sempre em nome de COME FOOD TOURS, LDA — NIF 518814653 — Avenida Vasco da Gama 831, 4410-336 Vila Nova de Gaia. Reservas feitas em nome pessoal não dão fatura à empresa. Recibos de software (Vercel, Anthropic), seguros, taxas (RNAAT), transportes (Travel VIP) e aluguer de material (Mesa Posta) são despesas a registar; notas de crédito/reembolsos abatem.'),
  ('Serviços', 'Douro Surprise / atividade no Douro',
   'Grupo de 4 a 6 pessoas: 375,00 € + IVA por pessoa, transporte dos clientes à parte (por conta da agência, ou orçamentado por nós). Encontro na estação do Pinhão. Das 9h às 21h termina na Quinta de Nápoles; das 9h às 19h termina na Casa dos Lagares. A pedidos de desconto: "Estivemos a rever, e terão de ser mesmo estes preços."'),
  ('Processos', 'Tarifas anuais e apresentação a parceiros',
   'A agências que pedem tarifas/condições do ano (ou depois de uma chamada de prospeção): agradecer, enviar em anexo o PDF "Descrições e Preços" e o link da pasta de fotografias no Drive, e oferecer uma reunião. Modelo: "Somos uma empresa de Food Tours, Cooking Classes e Eventos Gastronómicos no Porto e Norte de Portugal".'),
  ('Processos', 'Reservas de mesa no Barro',
   'Pedidos de reserva de mesa no Restaurante Barro (sem cooking class) não são connosco: indicar que devem reservar diretamente com o restaurante.'),
  ('Processos', 'Nome do guia',
   'Quando a agência pede o nome e contacto do guia, decidir o guia cerca de 2 semanas antes da tour e enviar logo. Não deixar a agência pedir duas vezes.'),
  ('Processos', 'Pedidos em duplicado',
   'A mesma reserva chega por vezes de duas pessoas da mesma agência (MFSP, TLO). Antes de criar uma venda, procurar pelo código da agência e pela data; responder às duas a dizer que só existe uma reserva.')
) AS v(section, title, content)
WHERE NOT EXISTS (SELECT 1 FROM company_guide g WHERE g.title = v.title);

UPDATE company_guide SET content =
  'Old School to New School (com ou sem chef): 11h00–15h00. Fisherman Road: 11h00. Cooking Class no Barro: 11h00–15h00 (pode ser 10h00–14h00). Cooking class/jantar ao fim do dia: 18h30/19h00–22h00/22h30. As tours são sempre de manhã: propor 11h00 e, se o programa do cliente não der, ajustar dentro da manhã (ex.: 10h30–14h30, ou começar até às 12h00) em vez de passar para a tarde. Tours à tarde só com aprovação da equipa. "We prefer to start at 11am to beat the crowds".',
  updated_at = now()
WHERE title = 'Horários-padrão';

UPDATE company_guide SET content =
  'Old School to New School e Fisherman Road existem com e sem chef. Para a TLO são sempre com chef (ver "The Little Orange (TLO): nomes das tours"). Para os outros, se o pedido não for claro, perguntar "Would you like to move forward with or without a chef?". Confirmar sempre a variante pedida antes de responder — já houve vários erros.',
  updated_at = now()
WHERE title = 'Com ou sem chef';
