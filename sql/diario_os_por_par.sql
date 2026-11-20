-- ============================================================
-- A FOTO DIÁRIA PASSA A GUARDAR O PAR (numero_os, tss)
--
-- O QUE ESTAVA ERRADO
--
-- A `pendente_diario_os` guardava UMA LINHA POR OS. Quando a OS
-- carrega dois serviços, o segundo não era gravado — calado. Medido
-- em 16/10/2026: no export cru daquele dia, 937 linhas para 917 OS,
-- 17 OS com mais de um serviço, quase todas de REPOSIÇÃO.
--
-- O defeito não estava na tabela, estava em quem escrevia nela: o
-- robô deduplicava por `numero_os` antes de enviar (`seen.has(numero)`
-- no `salvarDiarioOS`, e o mesmo no `importar_historico.js`). Os dois
-- passaram a deduplicar pelo PAR em 19/11/2026.
--
-- A unidade do negócio é o par: uma OS que gera duas etapas conta
-- duas vezes, que é como a equipe é medida. Era a foto que
-- desobedecia a isso.
--
-- POR QUE ESTE ARQUIVO EXISTE
--
-- Se a tabela tiver chave única por (dia, numero_os), a segunda linha
-- da mesma OS é RECUSADA pelo banco e o robô morre no passo 14 — e
-- aquele passo é embrulhado num try/catch "não crítico", então o dia
-- ficaria SEM FOTO, com um aviso solto no log. Rode isto ANTES da
-- primeira rodada depois das 17h.
--
-- O QUE VAI MUDAR NA TELA, E É ESPERADO
--
-- A carteira passa a contar serviços, não OS, então ela SOBE de 5 a
-- 24 de um dia para o outro. É um degrau correto, igual ao do prazo
-- em 15/10 e ao da GARANTIA em 18/11: o passado não pode ser
-- recalculado, porque as linhas que nunca foram gravadas não existem
-- em lugar nenhum. Não tentar "consertar" o degrau depois.
--
-- De bom: a foto e a `pendente_historico` passam a contar a mesma
-- coisa, e a diferença de 5 a 24 entre elas — que não tinha padrão e
-- fazia a conta da tela errar por 3 num dia e 83 noutro — acaba. A
-- conferência no fim mede isso.
-- (19/11/2026)
-- ============================================================


-- ---------- 1. OLHE ANTES DE MEXER ----------
-- Rode as duas e veja o que existe hoje. Se nenhuma linha mencionar
-- (dia, numero_os), não há nada a derrubar e o passo 2 não faz nada.

-- SELECT conname, pg_get_constraintdef(oid) AS definicao
--   FROM pg_constraint
--  WHERE conrelid = 'pendente_diario_os'::regclass;

-- SELECT indexname, indexdef
--   FROM pg_indexes
--  WHERE tablename = 'pendente_diario_os';


-- ---------- 2. TROCAR A CHAVE ----------
-- Derruba SÓ o que for exatamente por (dia, numero_os) — primeiro as
-- constraints, depois índices únicos soltos. Qualquer outra chave ou
-- índice fica como está.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
     WHERE conrelid = 'pendente_diario_os'::regclass
       AND contype IN ('p','u')
  LOOP
    IF r.def ~ '^(PRIMARY KEY|UNIQUE) \(dia, numero_os\)$' THEN
      RAISE NOTICE 'derrubando constraint % (%)', r.conname, r.def;
      EXECUTE format('ALTER TABLE pendente_diario_os DROP CONSTRAINT %I', r.conname);
    END IF;
  END LOOP;

  FOR r IN
    SELECT indexname, indexdef FROM pg_indexes
     WHERE tablename = 'pendente_diario_os'
  LOOP
    IF r.indexdef ~ 'UNIQUE INDEX' AND r.indexdef ~ '\(dia, numero_os\)$' THEN
      RAISE NOTICE 'derrubando indice unico %', r.indexname;
      EXECUTE format('DROP INDEX %I', r.indexname);
    END IF;
  END LOOP;
END $$;

-- A chave nova. Não é obrigatória — o robô apaga o dia antes de
-- inserir e já manda sem repetição —, mas deixa escrito no banco qual
-- é o grão da tabela, e barra uma segunda gravação do mesmo dia.
CREATE UNIQUE INDEX IF NOT EXISTS pendente_diario_os_par_idx
  ON pendente_diario_os (dia, numero_os, tss);


-- ============================================================
-- CONFERÊNCIA — depois da primeira rodada pós-17h
-- ============================================================

-- A) O SEGUNDO SERVIÇO PASSOU A ENTRAR? Até ontem, linhas = OS
--    distintas, sempre. A partir de hoje tem de sobrar linha.
--
-- SELECT dia, count(*) AS linhas, count(DISTINCT numero_os) AS os,
--        count(*) - count(DISTINCT numero_os) AS segundo_servico
--   FROM pendente_diario_os
--  WHERE dia >= current_date - 7
--  GROUP BY 1 ORDER BY 1;

-- B) A FOTO E O HISTÓRICO PASSARAM A CONTAR A MESMA COISA? A
--    diferença era de 5 a 24, sem padrão. Depois disto tem de ser 0.
--
-- WITH f AS (SELECT dia, count(*) n FROM pendente_diario_os GROUP BY 1),
--      h AS (SELECT dia, sum(total) n FROM pendente_historico GROUP BY 1)
-- SELECT f.dia, f.n AS foto, h.n AS historico, h.n - f.n AS diferenca
--   FROM f JOIN h USING (dia)
--  WHERE f.dia >= current_date - 10
--  ORDER BY f.dia;

-- C) A SOBRA DA CONTA DA PRODUÇÃO DIMINUIU? Era o maior pedaço dela:
--    entradas e execuções contam serviços, e a foto contava OS.
--    Rode a conferência (A) do sql/producao_dia.sql antes e depois.


-- ============================================================
-- DESFAZER
-- ============================================================
-- Voltar a chave antiga só funciona se o dia já gravado não tiver
-- par repetido de OS — e terá, assim que a primeira rodada nova
-- passar. Então o caminho de volta é apagar o dia e deixar o robô
-- gravar de novo com o código antigo:
--
-- DROP INDEX IF EXISTS pendente_diario_os_par_idx;
-- DELETE FROM pendente_diario_os WHERE dia = current_date;
