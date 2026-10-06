-- ============================================================
-- CONFERIR O RELATÓRIO ANTES DE DEIXAR ELE ENTRAR
--
-- Rode no SQL Editor do Supabase, depois de sql/os_entrada_limpeza.sql.
--
-- O QUE ACONTECEU EM 06/10/2026
-- O robô sobe o pendente de hora em hora. Todas as subidas daquele dia
-- trouxeram entre 6 e 89 serviços novos. A das 19:02 trouxe 877 — e 81
-- delas com a TSS certa na FAMÍLIA ERRADA, mais 573 com uma TSS que
-- nunca apareceu nas 47 mil linhas da foto diária.
--
-- O nome entrega: veio "RECOMPOR SINALIZAÇÃO HORIZ RETRABALHO" na
-- família REATIV/RELIG/RESTAB. A TSS que existe de verdade chama-se
-- "RECOMPOR SINALIZAÇÃO VIARIA HORIZONTAL" e é de OUTROS SERVIÇOS DE
-- REPOSIÇÃO. Não é a família fora do lugar: o nome do serviço veio
-- embaralhado junto. Tem cara de coluna deslocada no arquivo.
--
-- A IDEIA
-- A família de uma TSS é estável. "REATIVAR LIGAÇÃO DE ÁGUA S/V" é
-- REATIV/RELIG/RESTAB nas 721 vezes em que apareceu. Quando um
-- relatório diz o contrário em dezenas de linhas de uma vez, não é o
-- negócio que mudou: é o arquivo que veio torto.
--
-- Então guardamos qual é a família de cada TSS e usamos isso como
-- régua. Quem decide não é regra escrita por mim: é o histórico.
-- ============================================================


-- ---------- 1. Apagar a subida estragada ----------
-- As OS que forem reais voltam sozinhas na próxima subida: a
-- os_entrada só grava par (OS, TSS) que ainda não viu, então apagar
-- aqui não perde nada — só remove o que nunca existiu.
DELETE FROM os_entrada
 WHERE registrado_em >= '2026-10-06 19:00'
   AND registrado_em <  '2026-10-06 19:30';


-- ---------- 2. A régua: qual é a família de cada TSS ----------
CREATE TABLE IF NOT EXISTS tss_familia (
  tss        TEXT PRIMARY KEY,
  familia    TEXT NOT NULL,
  vezes      INT  NOT NULL,
  -- `firme` separa a TSS que aparece todo dia da que apareceu duas
  -- vezes na vida. Só a firme serve de régua: reprovar um relatório
  -- por causa de uma TSS vista duas vezes seria dar poder demais ao
  -- acaso.
  firme      BOOLEAN NOT NULL,
  atualizado TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION atualizar_tss_familia() RETURNS INT AS $$
DECLARE n INT;
BEGIN
  WITH cont AS (
    SELECT trim(tss) AS tss, trim(familia) AS familia, count(*) AS vezes
      FROM pendente_diario_os
     WHERE tss IS NOT NULL AND familia IS NOT NULL
       AND trim(tss) <> '' AND trim(familia) <> ''
     GROUP BY 1, 2
  ), melhor AS (
    SELECT DISTINCT ON (tss) tss, familia, vezes
      FROM cont ORDER BY tss, vezes DESC
  )
  INSERT INTO tss_familia (tss, familia, vezes, firme, atualizado)
  SELECT tss, familia, vezes, vezes >= 20, now() FROM melhor
  ON CONFLICT (tss) DO UPDATE
    SET familia=EXCLUDED.familia, vezes=EXCLUDED.vezes,
        firme=EXCLUDED.firme, atualizado=now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT atualizar_tss_familia();   -- enche a régua agora

ALTER TABLE tss_familia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tss_familia_read ON tss_familia;
CREATE POLICY tss_familia_read ON tss_familia FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON tss_familia TO anon, authenticated;


-- ---------- 3. O veredito ----------
-- Recebe o relatório inteiro (o mesmo array que o robô ia subir) e
-- devolve o diagnóstico SEM GRAVAR NADA. Quem chama decide o que
-- fazer; o robô recusa o arquivo e avisa.
--
-- OS TRÊS SINAIS, e os números saíram de medir as 84 subidas que já
-- existiam. A regra abaixo reprova a de 19:02 e nenhuma das outras 83:
--
--   discordante — TSS firme em família diferente da do histórico.
--                 5 linhas E 5% das firmes. Na subida ruim: 81.
--                 Em todas as outras 83 subidas: zero.
--   erro        — a mensagem de erro do GEOCALL no lugar da TSS.
--                 5 linhas E 5%.
--   desconhecida— TSS que o histórico nunca viu. 50 linhas E 30%.
--                 O limite é alto porque serviço novo existe: o
--                 backfill de 02/10 trouxe 133 e está certo.
CREATE OR REPLACE FUNCTION conferir_lote(linhas JSONB)
RETURNS JSONB AS $$
DECLARE
  tot INT; erro INT; firmes INT; disc INT; desc_ INT;
  mau BOOLEAN; motivo TEXT := '';
BEGIN
  WITH l AS (
    SELECT trim(x->>'TSS') AS tss, trim(x->>'Família') AS familia
      FROM jsonb_array_elements(linhas) x
  ), j AS (
    SELECT l.*, t.familia AS familia_ref, t.firme
      FROM l LEFT JOIN tss_familia t ON t.tss = l.tss
  )
  SELECT count(*),
         count(*) FILTER (WHERE tss ILIKE '%exception%' OR tss ILIKE '%nel campo%'),
         count(*) FILTER (WHERE firme),
         count(*) FILTER (WHERE firme AND familia_ref IS DISTINCT FROM familia),
         count(*) FILTER (WHERE familia_ref IS NULL)
    INTO tot, erro, firmes, disc, desc_
    FROM j;

  IF tot = 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'relatório vazio', 'total', 0);
  END IF;

  IF disc >= 5 AND firmes > 0 AND disc::numeric/firmes >= 0.05 THEN
    mau := true; motivo := disc || ' serviços com a família trocada';
  ELSIF erro >= 5 AND erro::numeric/tot >= 0.05 THEN
    mau := true; motivo := erro || ' linhas com mensagem de erro no lugar do serviço';
  ELSIF desc_ >= 50 AND desc_::numeric/tot >= 0.30 THEN
    mau := true; motivo := desc_ || ' serviços que nunca apareceram antes (' ||
                           round(100.0*desc_/tot) || '% do arquivo)';
  ELSE
    mau := false;
  END IF;

  RETURN jsonb_build_object(
    'ok', NOT mau, 'motivo', motivo, 'total', tot,
    'discordantes', disc, 'firmes', firmes,
    'erro_sistema', erro, 'desconhecidas', desc_);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION conferir_lote(JSONB) TO anon, authenticated;


-- ---------- 4. O diário de bordo ----------
-- Registra o veredito de cada subida, inclusive das que passam. Serve
-- para duas coisas: o site mostrar uma tarja quando a última subida foi
-- recusada, e você conseguir olhar depois se o GEOCALL melhorou ou
-- piorou, em vez de depender de lembrar.
CREATE TABLE IF NOT EXISTS pendente_auditoria (
  id         BIGSERIAL PRIMARY KEY,
  momento    TIMESTAMPTZ NOT NULL DEFAULT now(),
  total      INT,
  veredito   TEXT NOT NULL,     -- 'ok' | 'recusado'
  motivo     TEXT,
  detalhe    JSONB
);
CREATE INDEX IF NOT EXISTS pendente_auditoria_momento ON pendente_auditoria (momento DESC);

ALTER TABLE pendente_auditoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auditoria_read ON pendente_auditoria;
CREATE POLICY auditoria_read ON pendente_auditoria FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON pendente_auditoria TO anon, authenticated;

-- Quem escreve é a função, não o cliente: assim ninguém forja um
-- "passou" pelo console do navegador.
CREATE OR REPLACE FUNCTION registrar_auditoria(v JSONB) RETURNS VOID AS $$
  INSERT INTO pendente_auditoria (total, veredito, motivo, detalhe)
  VALUES ((v->>'total')::INT,
          CASE WHEN (v->>'ok')::BOOLEAN THEN 'ok' ELSE 'recusado' END,
          nullif(v->>'motivo',''), v);
$$ LANGUAGE sql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION registrar_auditoria(JSONB) TO anon, authenticated;


-- ---------- Conferência ----------
-- A régua ficou com quantas TSS:
--   SELECT count(*) AS tss, count(*) FILTER (WHERE firme) AS firmes FROM tss_familia;
--
-- Últimas subidas conferidas:
--   SELECT momento, total, veredito, motivo FROM pendente_auditoria
--    ORDER BY momento DESC LIMIT 20;
--
-- A régua envelhece junto com a operação. Rode de vez em quando, ou
-- uma vez por mês:
--   SELECT atualizar_tss_familia();
