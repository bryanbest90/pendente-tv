-- ============================================================
-- ZERAR A ANÁLISE — apaga pedidos, fotos e vereditos, e volta os
-- IDs para 1.
--
-- Roda no SQL Editor do Supabase.
--
-- ISTO JOGA FORA OS VEREDITOS, e veredito é o que vai treinar a IA
-- mais adiante. Enquanto estamos testando a coleta não há o que
-- perder; depois que começar o julgamento de verdade, ZERAR DEIXA
-- DE SER UMA OPÇÃO. O LEIA-ME do robô diz o mesmo.
--
-- AS FOTOS NO STORAGE NÃO SAEM DAQUI. O banco guarda o caminho; os
-- arquivos ficam no bucket `analise-fotos`, e o Supabase não deixa
-- apagar linha de `storage.objects` por SQL — tentar devolve
-- "Direct deletion from storage tables is not allowed" (conferido
-- em 25/11/2026). Os arquivos se apagam na tela do Storage.
--
-- A ORDEM IMPORTA POUCO, mas a dos dois lados importa:
--   apagar só o banco  → ficam arquivos órfãos ocupando espaço
--   apagar só o bucket → ficam linhas apontando para foto que não existe,
--                        e a tela mostra quadro quebrado
-- Então faça os dois na mesma sentada.
-- ============================================================

-- ---------- 0. O CASCADE DERRUBA SÓ ESTAS TRÊS? ----------
-- O TRUNCATE ... CASCADE apaga também QUALQUER tabela que aponte
-- para as nomeadas — e em silêncio. Hoje, pelo repositório, só há
-- analise_foto → analise_pedido e analise_veredito → analise_foto.
-- Mas arquivo no repositório não é prova do que está no banco: foi
-- essa confusão que em 23/11/2026 fez a Produção pular de 236 para
-- 514. Quem prova é esta consulta, e ela vem ANTES do TRUNCATE.
--
-- Tem de devolver EXATAMENTE DUAS linhas:
--   analise_foto     → analise_pedido
--   analise_veredito → analise_foto
-- Aparecendo uma terceira, PARE: há outra tabela que seria apagada
-- junto, e ela não está nomeada aqui.
--
-- SELECT c.conrelid::regclass  AS tabela_que_aponta,
--        c.confrelid::regclass AS para
--   FROM pg_constraint c
--  WHERE c.contype = 'f'
--    AND c.confrelid IN ('analise_pedido'::regclass,
--                        'analise_foto'::regclass,
--                        'analise_veredito'::regclass)
--  ORDER BY 1;


-- ---------- 1. CONFIRA ANTES ----------
-- O que existe hoje. Guarde o resultado: é com ele que se compara.
--
-- SELECT (SELECT count(*) FROM analise_pedido)  AS pedidos,
--        (SELECT count(*) FROM analise_foto)    AS fotos,
--        (SELECT count(*) FROM analise_veredito) AS vereditos,
--        (SELECT count(*) FROM storage.objects
--          WHERE bucket_id = 'analise-fotos')   AS arquivos_no_bucket;


-- ---------- 2. ZERA ----------
-- O TRUNCATE faz numa sentença o que DELETE + setval fazia em
-- quatro: apaga as três tabelas e devolve as sequências ao começo.
-- O CASCADE do TRUNCATE é obrigatório porque analise_foto aponta
-- para analise_pedido — não é ele que escolhe apagar a mais, as três
-- tabelas já estão todas nomeadas aqui.
TRUNCATE analise_veredito, analise_foto, analise_pedido
  RESTART IDENTITY CASCADE;


-- ---------- 3. CONFIRA DEPOIS ----------
-- As três contagens têm de dar 0, e o próximo pedido feito no site
-- tem de aparecer como id 1.
--
-- SELECT (SELECT count(*) FROM analise_pedido)  AS pedidos,
--        (SELECT count(*) FROM analise_foto)    AS fotos,
--        (SELECT count(*) FROM analise_veredito) AS vereditos,
--        (SELECT count(*) FROM storage.objects
--          WHERE bucket_id = 'analise-fotos')   AS arquivos_no_bucket;
--
-- Sobrando arquivo no bucket, são órfãos da limpeza anterior:
-- apague na tela do Storage, pasta por pasta.


-- ---------- NÃO TEM DESFAZER ----------
-- Esta é a diferença entre este arquivo e os outros do projeto. Os
-- que mexem em view têm um bloco de DESFAZER porque a view se
-- recria; linha apagada não volta. Se o dia já tinha sido julgado,
-- o julgamento morreu com ele.
