#!/usr/bin/env python3
# ============================================================
# OS citadas nos e-mails de ouvidoria -> etiqueta OUVIDORIA
#
#   python3 scripts/ouvidoria.py 2636939729 26103363821 ...
#   python3 scripts/ouvidoria.py --seco 2636939729 ...   (mostra, não grava)
#
# Quem chama é a tarefa automática que lê os e-mails do Adalberto
# e da Sabrina. Para cada OS: se ela está no pendente agora, marca
# OUVIDORIA em cada serviço (OS+TSS) dela. Se não está, não faz
# nada. Texto, autor e agendamento de uma nota que já existe ficam
# como estão; só a etiqueta é acrescentada.
# Só usa a biblioteca padrão do Python.
# ============================================================
import json, re, sys, urllib.request, urllib.parse
from datetime import datetime, timezone

URL = "https://iggnfikqbdgrvfshxhul.supabase.co"
KEY = ("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnZ25maWtxYmRncnZmc2h4aHVsIiwi"
       "cm9sZSI6ImFub24iLCJpYXQiOjE3ODU3MDgwNTIsImV4cCI6MjEwMTI4NDA1Mn0.Wnpzw5NK9b55oLwBiuFKcmx5rgG5F39Ka-fdho2aH9E")
H = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"}
SECO = "--seco" in sys.argv
AGORA = datetime.now(timezone.utc).isoformat()


def api(metodo, caminho, corpo=None, extra=None):
    if SECO and metodo != "GET":
        return None
    req = urllib.request.Request(URL + "/rest/v1/" + caminho, method=metodo, headers={**H, **(extra or {})},
                                 data=None if corpo is None else json.dumps(corpo).encode())
    with urllib.request.urlopen(req, timeout=60) as r:
        t = r.read().decode()
        return json.loads(t) if t.strip() else None


def todos(caminho, ps=1000):
    out, de = [], 0
    while True:
        lote = api("GET", caminho, extra={"Range": f"{de}-{de + ps - 1}"}) or []
        out += lote
        if len(lote) < ps:
            return out
        de += ps


dig = lambda v: re.sub(r"\D", "", str(v if v is not None else "")).lstrip("0")
pedidas = {d for d in (dig(a) for a in sys.argv[1:] if a != "--seco") if re.fullmatch(r"2\d{9,10}", d)}

pend = {}
for x in todos("pendente_os?select=dados&order=id.asc"):
    d = x["dados"]
    pend.setdefault(dig(d.get("Número OS")), []).append(d)

marcadas, ja, fora = [], [], sorted(pedidas - set(pend))
for os_ in sorted(pedidas & set(pend)):
    for l in {str(l.get("TSS", "")).strip(): l for l in pend[os_]}.values():
        num, tss = str(l.get("Número OS", "")).strip(), str(l.get("TSS", "")).strip()
        filtro = f"numero_os=eq.{urllib.parse.quote(num)}&tss=eq.{urllib.parse.quote(tss)}"
        atual = (api("GET", "os_nota?select=tags&" + filtro) or [None])[0]
        if atual and "OUVIDORIA" in (atual.get("tags") or []):
            ja.append(f"{num} {tss}")
            continue
        if atual:
            api("PATCH", "os_nota?" + filtro, {"tags": (atual.get("tags") or []) + ["OUVIDORIA"], "atualizado_em": AGORA},
                {"Prefer": "return=minimal"})
        else:
            end = ", ".join(x for x in (str(l.get("Endereço", "")).strip(), str(l.get("Número", "")).strip()) if x)
            api("POST", "os_nota", [{"numero_os": num, "tss": tss, "nota": None, "tags": ["OUVIDORIA"],
                                     "agendado_para": None, "autor_nome": "Ouvidoria (e-mail)", "autor_email": None,
                                     "endereco": end or None, "bairro": str(l.get("Bairro", "")).strip() or None,
                                     "municipio": str(l.get("Município", "")).strip() or None,
                                     "familia": str(l.get("Família", "")).strip() or None, "atualizado_em": AGORA}],
                {"Prefer": "return=minimal"})
        marcadas.append(f"{num} {tss}")

print(json.dumps({"seco": SECO, "os_do_email": len(pedidas), "marcadas_agora": marcadas,
                  "ja_tinham": ja, "fora_do_pendente": fora}, ensure_ascii=False, indent=1))