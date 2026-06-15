import { useState, useCallback, useRef, useMemo } from "react";
import * as XLSX from "xlsx";

const EXCLUDED_FAMILIES = [
  "VISTORIA","CORTE SUPRESSÃO ADM","FISCALIZAÇÃO",
  "SERV COMPLEMENTAR","ABASTECIMENTO","DESOBSTRUÇÃO",
];

const C = {
  bg: "#0a0f1a", card: "#111827", cardAlt: "#0d1321",
  border: "#1e293b", accent: "#3b82f6", accentBg: "rgba(59,130,246,0.08)",
  green: "#10b981", greenBg: "rgba(16,185,129,0.08)", greenBorder: "rgba(16,185,129,0.2)",
  red: "#ef4444", redBg: "rgba(239,68,68,0.08)", redBorder: "rgba(239,68,68,0.2)",
  text: "#f1f5f9", textMuted: "#94a3b8", textDim: "#64748b",
  headerBg: "#0f172a", rowHover: "rgba(59,130,246,0.04)",
};

function parseFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(ws, { defval: "" }));
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function classifyTempo(val) {
  const s = String(val).trim();
  if (!s || s === " ") return null;
  return s.startsWith("-") ? "fora" : "prazo";
}

function Pill({ value, color, bg, border }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: 44, padding: "4px 12px", borderRadius: 8, fontSize: 15,
      fontWeight: 700, fontVariantNumeric: "tabular-nums",
      color, background: bg, border: `1px solid ${border}`,
    }}>{value}</span>
  );
}

function BarCell({ prazo, fora, total }) {
  if (total === 0) return null;
  const pP = (prazo / total) * 100;
  const pF = (fora / total) * 100;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
      <div style={{ flex: 1, height: 10, borderRadius: 5, background: C.border, overflow: "hidden", display: "flex" }}>
        <div style={{ width: `${pP}%`, background: `linear-gradient(90deg, ${C.green}, #34d399)`, borderRadius: "5px 0 0 5px", transition: "width 0.6s ease" }} />
        <div style={{ width: `${pF}%`, background: `linear-gradient(90deg, #f87171, ${C.red})`, borderRadius: "0 5px 5px 0", transition: "width 0.6s ease" }} />
      </div>
      <span style={{ fontSize: 12, color: C.textDim, minWidth: 38, textAlign: "right" }}>{pF.toFixed(0)}%</span>
    </div>
  );
}

function SummaryCard({ label, value, color, icon }) {
  return (
    <div style={{
      flex: 1, minWidth: 140, background: C.card, borderRadius: 14,
      padding: "20px 22px", border: `1px solid ${C.border}`,
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <span style={{ fontSize: 13, color: C.textDim, letterSpacing: 0.5 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 32, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>
          {value.toLocaleString("pt-BR")}
        </span>
        <span style={{ fontSize: 18 }}>{icon}</span>
      </div>
    </div>
  );
}

function CheckIcon({ checked }) {
  return (
    <div style={{
      width: 18, height: 18, borderRadius: 4, flexShrink: 0,
      border: checked ? `2px solid ${C.accent}` : `2px solid ${C.textDim}`,
      background: checked ? C.accent : "transparent",
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "all 0.15s",
    }}>
      {checked && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </div>
  );
}

const btnSmall = {
  padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
  border: `1px solid ${C.border}`, background: "transparent",
  color: C.textMuted, cursor: "pointer", whiteSpace: "nowrap",
};

function TSSFilterPanel({ tssMap, excludedTSS, setExcludedTSS }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedFams, setExpandedFams] = useState(new Set());

  const totalTSS = Object.values(tssMap).reduce((s, arr) => s + arr.length, 0);
  const activeCount = totalTSS - excludedTSS.size;

  const toggleFam = (fam) => {
    setExpandedFams(prev => { const n = new Set(prev); n.has(fam) ? n.delete(fam) : n.add(fam); return n; });
  };

  const toggleTSS = (tss) => {
    setExcludedTSS(prev => { const n = new Set(prev); n.has(tss) ? n.delete(tss) : n.add(tss); return n; });
  };

  const toggleAllInFam = (fam, tssList) => {
    setExcludedTSS(prev => {
      const n = new Set(prev);
      const allOff = tssList.every(t => n.has(t.name));
      tssList.forEach(t => allOff ? n.delete(t.name) : n.add(t.name));
      return n;
    });
  };

  const selectAll = () => setExcludedTSS(new Set());
  const deselectAll = () => {
    const all = new Set();
    Object.values(tssMap).forEach(arr => arr.forEach(t => all.add(t.name)));
    setExcludedTSS(all);
  };

  const filteredMap = useMemo(() => {
    if (!search.trim()) return tssMap;
    const q = search.toLowerCase();
    const r = {};
    Object.entries(tssMap).forEach(([fam, list]) => {
      const fl = list.filter(t => t.name.toLowerCase().includes(q));
      if (fl.length > 0 || fam.toLowerCase().includes(q))
        r[fam] = fam.toLowerCase().includes(q) ? list : fl;
    });
    return r;
  }, [tssMap, search]);

  return (
    <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, marginBottom: 20, overflow: "hidden" }}>
      <button onClick={() => setOpen(!open)} style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px", background: "transparent", border: "none", color: C.text, cursor: "pointer", fontSize: 14,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>🔧</span>
          <span style={{ fontWeight: 700 }}>Filtro de TSS</span>
          <span style={{
            padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 700,
            background: excludedTSS.size > 0 ? C.redBg : C.accentBg,
            color: excludedTSS.size > 0 ? C.red : C.accent,
            border: `1px solid ${excludedTSS.size > 0 ? C.redBorder : "rgba(59,130,246,0.2)"}`,
          }}>{activeCount}/{totalTSS} ativos</span>
        </div>
        <span style={{
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.2s", fontSize: 12, color: C.textDim,
        }}>▼</span>
      </button>

      {open && (
        <div style={{ padding: "0 20px 16px", borderTop: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "12px 0 10px", flexWrap: "wrap" }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar TSS..."
              style={{
                flex: 1, minWidth: 180, padding: "8px 12px", borderRadius: 8,
                border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, outline: "none",
              }}
              onFocus={e => (e.target.style.borderColor = C.accent)}
              onBlur={e => (e.target.style.borderColor = C.border)}
            />
            <button onClick={selectAll} style={btnSmall}>Marcar todos</button>
            <button onClick={deselectAll} style={btnSmall}>Desmarcar todos</button>
          </div>

          <div style={{ maxHeight: 400, overflowY: "auto", paddingRight: 4 }}>
            {Object.entries(filteredMap).sort(([a],[b]) => a.localeCompare(b)).map(([fam, tssList]) => {
              const expanded = expandedFams.has(fam);
              const activeInFam = tssList.filter(t => !excludedTSS.has(t.name)).length;
              const allOff = tssList.every(t => excludedTSS.has(t.name));
              const someOff = tssList.some(t => excludedTSS.has(t.name));
              return (
                <div key={fam} style={{ marginBottom: 2 }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "8px 8px", borderRadius: 8,
                    cursor: "pointer", background: expanded ? "rgba(59,130,246,0.04)" : "transparent",
                  }}>
                    <div onClick={() => toggleAllInFam(fam, tssList)} style={{ display: "flex", cursor: "pointer" }}>
                      <CheckIcon checked={!allOff} />
                    </div>
                    <div onClick={() => toggleFam(fam)} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fam}</span>
                      <span style={{
                        fontSize: 11, color: someOff && !allOff ? "#eab308" : C.textDim,
                      }}>{activeInFam}/{tssList.length}</span>
                      <span style={{
                        marginLeft: "auto", fontSize: 10, color: C.textDim,
                        transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s",
                      }}>▼</span>
                    </div>
                  </div>
                  {expanded && (
                    <div style={{ paddingLeft: 18, paddingBottom: 4 }}>
                      {tssList.map(t => {
                        const on = !excludedTSS.has(t.name);
                        return (
                          <div key={t.name} onClick={() => toggleTSS(t.name)} style={{
                            display: "flex", alignItems: "center", gap: 8, padding: "5px 8px",
                            borderRadius: 6, cursor: "pointer",
                          }}
                            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                          >
                            <CheckIcon checked={on} />
                            <span style={{ fontSize: 13, color: on ? C.text : C.textDim }}>{t.name}</span>
                            <span style={{ marginLeft: "auto", fontSize: 11, color: C.textDim, fontVariantNumeric: "tabular-nums" }}>{t.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [rawRows, setRawRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [sortBy, setSortBy] = useState("fora");
  const [excludedTSS, setExcludedTSS] = useState(new Set());
  const inputRef = useRef();

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setLoading(true);
    try {
      const rows = await parseFile(file);
      const filtered = rows.filter(r => !EXCLUDED_FAMILIES.includes(String(r["Família"] || "").trim()));
      setRawRows(filtered);
      setExcludedTSS(new Set());
    } catch { alert("Erro ao ler o arquivo."); }
    setLoading(false);
  }, []);

  const tssMap = useMemo(() => {
    if (!rawRows) return {};
    const map = {};
    rawRows.forEach(r => {
      const fam = String(r["Família"] || "").trim();
      const tss = String(r["TSS"] || "").trim();
      if (!fam || !tss) return;
      if (!map[fam]) map[fam] = {};
      map[fam][tss] = (map[fam][tss] || 0) + 1;
    });
    const result = {};
    Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).forEach(([fam, obj]) => {
      result[fam] = Object.entries(obj).map(([name, count]) => ({ name, count })).sort((a,b) => a.name.localeCompare(b.name));
    });
    return result;
  }, [rawRows]);

  const data = useMemo(() => {
    if (!rawRows) return null;
    const rows = rawRows.filter(r => !excludedTSS.has(String(r["TSS"] || "").trim()));
    const map = {};
    let totalPrazo = 0, totalFora = 0;
    rows.forEach(r => {
      const fam = String(r["Família"] || "").trim();
      const st = classifyTempo(r["Tempo Residual"]);
      if (!fam || !st) return;
      if (!map[fam]) map[fam] = { prazo: 0, fora: 0 };
      map[fam][st]++;
      st === "prazo" ? totalPrazo++ : totalFora++;
    });
    const families = Object.entries(map)
      .map(([name, c]) => ({ name, prazo: c.prazo, fora: c.fora, total: c.prazo + c.fora, pctFora: c.fora / (c.prazo + c.fora) }))
      .sort((a,b) => b.fora - a.fora);
    return { families, totalPrazo, totalFora, total: totalPrazo + totalFora };
  }, [rawRows, excludedTSS]);

  const sorted = data ? [...data.families].sort((a,b) => {
    if (sortBy === "fora") return b.fora - a.fora;
    if (sortBy === "prazo") return b.prazo - a.prazo;
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "pct") return b.pctFora - a.pctFora;
    return b.total - a.total;
  }) : [];

  const onDrop = useCallback((e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }, [handleFile]);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Inter', -apple-system, sans-serif", padding: "24px 16px" }}>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <div style={{ marginBottom: 28, textAlign: "center" }}>
          <h1 style={{
            fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: -0.5,
            background: "linear-gradient(135deg, #60a5fa, #3b82f6, #818cf8)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>Controle de Prazos — OS Pendentes</h1>
          <p style={{ color: C.textDim, margin: "6px 0 0", fontSize: 14 }}>Análise por família de serviço</p>
        </div>

        {!rawRows && (
          <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? C.accent : C.border}`, borderRadius: 16, padding: "60px 20px",
              textAlign: "center", cursor: "pointer", background: dragOver ? "rgba(59,130,246,0.05)" : C.card, transition: "all 0.2s",
            }}>
            <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.7 }}>📂</div>
            {loading
              ? <p style={{ color: C.accent, fontSize: 16, fontWeight: 600 }}>Processando…</p>
              : <><p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Arraste o arquivo .xlsx aqui</p>
                  <p style={{ fontSize: 14, color: C.textDim, margin: "8px 0 0" }}>ou clique para selecionar</p></>
            }
          </div>
        )}

        {data && (
          <div style={{ animation: "fadeIn 0.4s ease" }}>
            <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
              <SummaryCard label="TOTAL DE OS" value={data.total} color={C.accent} icon="📋" />
              <SummaryCard label="NO PRAZO" value={data.totalPrazo} color={C.green} icon="✅" />
              <SummaryCard label="FORA DO PRAZO" value={data.totalFora} color={C.red} icon="⚠️" />
            </div>

            <div style={{ background: C.card, borderRadius: 12, padding: "14px 20px", marginBottom: 20, border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: C.textDim }}>Distribuição geral</span>
                <span style={{ fontSize: 13, color: C.red, fontWeight: 600 }}>
                  {data.total > 0 ? ((data.totalFora / data.total) * 100).toFixed(1) : 0}% fora
                </span>
              </div>
              <BarCell prazo={data.totalPrazo} fora={data.totalFora} total={data.total} />
            </div>

            <TSSFilterPanel tssMap={tssMap} excludedTSS={excludedTSS} setExcludedTSS={setExcludedTSS} />

            <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 580 }}>
                  <thead>
                    <tr style={{ background: C.headerBg }}>
                      {[
                        { key: "name", label: "Família" }, { key: "prazo", label: "No Prazo" },
                        { key: "fora", label: "Fora do Prazo" }, { key: "total", label: "Total" },
                        { key: "pct", label: "Proporção" },
                      ].map(col => (
                        <th key={col.key} onClick={() => setSortBy(col.key)} style={{
                          padding: "13px 16px", textAlign: col.key === "name" ? "left" : "center",
                          fontSize: 12, fontWeight: 700, color: sortBy === col.key ? C.accent : C.textDim,
                          textTransform: "uppercase", letterSpacing: 0.8, cursor: "pointer", userSelect: "none",
                          borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap",
                        }}>{col.label} {sortBy === col.key && "↓"}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.length === 0 && (
                      <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: C.textDim }}>Nenhum serviço com os filtros atuais</td></tr>
                    )}
                    {sorted.map((f, i) => (
                      <tr key={f.name}
                        style={{ background: i % 2 === 0 ? "transparent" : C.cardAlt }}
                        onMouseEnter={e => (e.currentTarget.style.background = C.rowHover)}
                        onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "transparent" : C.cardAlt)}
                      >
                        <td style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{f.name}</td>
                        <td style={{ padding: "12px 16px", textAlign: "center", borderBottom: `1px solid ${C.border}` }}>
                          <Pill value={f.prazo} color={C.green} bg={C.greenBg} border={C.greenBorder} />
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "center", borderBottom: `1px solid ${C.border}` }}>
                          <Pill value={f.fora} color={C.red} bg={C.redBg} border={C.redBorder} />
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "center", fontSize: 14, fontWeight: 600, color: C.textMuted, borderBottom: `1px solid ${C.border}` }}>{f.total}</td>
                        <td style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, minWidth: 160 }}>
                          <BarCell prazo={f.prazo} fora={f.fora} total={f.total} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ textAlign: "center", marginTop: 20 }}>
              <button onClick={() => { setRawRows(null); setSortBy("fora"); setExcludedTSS(new Set()); }}
                style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.textDim, padding: "8px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textDim; }}
              >Importar outro arquivo</button>
            </div>
          </div>
        )}
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        ::-webkit-scrollbar { width:6px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:${C.border}; border-radius:3px; }
      `}</style>
    </div>
  );
}