-- ============================================================
-- EXECUÇÃO — relatório "Dados Operacionais / Registro de Falhas"
--
-- Fonte da verdade para o que foi EXECUTADO. Diferente do Resumo
-- do Dia (que é o planejamento das equipes com o desfecho de cada
-- passagem), este relatório lista só execução confirmada, com
-- OS + TSS + data + equipe, e pode ser puxado de um mês inteiro.
--
-- Comparativo no dia 04/09/2026:
--   Resumo do Dia .......... 7 baixas,   24 equipes, 5 chaves duplicadas
--   Dados Operacionais .. 245 execuções, 44 equipes, 0 duplicadas
--
-- Regra da carteira:
--   par (numero_os, tss) que sai de uma família entre dois dias
--     está aqui  -> EXECUTADO
--     não está   -> NÃO EXECUTADO (mas encerrado do mesmo jeito)
-- ============================================================

CREATE TABLE IF NOT EXISTS execucao (
  numero_os     TEXT NOT NULL,
  tss           TEXT NOT NULL,          -- serviço solicitado (casa com pendente_diario_os.tss)
  dia           DATE NOT NULL,          -- data de execução, só a data
  tse           TEXT,                   -- serviço efetivamente executado
  data_execucao TIMESTAMPTZ,            -- data/hora cheia
  data_competencia TIMESTAMPTZ,
  equipe        TEXT,
  atc           INT,                    -- 923 | 929 | 299
  ato           TEXT,
  municipio     TEXT,
  bairro        TEXT,
  logradouro    TEXT,
  observacao    TEXT,
  importado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (numero_os, tss, dia)
);

CREATE INDEX IF NOT EXISTS idx_execucao_dia        ON execucao(dia);
CREATE INDEX IF NOT EXISTS idx_execucao_equipe     ON execucao(equipe);
CREATE INDEX IF NOT EXISTS idx_execucao_os_tss     ON execucao(numero_os, tss);
CREATE INDEX IF NOT EXISTS idx_execucao_dia_os_tss ON execucao(dia, numero_os, tss);

-- Reimportação de um período: apaga antes de gravar de novo
CREATE OR REPLACE FUNCTION limpar_execucao(p_ini DATE, p_fim DATE)
RETURNS INT AS $$
DECLARE n INT;
BEGIN
  DELETE FROM execucao WHERE dia BETWEEN p_ini AND p_fim;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ------------------------------------------------------------
-- Casamento execução x saída da carteira
--
-- Uma OS+TSS que estava na carteira no dia X e não está no dia X+1
-- SAIU. Se existe execução dela, foi executada. A questão em aberto
-- é se a execução vem datada em X ou em X+1 — depende do horário em
-- que o robô puxa o pendente. Esta view mede as duas hipóteses para
-- a resposta sair do dado, não de suposição.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_casamento_execucao AS
WITH pares AS (
  SELECT p1.dia AS d1, p1.dia + 1 AS d2
    FROM (SELECT DISTINCT dia FROM pendente_diario_os) p1
   WHERE EXISTS (SELECT 1 FROM pendente_diario_os x WHERE x.dia = p1.dia + 1)
),
saiu AS (
  SELECT DISTINCT a.numero_os, a.tss, a.familia, pr.d1, pr.d2
    FROM pares pr
    JOIN pendente_diario_os a ON a.dia = pr.d1
   WHERE NOT EXISTS (
     SELECT 1 FROM pendente_diario_os b
      WHERE b.dia = pr.d2
        AND b.numero_os = a.numero_os
        AND upper(btrim(coalesce(b.tss,''))) = upper(btrim(coalesce(a.tss,''))))
)
SELECT s.d1 AS dia_saida,
       count(*) AS saiu,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM execucao e
          WHERE e.numero_os = s.numero_os
            AND upper(btrim(e.tss)) = upper(btrim(coalesce(s.tss,'')))
            AND e.dia = s.d1))                       AS exec_no_dia_d1,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM execucao e
          WHERE e.numero_os = s.numero_os
            AND upper(btrim(e.tss)) = upper(btrim(coalesce(s.tss,'')))
            AND e.dia = s.d2))                       AS exec_no_dia_d2,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM execucao e
          WHERE e.numero_os = s.numero_os
            AND upper(btrim(e.tss)) = upper(btrim(coalesce(s.tss,'')))
            AND e.dia BETWEEN s.d1 AND s.d2))        AS exec_na_janela
  FROM saiu s
 GROUP BY 1
 ORDER BY 1;


-- Baixas por família e dia, já separadas em executado / não executado.
-- É isso que alimenta a célula dividida da coluna "Baixas" na carteira.
CREATE OR REPLACE VIEW v_baixa_familia AS
WITH pares AS (
  SELECT p1.dia AS d1, p1.dia + 1 AS d2
    FROM (SELECT DISTINCT dia FROM pendente_diario_os) p1
   WHERE EXISTS (SELECT 1 FROM pendente_diario_os x WHERE x.dia = p1.dia + 1)
),
saiu AS (
  SELECT DISTINCT a.numero_os, a.tss, a.familia, a.unidade, pr.d1, pr.d2
    FROM pares pr
    JOIN pendente_diario_os a ON a.dia = pr.d1
   WHERE NOT EXISTS (
     SELECT 1 FROM pendente_diario_os b
      WHERE b.dia = pr.d2
        AND b.numero_os = a.numero_os
        AND upper(btrim(coalesce(b.tss,''))) = upper(btrim(coalesce(a.tss,''))))
)
SELECT s.d1 AS dia,
       s.familia,
       count(*) AS baixas,
       count(*) FILTER (WHERE e.numero_os IS NOT NULL)     AS executadas,
       count(*) FILTER (WHERE e.numero_os IS NULL)         AS nao_executadas,
       count(DISTINCT e.equipe) FILTER (WHERE e.equipe IS NOT NULL) AS equipes
  FROM saiu s
  LEFT JOIN execucao e
    ON e.numero_os = s.numero_os
   AND upper(btrim(e.tss)) = upper(btrim(coalesce(s.tss,'')))
   AND e.dia BETWEEN s.d1 AND s.d2      -- janela; ajustar após medir v_casamento_execucao
 GROUP BY 1, 2
 ORDER BY 1 DESC, baixas DESC;


-- Produção por equipe, direto da execução confirmada
CREATE OR REPLACE VIEW v_execucao_equipe AS
SELECT dia, equipe,
       count(*)                          AS execucoes,
       count(DISTINCT numero_os)         AS os_distintas,
       count(DISTINCT tss)               AS tipos_servico
  FROM execucao
 GROUP BY 1, 2;


-- RLS: leitura pública, escrita só logado
ALTER TABLE execucao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS execucao_read  ON execucao;
CREATE POLICY execucao_read  ON execucao FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS execucao_write ON execucao;
CREATE POLICY execucao_write ON execucao FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ============================================================
-- Depois de importar, rode esta:
--   SELECT * FROM v_casamento_execucao;
-- Ela diz se a execução do dia X aparece como saída em X ou em X+1.
-- A coluna com maior acerto define o casamento definitivo.
-- ============================================================
