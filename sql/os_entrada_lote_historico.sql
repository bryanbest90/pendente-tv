-- ============================================================
-- O DESPEJO DE 18 MIL OS ANTIGAS — limpar e impedir que volte
--
-- Rode no SQL Editor do Supabase, depois de sql/pendente_conferencia.sql.
--
-- O QUE ACONTECEU
-- Em 07/10/2026, à 00:04, alguma coisa carregou 17.928 OS dentro do
-- `pendente_os` de uma vez. A carteira tem 969. O gatilho fez o que
-- devia: registrou a Data Inserção de cada uma delas na os_entrada.
--
-- Só que essas OS não entraram naquele dia. A Data Inserção delas é
-- antiga: 13.738 de maio/2026, 3.815 de junho, e NENHUMA de 05/10 em
-- diante. O resultado no gráfico é um pico de 6.412 entradas em
-- 19/05 e 6.399 em 20/05 — contra 50 a 250 de um dia normal. A escala
-- morre e o gráfico inteiro fica ilegível.
--
-- A série, que ia de 16/08 a hoje, passou a ir de abril/2024 a hoje.
--
-- É O MESMO ERRO DE ANTES, POR OUTRA PORTA. Quando a os_entrada foi
-- criada, o backfill datou os 981 pares da carteira inicial como se
-- tivessem entrado no primeiro dia, e eu marquei aquilo como
-- origem='inicial' para sair da conta. Aqui é a mesma coisa: um
-- acervo antigo visto pela primeira vez não é entrada do dia em que
-- foi visto.
-- ============================================================


-- ---------- 1. Veja antes de apagar ----------
-- SELECT date_trunc('month', data_insercao) AS mes, count(*)
--   FROM os_entrada
--  WHERE registrado_em >= '2026-10-07 00:00' AND registrado_em < '2026-10-07 00:10'
--  GROUP BY 1 ORDER BY 1;


-- ---------- 2. Apague o despejo ----------
-- Dá para apagar o lote inteiro sem medo: conferido, NENHUMA das
-- 17.928 linhas tem Data Inserção de 05/10 em diante. Não há entrada
-- de verdade misturada que fosse se perder.
--
-- E se houvesse: a os_entrada só grava par (OS, TSS) que ainda não
-- viu, então uma OS real que ainda esteja na carteira volta sozinha
-- na próxima subida do robô.
DELETE FROM os_entrada
 WHERE registrado_em >= '2026-10-07 00:00'
   AND registrado_em <  '2026-10-07 00:10';


-- ---------- 3. Impedir que volte ----------
-- A conferência que já existe olha família trocada e serviço nunca
-- visto. Ela não pegaria este caso: as OS eram reais e as famílias
-- estavam certas — o que estava errado era o TAMANHO do arquivo.
--
-- A carteira não dobra nem some de uma hora para a outra. Um relatório
-- com 18 mil linhas, quando a tabela tem 969, não é a carteira: é
-- outra coisa, e não deve substituí-la.
CREATE OR REPLACE FUNCTION conferir_lote(linhas JSONB)
RETURNS JSONB AS $$
DECLARE
  tot INT; erro INT; firmes INT; disc INT; desc_ INT; atual INT;
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

  SELECT count(*) INTO atual FROM pendente_os;

  -- O tamanho vem primeiro: é o sinal mais grosseiro e o mais barato.
  -- Só vale quando já existe carteira para comparar (100 linhas), senão
  -- a primeira importação de todas seria recusada por não ter com o
  -- que se comparar.
  IF atual >= 100 AND tot > atual * 3 THEN
    mau := true;
    motivo := tot || ' serviços num relatório, contra ' || atual || ' na carteira de agora';
  ELSIF atual >= 100 AND tot < atual / 3 THEN
    mau := true;
    motivo := 'só ' || tot || ' serviços, contra ' || atual || ' na carteira de agora';
  ELSIF disc >= 5 AND firmes > 0 AND disc::numeric/firmes >= 0.05 THEN
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
    'ok', NOT mau, 'motivo', motivo, 'total', tot, 'carteira_atual', atual,
    'discordantes', disc, 'firmes', firmes,
    'erro_sistema', erro, 'desconhecidas', desc_);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION conferir_lote(JSONB) TO anon, authenticated;


-- ---------- Conferência ----------
-- A série deve voltar a começar em agosto/2026:
--   SELECT min(dia), max(dia), count(DISTINCT dia) FROM v_entrada_serie;
--
-- E nenhum dia deve passar de ~400:
--   SELECT dia, sum(entradas) s FROM v_entrada_serie
--    GROUP BY 1 ORDER BY s DESC LIMIT 5;
--
-- O gráfico se corrige sozinho no próximo carregamento da tela.


-- ============================================================
-- VALE DESCOBRIR O QUE CARREGOU AQUILO
--
-- Nenhum dos robôs sobe 18 mil OS: o do pendente sobe a carteira
-- aberta, que é ~1.000, e os outros nem escrevem no pendente_os. A
-- subida saiu de fora da rotina — importação manual de um arquivo
-- grande pelo site, ou algum teste.
--
-- A trava acima impede o estrago, mas não responde quem fez. Se foi
-- importação manual sua, está explicado. Se não foi, vale olhar quem
-- mais tem pode_importar:
--   SELECT email, nome, pode_importar FROM perfis WHERE pode_importar;
-- ============================================================
