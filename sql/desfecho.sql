-- ============================================================
-- DESFECHO DE OS — separa "saiu da carteira" de "foi executada"
--
-- Problema: hoje a carteira conta como "Exec." toda OS que sumiu
-- entre dois dias. No Resumo do Dia de 30/08, das 125 OS que
-- saíram, 42 (34%) NÃO foram execução — foram encerradas por
-- imóvel fechado, duplicidade, "não existe rede da Sabesp", etc.
--
-- Solução: o próprio Resumo do Dia já diz o motivo. A combinação
-- Status da OS + Resultado + Causa Resultado resolve quase tudo
-- sozinha. Só o que o mapa não conhecer vai pra fila manual.
--
-- Executar no Supabase SQL Editor, de cima pra baixo.
-- ============================================================


-- ------------------------------------------------------------
-- 0) Normalizador de texto
--    O relatório varia em espaço e caixa. IMMUTABLE para poder
--    ser usado em índice.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION norm_txt(t TEXT) RETURNS TEXT AS $$
  SELECT upper(btrim(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g')));
$$ LANGUAGE sql IMMUTABLE;


-- ------------------------------------------------------------
-- 1) Tipos de desfecho
--    conta_producao = TRUE  -> entra como execução da equipe
--    sai_carteira   = FALSE -> a OS continua pendente
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS desfecho_tipo (
  codigo         TEXT PRIMARY KEY,
  rotulo         TEXT NOT NULL,
  conta_producao BOOLEAN NOT NULL DEFAULT FALSE,
  sai_carteira   BOOLEAN NOT NULL DEFAULT TRUE,
  cor            TEXT,
  ordem          INT NOT NULL DEFAULT 99
);

INSERT INTO desfecho_tipo (codigo, rotulo, conta_producao, sai_carteira, cor, ordem) VALUES
  ('EXECUTADA',   'Executada',              TRUE,  TRUE,  '#10b981', 1),
  ('IMPRODUTIVA', 'Improdutiva',            FALSE, TRUE,  '#f59e0b', 2),
  ('NADA_CONSTA', 'Nada consta no local',   FALSE, TRUE,  '#8b5cf6', 3),
  ('CANCELADA',   'Cancelada',              FALSE, TRUE,  '#64748b', 4),
  ('ERRO_BASE',   'Erro de base',           FALSE, TRUE,  '#ef4444', 5),
  ('PERMANECE',   'Continua na carteira',   FALSE, FALSE, '#3b82f6', 6)
ON CONFLICT (codigo) DO UPDATE
  SET rotulo = EXCLUDED.rotulo,
      conta_producao = EXCLUDED.conta_producao,
      sai_carteira = EXCLUDED.sai_carteira,
      cor = EXCLUDED.cor,
      ordem = EXCLUDED.ordem;


-- ------------------------------------------------------------
-- 2) Mapa: (Status da OS + Resultado + Causa Resultado) -> desfecho
--
--    '*' = coringa. É OBRIGATÓRIO para Resultado='Executado',
--    porque nesse caso a Causa Resultado não é uma causa: ela
--    repete a descrição do serviço (31 valores distintos em 83
--    linhas num único dia). Sem coringa, nunca casaria.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mapa_desfecho (
  id              BIGSERIAL PRIMARY KEY,
  status_os       TEXT NOT NULL,
  resultado       TEXT NOT NULL DEFAULT '*',
  causa_resultado TEXT NOT NULL DEFAULT '*',
  desfecho        TEXT NOT NULL REFERENCES desfecho_tipo(codigo),
  observacao      TEXT,
  atualizado_por  UUID,
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mapa_desfecho_chave
  ON mapa_desfecho (norm_txt(status_os), norm_txt(resultado), norm_txt(causa_resultado));


-- Regras derivadas do Resumo do Dia de 30/08/2026 (163 linhas, 24 equipes)
INSERT INTO mapa_desfecho (status_os, resultado, causa_resultado, desfecho, observacao) VALUES
  -- Fechou e executou -> produção. Causa é coringa (é a descrição do serviço).
  ('Fechada', 'Executado', '*', 'EXECUTADA', 'Causa repete o serviço; não serve de chave'),

  -- Fechou SEM executar: a OS morre, mas não é produção.
  ('Fechada', 'Não Executado', 'IMÓVEL FECHADO, ORDEM ENCERRADA',          'IMPRODUTIVA', '26 casos em 30/08 — maior ofensor'),
  ('Fechada', 'Não Executado', 'CLIENTE NÃO PERMITIU EXECUÇÃO DO SERVIÇO', 'IMPRODUTIVA', NULL),
  ('Fechada', 'Não Executado', 'CANCELADO A PEDIDO DO CLIENTE',            'CANCELADA',   NULL),
  ('Fechada', 'Não Executado', 'TRATA-SE DE OUTRO SERVIÇO',                'ERRO_BASE',   'Erro de triagem/cadastro'),
  ('Fechada', 'Não Executado', 'DUPLICIDADE',                              'ERRO_BASE',   NULL),
  ('Fechada', 'Não Executado', 'SERVIÇO EXECUTADO ANTERIORMENTE',          'ERRO_BASE',   NULL),
  ('Fechada', 'Não Executado', 'NÃO EXISTE REDE DA SABESP NO LOCAL',       'NADA_CONSTA', NULL),
  ('Fechada', 'Não Executado', 'GAP - RESPONSABILIDADE DA PREFEITURA',     'NADA_CONSTA', NULL),
  ('Fechada', 'Não Executado', 'NÚMERO/IMÓVEL NÃO LOCALIZADO',             'NADA_CONSTA', NULL),
  -- Passagem da equipe que não concluiu. Se OUTRA equipe executou a mesma
  -- OS no mesmo dia, o desempate abaixo faz a execução vencer.
  ('Fechada', 'Não Executado', 'CONTINUA - SERVIÇO NÃO CONCLUÍDO',         'IMPRODUTIVA', 'Passagem sem conclusão; execução de outra equipe tem precedência'),

  -- Não fechou: continua na carteira, não é baixa de jeito nenhum.
  ('Despachada',    '*', '*', 'PERMANECE', NULL),
  ('Planejada',     '*', '*', 'PERMANECE', NULL),
  ('Reprogramável', '*', '*', 'PERMANECE', NULL),
  ('OS Admitida',   '*', '*', 'PERMANECE', NULL)
ON CONFLICT DO NOTHING;

-- Nota sobre CONTINUA - SERVIÇO NÃO CONCLUÍDO:
-- Parecia contraditória (aparece como Fechada e como Reprogramável),
-- mas o dado explica: ela descreve a PASSAGEM da equipe, não o destino
-- da OS. Ex.: OS 26102745078 em 30/08 — equipe ALEX PEREIRA marcou
-- CONTINUA e equipe GIOVANI marcou Executado, mesmo dia. Por isso o
-- desempate em classificar_dia faz execução vencer.


-- ------------------------------------------------------------
-- 3) Resolvedor — do mais específico para o mais genérico
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION resolver_desfecho(
  p_status TEXT, p_resultado TEXT, p_causa TEXT
) RETURNS TEXT AS $$
  SELECT desfecho
    FROM mapa_desfecho
   WHERE norm_txt(status_os) = norm_txt(p_status)
     AND (resultado       = '*' OR norm_txt(resultado)       = norm_txt(p_resultado))
     AND (causa_resultado = '*' OR norm_txt(causa_resultado) = norm_txt(p_causa))
   ORDER BY (resultado = '*')::int + (causa_resultado = '*')::int
   LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ------------------------------------------------------------
-- 4) Desfecho por OS
--    Chave é (numero_os, tss, dia) — numero_os NÃO é único:
--    uma OS pode carregar vários TSS (ex.: 26101750337 aparece
--    como REPOR SARJETA e REPOR GUIA no mesmo dia).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS os_desfecho (
  numero_os        TEXT NOT NULL,
  tss              TEXT NOT NULL DEFAULT '',
  dia              DATE NOT NULL,
  equipe           TEXT,
  lider            TEXT,
  status_os        TEXT,
  resultado        TEXT,
  causa_resultado  TEXT,
  desfecho         TEXT NOT NULL REFERENCES desfecho_tipo(codigo),
  origem           TEXT NOT NULL DEFAULT 'auto',   -- 'auto' | 'manual'
  observacao       TEXT,
  classificado_por UUID,
  classificado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (numero_os, tss, dia)
);

CREATE INDEX IF NOT EXISTS idx_os_desfecho_dia     ON os_desfecho(dia);
CREATE INDEX IF NOT EXISTS idx_os_desfecho_equipe  ON os_desfecho(equipe);
CREATE INDEX IF NOT EXISTS idx_os_desfecho_tipo    ON os_desfecho(desfecho);


-- ------------------------------------------------------------
-- 5) Motor: classifica um dia inteiro a partir do em_rua
--    Só grava o que o mapa souber responder e o que de fato
--    sai da carteira. Não sobrescreve classificação manual.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION classificar_dia(p_dia DATE)
RETURNS TABLE (gravadas INT, sem_mapa INT) AS $$
DECLARE
  v_grav INT;
  v_sem  INT;
BEGIN
  -- Uma OS pode ter VÁRIAS passagens no mesmo dia (equipes diferentes,
  -- ou a mesma equipe duas vezes). os_desfecho guarda o DESTINO da OS,
  -- então é uma linha só por (numero_os, tss, dia) — sem o DISTINCT ON
  -- abaixo o ON CONFLICT tentaria atualizar a mesma linha duas vezes
  -- no mesmo comando e o Postgres aborta.
  -- Desempate: execução vence; depois o que encerra a OS.
  INSERT INTO os_desfecho (
    numero_os, tss, dia, equipe, lider,
    status_os, resultado, causa_resultado, desfecho, origem
  )
  SELECT DISTINCT ON (r.numero_os, coalesce(r.tss, ''), r.dia)
         r.numero_os,
         coalesce(r.tss, ''),
         r.dia,
         r.equipe,
         r.lider,
         r.status_os,
         r.resultado,
         r.causa_resultado,
         resolver_desfecho(r.status_os, r.resultado, r.causa_resultado),
         'auto'
    FROM em_rua r
    JOIN desfecho_tipo t
      ON t.codigo = resolver_desfecho(r.status_os, r.resultado, r.causa_resultado)
   WHERE r.dia = p_dia
     AND r.numero_os IS NOT NULL
     AND t.sai_carteira            -- PERMANECE não vira baixa
   ORDER BY r.numero_os, coalesce(r.tss, ''), r.dia,
            (t.conta_producao) DESC,   -- executada ganha de tudo
            t.ordem                    -- depois, a ordem do tipo
  ON CONFLICT (numero_os, tss, dia) DO UPDATE
     SET desfecho        = EXCLUDED.desfecho,
         status_os       = EXCLUDED.status_os,
         resultado       = EXCLUDED.resultado,
         causa_resultado = EXCLUDED.causa_resultado,
         equipe          = EXCLUDED.equipe,
         lider           = EXCLUDED.lider,
         classificado_em = now()
   WHERE os_desfecho.origem = 'auto';   -- nunca pisa em decisão manual

  GET DIAGNOSTICS v_grav = ROW_COUNT;

  SELECT count(*)::int INTO v_sem
    FROM em_rua r
   WHERE r.dia = p_dia
     AND resolver_desfecho(r.status_os, r.resultado, r.causa_resultado) IS NULL;

  RETURN QUERY SELECT v_grav, v_sem;
END;
$$ LANGUAGE plpgsql;


-- Classifica TODO o histórico já importado, de uma vez.
-- Laço explícito de propósito: classificar_dia grava, e função
-- SQL com LATERAL sobre função volátil tem ordem de execução
-- imprevisível.
CREATE OR REPLACE FUNCTION classificar_tudo()
RETURNS TABLE (o_dia DATE, gravadas INT, sem_mapa INT) AS $$
DECLARE
  d RECORD;
  r RECORD;
BEGIN
  FOR d IN SELECT DISTINCT em_rua.dia AS dia FROM em_rua ORDER BY 1 LOOP
    SELECT * INTO r FROM classificar_dia(d.dia);
    o_dia    := d.dia;
    gravadas := r.gravadas;
    sem_mapa := r.sem_mapa;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 6) Fila: causas que o mapa ainda não conhece
--    É isso que você abre pra decidir — uma vez por causa nova,
--    não uma vez por OS.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_causas_nao_mapeadas AS
SELECT status_os,
       resultado,
       causa_resultado,
       count(*)   AS ocorrencias,
       min(dia)   AS visto_em,
       max(dia)   AS visto_ate
  FROM em_rua
 WHERE numero_os IS NOT NULL
   AND resolver_desfecho(status_os, resultado, causa_resultado) IS NULL
 GROUP BY 1, 2, 3
 ORDER BY ocorrencias DESC;


-- ------------------------------------------------------------
-- 7) Histórico de execução por equipe
--
--    IMPORTANTE: sai do em_rua, não do os_desfecho. Uma OS pode ter
--    duas equipes no mesmo dia (uma não conclui, outra executa).
--    os_desfecho guarda só a vencedora — se a estatística de equipe
--    saísse de lá, a passagem improdutiva da outra equipe sumiria.
--    Aqui cada PASSAGEM conta para quem a fez.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_passagem_equipe AS
SELECT r.dia,
       r.equipe,
       r.lider,
       r.numero_os,
       r.tss,
       r.status_os,
       r.resultado,
       r.causa_resultado,
       resolver_desfecho(r.status_os, r.resultado, r.causa_resultado) AS desfecho
  FROM em_rua r
 WHERE r.numero_os IS NOT NULL;

CREATE OR REPLACE VIEW v_producao_equipe AS
SELECT p.dia,
       p.equipe,
       p.lider,
       count(*) FILTER (WHERE t.conta_producao)                     AS executadas,
       count(*) FILTER (WHERE NOT t.conta_producao AND t.sai_carteira) AS sem_execucao,
       count(*) FILTER (WHERE NOT t.sai_carteira)                   AS em_aberto,
       count(*)                                                     AS passagens,
       round(100.0 * count(*) FILTER (WHERE t.conta_producao)
             / nullif(count(*), 0), 1)                              AS pct_producao
  FROM v_passagem_equipe p
  JOIN desfecho_tipo t ON t.codigo = p.desfecho
 GROUP BY 1, 2, 3;


-- Resumo por dia: é isso que a coluna "Exec." da carteira vira
CREATE OR REPLACE VIEW v_desfecho_dia AS
SELECT d.dia,
       d.desfecho,
       t.rotulo,
       t.conta_producao,
       count(*) AS qtd
  FROM os_desfecho d
  JOIN desfecho_tipo t ON t.codigo = d.desfecho
 GROUP BY 1, 2, 3, 4;


-- ------------------------------------------------------------
-- 8) RLS — leitura pública, escrita só logado
--    Crie seu usuário em Authentication > Users no painel.
-- ------------------------------------------------------------
ALTER TABLE desfecho_tipo ENABLE ROW LEVEL SECURITY;
ALTER TABLE mapa_desfecho ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_desfecho   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS desfecho_tipo_read ON desfecho_tipo;
CREATE POLICY desfecho_tipo_read ON desfecho_tipo FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS mapa_desfecho_read ON mapa_desfecho;
CREATE POLICY mapa_desfecho_read ON mapa_desfecho FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS mapa_desfecho_write ON mapa_desfecho;
CREATE POLICY mapa_desfecho_write ON mapa_desfecho FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS os_desfecho_read ON os_desfecho;
CREATE POLICY os_desfecho_read ON os_desfecho FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS os_desfecho_write ON os_desfecho;
CREATE POLICY os_desfecho_write ON os_desfecho FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- classificar_dia/classificar_tudo rodam com os direitos do dono,
-- para o robô conseguir chamar sem estar logado.
ALTER FUNCTION classificar_dia(DATE)  SECURITY DEFINER;
ALTER FUNCTION classificar_tudo()     SECURITY DEFINER;


-- ============================================================
-- DIAGNÓSTICO — rode e me manda o resultado
-- ============================================================

-- A) Até onde vai o histórico do EM RUA?
--    Responde se dá pra reclassificar o passado sem trabalho manual.
SELECT min(dia) AS primeiro_dia,
       max(dia) AS ultimo_dia,
       count(DISTINCT dia) AS dias_importados,
       count(*) AS linhas
  FROM em_rua;

-- B) Classifica todo o histórico de uma vez
-- SELECT * FROM classificar_tudo();

-- C) O que sobrou pra você decidir
-- SELECT * FROM v_causas_nao_mapeadas;

-- D) Quanto do que hoje conta como "Exec." não era execução
-- SELECT rotulo, sum(qtd) AS total
--   FROM v_desfecho_dia GROUP BY 1 ORDER BY 2 DESC;

-- E) OS com mais de uma passagem no mesmo dia (equipes diferentes na
--    mesma OS). Não é erro — é revisita/handoff. Serve pra conferir
--    que o desempate escolheu certo.
-- SELECT dia, numero_os, tss, count(*) AS passagens,
--        array_agg(equipe ORDER BY equipe) AS equipes,
--        array_agg(resultado ORDER BY equipe) AS resultados
--   FROM em_rua WHERE numero_os IS NOT NULL
--  GROUP BY 1,2,3 HAVING count(*) > 1
--  ORDER BY passagens DESC, dia DESC;

-- F) Produção por equipe no período todo
-- SELECT equipe, sum(executadas) AS exec, sum(sem_execucao) AS sem_exec,
--        sum(passagens) AS passagens,
--        round(100.0*sum(executadas)/nullif(sum(passagens),0),1) AS pct
--   FROM v_producao_equipe GROUP BY 1 ORDER BY exec DESC;
