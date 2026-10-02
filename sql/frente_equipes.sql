-- ============================================================
-- AS 22 EQUIPES QUE AINDA ESTÃO EM OUTROS
--
-- Rode no SQL Editor do Supabase. Depois de sql/equipe_cobertura.sql.
--
-- O PROBLEMA NÃO ERA FALTA DE DADO. A consulta opcional do
-- equipe_cobertura.sql (5% das execuções e no mínimo 3 vezes) nunca
-- pegou essas 22 porque foi rodada antes da tabela `execucao` encher.
-- Hoje são 11.697 execuções de 55 dias (01/08 a 24/09), e cada uma
-- das 22 tem uma frente dominante que não deixa dúvida:
--
--   as 9 MOTO-ME            MOTO          98% a 100% das execuções
--   as 7 NORBRASIL          DESOBSTRUÇÃO  100%
--   SAN INT - ASF           ASFALTO       100% (191 execuções)
--   as 4 SAN INT - OBRAS    OBRAS + VAZAMENTO + ESGOTO (polivalentes)
--
-- Sobram duas que NÃO são equipe de campo e devem continuar sem
-- frente, para seguirem fora do Sugerir:
--   GLOBAL INTERLAGOS - BRYAN         14 execuções — é o seu login
--   PROGRAMAÇÃO - CRISTIANE OLIVEIRA   3 execuções — escritório
-- Elas continuam aparecendo na Produção; só não recebem itinerário.
--
-- Equipe sem frente nenhuma fica fora da distribuição automática, e
-- é isso que estava acontecendo: 22 de 59 equipes ativas, 37% da
-- operação, invisíveis para o Sugerir sem ninguém avisar.
-- ============================================================

-- ---------- 1. CONFIRA ANTES ----------
-- Veja o que vai ser escrito, sem escrever nada:
--
-- WITH base AS (
--   SELECT e.equipe, t.tipo, count(*) AS n
--     FROM execucao e JOIN tss_tipo t ON t.tss = e.tss
--    WHERE e.equipe IS NOT NULL GROUP BY 1,2
-- ), tot AS (SELECT equipe, sum(n) AS tot FROM base GROUP BY 1)
-- SELECT b.equipe, b.tipo, b.n, round(100.0*b.n/tot.tot,1) AS pct
--   FROM base b JOIN tot ON tot.equipe=b.equipe
--   JOIN equipe q ON q.nome=b.equipe
--  WHERE q.ativa AND cardinality(q.tipos)=0
--  ORDER BY b.equipe, b.n DESC;

-- ---------- 2. PREENCHE PELO QUE A EQUIPE EXECUTOU ----------
-- Mesma regra do equipe_cobertura.sql: entra toda frente que responde
-- por pelo menos 5% das execuções da equipe e aparece no mínimo 3
-- vezes. Só mexe em quem está com 0 frente — não desfaz correção sua.
--
-- OUTROS fica de fora do array: é o estado de "não sei", não uma
-- frente. Equipe cuja única medição fosse OUTROS continua sem frente.
WITH base AS (
  SELECT e.equipe,
         coalesce(t.tipo_manual, t.tipo) AS tipo,
         count(*) AS n
    FROM execucao e
    JOIN tss_tipo t ON t.tss = e.tss
   WHERE e.equipe IS NOT NULL
     AND coalesce(t.tipo_manual, t.tipo) IS NOT NULL
     AND coalesce(t.tipo_manual, t.tipo) <> 'OUTROS'
   GROUP BY 1, 2
), tot AS (
  SELECT equipe, sum(n) AS tot FROM base GROUP BY 1
), forte AS (
  SELECT b.equipe, array_agg(b.tipo ORDER BY b.n DESC) AS tipos
    FROM base b
    JOIN tot ON tot.equipe = b.equipe
   WHERE b.n >= 3 AND b.n::numeric / tot.tot >= 0.05
   GROUP BY 1
)
UPDATE equipe e
   SET tipos = f.tipos,
       tipo  = f.tipos[1],                 -- frente principal: só agrupa a lista da tela
       atualizado_em = now()
  FROM forte f
 WHERE f.equipe = e.nome
   AND cardinality(e.tipos) = 0
   -- as duas que não são equipe de campo continuam de fora
   AND e.nome NOT IN ('GLOBAL INTERLAGOS - BRYAN','PROGRAMAÇÃO - CRISTIANE OLIVEIRA');

-- ---------- 3. DEIXE CLARO QUE AS DUAS SÃO DE PROPÓSITO ----------
-- Sem isso, na próxima vez você vai achar que ficaram esquecidas.
UPDATE equipe
   SET observacao = coalesce(nullif(observacao,'') || ' · ', '')
                 || 'sem frente de propósito: não é equipe de campo, não entra no Sugerir'
 WHERE nome IN ('GLOBAL INTERLAGOS - BRYAN','PROGRAMAÇÃO - CRISTIANE OLIVEIRA')
   AND coalesce(observacao,'') NOT LIKE '%sem frente de propósito%';

-- ---------- 4. CONFERÊNCIA ----------
-- Deve sobrar só as duas:
--   SELECT nome, tipo, observacao FROM equipe
--    WHERE ativa AND cardinality(tipos)=0 ORDER BY 1;
--
-- Quantas equipes por frente agora (polivalente conta em cada uma):
--   SELECT t AS frente, count(*) FROM equipe, unnest(tipos) t
--    WHERE ativa GROUP BY 1 ORDER BY 2 DESC;
--
-- As polivalentes, para você olhar se bate com a realidade:
--   SELECT nome, tipos FROM equipe
--    WHERE ativa AND cardinality(tipos)>1 ORDER BY 1;
--
-- Voltar uma equipe para "sem frente":
--   UPDATE equipe SET tipos='{}', tipo='OUTROS' WHERE nome='...';

-- ============================================================
-- NOTA SOBRE 5 TSS DE REPOSIÇÃO MEDIDAS COMO VAZAMENTO
--
-- Não mexa nelas por aqui — é para você decidir na tela (botão
-- Frentes). Estas cinco começam com REPOR e estão medidas como
-- VAZAMENTO porque é a turma do vazamento que as executa:
--
--   REPOR PASSEIO ADJACENTE CIMENTADO       VAZAMENTO  61%  (93 exec)
--   REPOR PASSEIO ADJACENTE CIMENTADO INV   VAZAMENTO  73%
--   REPOR PISO INTERNO CIMENTADO            VAZAMENTO  61%
--   REPOR ASFALTO A FRIO                    VAZAMENTO  50%
--   REPOR ASFALTO A FRIO INV                VAZAMENTO  64%
--
-- Para o ITINERÁRIO isso provavelmente está CERTO: você mesmo disse
-- que a equipe de vazamento sana, compacta, sela a base e às vezes
-- faz o cimentado. A medição concorda com você.
--
-- Para a ORDEM DAS ETAPAS estaria errado, e por isso o site passou a
-- tirar a etapa do NOME da TSS e não da frente: "REPOR ..." é
-- reposição em qualquer caso, mesmo quando quem repõe é a turma do
-- vazamento. Nada a fazer no banco.
--
-- A única que vale um olhar seu é REPOR ASFALTO A FRIO: você disse
-- que a equipe de vazamento nunca repõe asfalto, e a medição diz que
-- nesta ela repõe. Se for remendo a frio de emergência, está certo.
-- ============================================================
