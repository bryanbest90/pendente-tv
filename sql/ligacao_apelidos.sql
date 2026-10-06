-- ============================================================
-- O NOME QUE A GENTE USA — apelido do GEOCALL para a rua
--
-- Rode no SQL Editor do Supabase, depois de sql/ligacao.sql.
--
-- O PROBLEMA
-- O cadastro da Sabesp nao conhece alguns nomes que a gente usa todo
-- dia. "ESTRADA ECOTURISTICA DE PARELHEIROS" nao existe na camada de
-- vias dela: o trecho mais proximo com nome e outro, e foi esse que o
-- voto por posicao colou no codlog. Resultado: a rua com mais servico
-- nosso nao era encontrada pelo nome que a gente escreve.
--
-- COMO ESTES NOMES FORAM DESCOBERTOS
-- Pelo NUMERO DA PORTA. Uma rua com OS no 6959, no 5350 e no 212 so
-- pode ser o codlog que tem ligacao nesses tres numeros. Cada numero
-- vale pelo inverso de quantos codlogs o tem: o 10 existe em quase
-- toda rua e nao decide nada, o 6959 existe em pouquissimas e decide
-- quase sozinho.
--
-- So entrou o que passou em dois testes ao mesmo tempo: o codlog
-- vencedor cobre pelo menos metade do peso dos nossos numeros, e tem
-- pelo menos 30% de vantagem sobre o segundo colocado. Preferi poucos
-- e certos: um apelido errado manda voce para a rua errada com cara de
-- certeza, que e pior do que nao achar.
--
-- O QUE NAO ESTA AQUI, A TELA RESOLVE SOZINHA. Quando o nome digitado
-- nao esta na lista, ela procura a rua na carteira, pega os numeros das
-- OS e faz essa mesma conta na hora.
-- ============================================================

ALTER TABLE ligacao ADD COLUMN IF NOT EXISTS rua_geocall       TEXT;
ALTER TABLE ligacao ADD COLUMN IF NOT EXISTS rua_geocall_busca TEXT;
CREATE INDEX IF NOT EXISTS ligacao_geocall ON ligacao (rua_geocall_busca, imovel);


-- ---------- os apelidos ----------
UPDATE ligacao SET rua_geocall='RUA DOMINGOS JORGE', rua_geocall_busca='DOMINGOS JORGE' WHERE codlog='0000051276';  -- 5 numeros, 100%
UPDATE ligacao SET rua_geocall='RUA EZEQUIEL LOPES CARDOSO', rua_geocall_busca='EZEQUIEL LOPES CARDOSO' WHERE codlog='0000155080';  -- 3 numeros, 100%
UPDATE ligacao SET rua_geocall='AVENIDA DE PINEDO', rua_geocall_busca='DE PINEDO' WHERE codlog='0000162477';  -- 4 numeros, 100%
UPDATE ligacao SET rua_geocall='AVENIDA DO RIO BONITO', rua_geocall_busca='DO RIO BONITO' WHERE codlog='0000171107';  -- 19 numeros, 90%
UPDATE ligacao SET rua_geocall='RUA TRASYBULO PINHEIRO DE ALBUQUERQUE', rua_geocall_busca='TRASYBULO PINHEIRO DE ALBUQUERQUE' WHERE codlog='0000191175';  -- 6 numeros, 100%
UPDATE ligacao SET rua_geocall='AVENIDA ANTONIO CARLOS BENJAMIN DOS SANTOS', rua_geocall_busca='ANTONIO CARLOS BENJAMIN DOS SANTOS' WHERE codlog='0000194913';  -- 36 numeros, 97%
UPDATE ligacao SET rua_geocall='AVENIDA MANUEL ALVES SOARES', rua_geocall_busca='MANUEL ALVES SOARES' WHERE codlog='0000205141';  -- 12 numeros, 93%
UPDATE ligacao SET rua_geocall='RUA ADELIA DA SILVA MENDES', rua_geocall_busca='ADELIA DA SILVA MENDES' WHERE codlog='0000219320';  -- 3 numeros, 100%
UPDATE ligacao SET rua_geocall='RUA GILBERTO FREYRE', rua_geocall_busca='GILBERTO FREYRE' WHERE codlog='0000251518';  -- 11 numeros, 100%
UPDATE ligacao SET rua_geocall='AVENIDA PROFESSOR HERMOGENES DE FREITAS LEITAO FILHO', rua_geocall_busca='PROFESSOR HERMOGENES DE FREITAS LEITAO FILHO' WHERE codlog='0000330957';  -- 16 numeros, 88%
UPDATE ligacao SET rua_geocall='ESTRADA DA BARRAGEM', rua_geocall_busca='DA BARRAGEM' WHERE codlog='0000379646';  -- 8 numeros, 100%
UPDATE ligacao SET rua_geocall='RUA ELIAS CASSIMIRO DOS SANTOS', rua_geocall_busca='ELIAS CASSIMIRO DOS SANTOS' WHERE codlog='0000380830';  -- 8 numeros, 100%
UPDATE ligacao SET rua_geocall='RUA ERNESTO JOAO MARCELINO', rua_geocall_busca='ERNESTO JOAO MARCELINO' WHERE codlog='0000382671';  -- 2 numeros, 100%
UPDATE ligacao SET rua_geocall='ESTRADA DO PORTO', rua_geocall_busca='DO PORTO' WHERE codlog='0000383082';  -- 7 numeros, 91%
UPDATE ligacao SET rua_geocall='ESTRADA DO SCHMIDT', rua_geocall_busca='DO SCHMIDT' WHERE codlog='0000384631';  -- 5 numeros, 100%
UPDATE ligacao SET rua_geocall='RUA MARQUES DE LOURICAL', rua_geocall_busca='MARQUES DE LOURICAL' WHERE codlog='0000386510';  -- 7 numeros, 100%
UPDATE ligacao SET rua_geocall='RUA VISCONDE DE MONTALEGRE', rua_geocall_busca='VISCONDE DE MONTALEGRE' WHERE codlog='0000386545';  -- 9 numeros, 79%
UPDATE ligacao SET rua_geocall='ESTRADA ECOTURISTICA DE PARELHEIROS', rua_geocall_busca='ECOTURISTICA DE PARELHEIROS' WHERE codlog='0000398748';  -- 28 numeros, 82%
UPDATE ligacao SET rua_geocall='AVENIDA JACEGUAVA', rua_geocall_busca='JACEGUAVA' WHERE codlog='0000418080';  -- 7 numeros, 98%
UPDATE ligacao SET rua_geocall='AVENIDA ARISTOTELES COSTA PINTO', rua_geocall_busca='ARISTOTELES COSTA PINTO' WHERE codlog='0000419478';  -- 8 numeros, 100%
UPDATE ligacao SET rua_geocall='RUA DOS EPITALAMIOS', rua_geocall_busca='DOS EPITALAMIOS' WHERE codlog='0000623490';  -- 5 numeros, 100%
UPDATE ligacao SET rua_geocall='RUA ACACCIO FONTOURA', rua_geocall_busca='ACACCIO FONTOURA' WHERE codlog='0000763063';  -- 14 numeros, 100%
UPDATE ligacao SET rua_geocall='ESTRADA DA MINA DE OURO', rua_geocall_busca='DA MINA DE OURO' WHERE codlog='0001510096';  -- 2 numeros, 100%
UPDATE ligacao SET rua_geocall='RUA CORONEL LUIZ TENORIO DE BRITO', rua_geocall_busca='CORONEL LUIZ TENORIO DE BRITO' WHERE codlog='0299000010';  -- 5 numeros, 100%
UPDATE ligacao SET rua_geocall='ALAMEDA DOS BANDEIRANTES', rua_geocall_busca='DOS BANDEIRANTES' WHERE codlog='0299000427';  -- 8 numeros, 70%

-- ---------- a lista de ruas passa a mostrar os dois nomes ----------
-- DROP antes do CREATE, e nao CREATE OR REPLACE: o replace so aceita
-- colunas novas NO FIM da view, e as duas novas entram no meio, ao lado
-- das outras de nome. Com o replace o Postgres recusa:
--   cannot change name of view column "ligacoes" to "rua_geocall"
-- Derrubar e recriar nao custa nada aqui: view nao guarda dado, e
-- ninguem depende dela alem da tela.
DROP VIEW IF EXISTS v_ligacao_rua;

CREATE VIEW v_ligacao_rua AS
SELECT rua, rua_busca, rua_geocall, rua_geocall_busca, count(*)::int AS ligacoes,
       min(imovel) AS menor_numero, max(imovel) AS maior_numero
  FROM ligacao
 WHERE rua IS NOT NULL AND rua <> ''
 GROUP BY 1, 2, 3, 4;

ALTER VIEW v_ligacao_rua SET (security_invoker = on);
REVOKE ALL ON v_ligacao_rua FROM anon;
GRANT SELECT ON v_ligacao_rua TO authenticated;

-- ---------- Conferencia ----------
-- A rua do seu exemplo:
--   SELECT DISTINCT rua, rua_geocall FROM ligacao WHERE codlog = '0000398748';
--   -- cadastro: AVENIDA SADAMU INOUE | nosso: ESTRADA ECOTURISTICA DE PARELHEIROS
--
-- Quantas ruas ganharam apelido:
--   SELECT count(DISTINCT codlog) FROM ligacao WHERE rua_geocall IS NOT NULL;
