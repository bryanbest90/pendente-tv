-- ============================================================
-- OBSERVAÇÃO POR SERVIÇO
--
-- O problema que isto resolve não é registrar informação — é que
-- a informação hoje mora na cabeça de uma pessoa. "Esse PV não
-- nivela porque precisa de laje" é sabido por quem cuida daquela
-- equipe, e some junto com ela quando ela tira férias.
--
-- Chave = (numero_os, tss), a mesma unidade real do sistema: uma
-- OS pode ter serviços diferentes, com impedimentos diferentes.
--
-- ATENÇÃO a um efeito disso, que é conhecido e foi aceito: quando
-- a OS migra de TSS — e ela migra — a nota deixa de casar pela
-- chave. Para não perder a informação justamente quando alguma
-- coisa mudou, o site busca as notas por numero_os e mostra as de
-- outra TSS assim, com a origem dita na tela:
--
--     registrada em NIVELAR POÇO DE INSPEÇÃO/VISITA
--
-- Ou seja: a nota nunca some, ela só muda de destaque.
-- ============================================================

CREATE TABLE IF NOT EXISTS os_nota (
  numero_os     TEXT NOT NULL,
  tss           TEXT NOT NULL,
  nota          TEXT NOT NULL CHECK (length(btrim(nota)) > 0),
  autor_id      UUID DEFAULT auth.uid() REFERENCES auth.users(id),   -- nulo quando escrita sem login
  autor_nome    TEXT,
  autor_email   TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (numero_os, tss)
);

-- A busca do modal é sempre por numero_os (ver a observação acima
-- sobre migração de TSS).
CREATE INDEX IF NOT EXISTS os_nota_os ON os_nota (numero_os);


-- ------------------------------------------------------------
-- Quem lê e quem escreve
--
-- Lê: todo mundo, inclusive sem login — a nota só vale se ela
--     alcança quem não sabia que ela existia.
-- Escreve: todo mundo também, e sem login. Exigir login é o atrito
--     que faz ninguém escrever, e quem sabe do impedimento está no
--     campo e não tem usuário no sistema. Quando houver login, a
--     nota sai assinada; sem login, sai sem assinatura.
--
--     Isso é uma escolha consciente: qualquer um pode corrigir ou
--     apagar a nota de outro. Se um dia isso der problema de
--     verdade, o conserto é fechar a escrita ou guardar histórico
--     — mas não vale pagar essa complexidade antes.
-- ------------------------------------------------------------
ALTER TABLE os_nota ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS os_nota_read ON os_nota;
CREATE POLICY os_nota_read ON os_nota
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS os_nota_write ON os_nota;
CREATE POLICY os_nota_write ON os_nota
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON os_nota TO anon, authenticated;


-- ------------------------------------------------------------
-- Conferência
--
--   SELECT numero_os, tss, left(nota,60) AS nota, autor_nome,
--          atualizado_em
--     FROM os_nota ORDER BY atualizado_em DESC LIMIT 20;
--
-- Notas que ficaram órfãs porque a OS mudou de TSS — elas ainda
-- aparecem no site, com a origem dita, mas vale olhar de vez em
-- quando se alguma já não faz sentido:
--
--   SELECT n.numero_os, n.tss AS tss_da_nota, d.tss AS tss_de_hoje
--     FROM os_nota n
--     JOIN pendente_diario_os d ON d.numero_os = n.numero_os
--    WHERE d.tss <> n.tss
--      AND d.dia = (SELECT max(dia) FROM pendente_diario_os);
-- ------------------------------------------------------------
