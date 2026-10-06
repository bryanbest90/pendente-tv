-- ============================================================
-- TSS QUE NÃO É TSS — limpar e impedir que volte
--
-- Rode no SQL Editor do Supabase, depois de sql/os_entrada.sql.
--
-- O QUE ACONTECEU
-- O relatório do GEOCALL às vezes exporta, no lugar do nome do
-- serviço, uma mensagem de erro do próprio sistema dele:
--
--   IndexOutOfBoundsException nel campo AODLID_TODL
--
-- Em italiano, que é a língua do fornecedor do GEOCALL. Não é um
-- serviço raro que ninguém conhecia: é o GEOCALL falhando ao montar
-- aquela linha do relatório e gravando o erro no campo.
--
-- O TAMANHO DO ESTRAGO
-- Medido em 06/10/2026: 1.005 das 12.292 linhas da os_entrada, 8,2%.
-- E o pior não é o volume, é a forma. Em 89% delas a MESMA OS aparece
-- NO MESMO DIA também com a TSS de verdade. Como a unidade do negócio
-- é o par (OS, TSS), o erro cria um par novo — e portanto uma ENTRADA
-- NOVA, que nunca existiu. A coluna Entradas, os totais por família e
-- as colunas do gráfico vinham todos inflados por isso.
--
-- As outras 110 são OS cuja linha boa se perdeu naquela exportação:
-- só ficou o erro. Essas somem da contagem, e é o certo — contar uma
-- entrada cujo serviço ninguém sabe qual é não ajuda ninguém.
--
-- POR QUE NÃO DÁ PARA "CONSERTAR" A LINHA
-- A mensagem não diz qual serviço era. Não há de onde tirar a TSS
-- certa: ou a OS tem outra linha boa no mesmo dia (e aí esta aqui é
-- duplicata mesmo), ou o dado se perdeu na origem.
-- ============================================================


-- ---------- 1. Veja antes de apagar ----------
-- SELECT data_insercao, count(*)
--   FROM os_entrada
--  WHERE tss ILIKE '%Exception%' OR tss ILIKE '%nel campo%'
--  GROUP BY 1 ORDER BY 1 DESC;


-- ---------- 2. Apague ----------
DELETE FROM os_entrada
 WHERE tss ILIKE '%Exception%'
    OR tss ILIKE '%nel campo%';


-- ---------- 3. Impeça que volte ----------
-- O gatilho passa a recusar a linha em vez de gravá-la. Vale para a
-- subida do robô e para a importação manual do xlsx, que é o mesmo
-- caminho. O site já barra do lado dele; isto fecha o outro lado.
CREATE OR REPLACE FUNCTION os_entrada_registrar() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO os_entrada (numero_os, tss, data_insercao, familia, atc, unidade, endereco, bairro, origem)
  SELECT e.numero_os, e.tss, e.data_insercao, e.familia, e.atc, e.unidade, e.endereco, e.bairro, 'pendente'
    FROM os_entrada_do_jsonb(NEW.dados) e
   WHERE e.numero_os IS NOT NULL AND e.tss IS NOT NULL AND e.data_insercao IS NOT NULL
     -- mensagem de erro do GEOCALL no lugar do nome do serviço
     AND e.tss NOT ILIKE '%Exception%'
     AND e.tss NOT ILIKE '%nel campo%'
  ON CONFLICT (numero_os, tss, data_insercao) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ---------- 4. Confira ----------
-- Tem que dar zero:
--   SELECT count(*) FROM os_entrada
--    WHERE tss ILIKE '%Exception%' OR tss ILIKE '%nel campo%';
--
-- E o total deve ter caído ~8%:
--   SELECT count(*) FROM os_entrada;
--
-- O gráfico e a coluna Entradas se corrigem sozinhos no próximo
-- carregamento da tela — os dois leem desta tabela.


-- ============================================================
-- O QUE ISTO NÃO RESOLVE
--
-- O erro continua acontecendo no GEOCALL. A limpeza tira o que já
-- entrou e o gatilho impede novas, mas o relatório segue vindo com
-- linhas quebradas — e cada uma delas é uma OS cujo serviço o
-- pendente não registrou naquele dia.
--
-- Vale olhar na origem: se o robô puxar o mesmo relatório de novo,
-- algumas dessas linhas costumam vir certas na segunda vez. Para
-- medir quanto ainda está vindo quebrado, depois de cada subida:
--
--   SELECT count(*) FROM pendente_os
--    WHERE dados->>'TSS' ILIKE '%Exception%';
--
-- No pendente de 06/10/2026 esse número estava em zero — ou seja, a
-- falha é intermitente, não constante.
-- ============================================================
