import { useState, useRef, useEffect, useCallback } from "react";

// ── palette — organic, vibrant, like a hand-drawn idea map ───────────────────
const BRANCH_COLORS = [
  "#7c3aed",
  "#059669",
  "#d97706",
  "#2563eb",
  "#db2777",
  "#0891b2",
  "#65a30d",
];
const col = (d) => BRANCH_COLORS[Math.min(d, BRANCH_COLORS.length - 1)];
const LIGHT = [
  "#ede9fe",
  "#d1fae5",
  "#fef3c7",
  "#dbeafe",
  "#fce7f3",
  "#cffafe",
  "#ecfccb",
];
const light = (d) => LIGHT[Math.min(d, LIGHT.length - 1)];

const NODE_W = 240;
const ANSWER_PREVIEW = 220;
let _id = 0;
const uid = () => "n" + ++_id;

// ── pronoun resolver ──────────────────────────────────────────────────────────
const PRONOUNS =
  /\b(them|they|it|this|these|those|that|its|their|him|her|he|she)\b/gi;
function resolvePronouns(question, parentNode) {
  if (!parentNode) return question;
  if (!PRONOUNS.test(question)) return question;
  PRONOUNS.lastIndex = 0;
  // Extract meaningful label from parent question
  const label = (parentNode.resolvedQuestion || parentNode.question)
    .replace(
      /^(tell me about|explain|what is|what are|how does|how do|describe|show me|give me)\s+/i,
      "",
    )
    .split(/\s+/)
    .slice(0, 5)
    .join(" ");
  PRONOUNS.lastIndex = 0;
  return question.replace(PRONOUNS, label);
}

// ── layout ────────────────────────────────────────────────────────────────────
function layoutChildren(nodes, parentId) {
  const p = nodes[parentId];
  if (!p || !p.children.length) return;
  const n = p.children.length;
  const rx = Math.max(320, n * 85);
  const ry = Math.max(220, n * 75);
  const baseAngle = p.parentId
    ? Math.atan2(p.y - nodes[p.parentId].y, p.x - nodes[p.parentId].x)
    : -Math.PI / 2;
  const spread = Math.min(Math.PI * 1.5, n * 0.72);
  p.children.forEach((cid, i) => {
    const angle =
      n === 1 ? baseAngle : baseAngle + spread * (i / (n - 1)) - spread / 2;
    nodes[cid].x = p.x + rx * Math.cos(angle);
    nodes[cid].y = p.y + ry * Math.sin(angle);
    layoutChildren(nodes, cid);
  });
}

function removeSubtree(nodes, id) {
  (nodes[id]?.children || []).forEach((c) => removeSubtree(nodes, c));
  delete nodes[id];
}

function getAncestorContext(nodes, id) {
  const chain = [];
  let cur = nodes[id]?.parentId;
  while (cur) {
    chain.unshift({
      question: nodes[cur].resolvedQuestion || nodes[cur].question,
      answer: nodes[cur].answer,
    });
    cur = nodes[cur].parentId;
  }
  return chain;
}

// ── organic branch path (thick at root, tapering) ────────────────────────────
function branchPath(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

function edgeMid(x1, y1, x2, y2) {
  const t = 0.5;
  const mx = (x1 + x2) / 2;
  // Point on cubic bezier at t=0.5
  const bx =
    (1 - t) ** 3 * x1 +
    3 * (1 - t) ** 2 * t * mx +
    3 * (1 - t) * t ** 2 * mx +
    t ** 3 * x2;
  const by =
    (1 - t) ** 3 * y1 +
    3 * (1 - t) ** 2 * t * y1 +
    3 * (1 - t) * t ** 2 * y2 +
    t ** 3 * y2;
  return { x: bx, y: by };
}

// ── API ───────────────────────────────────────────────────────────────────────
async function askBackend(cfg, question, context) {
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...cfg, question, context }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Server error");
  return data.answer;
}

// ── HTML export ───────────────────────────────────────────────────────────────
function exportHTML(nodes) {
  const nodeList = Object.values(nodes);
  const root = nodeList.find((n) => n.depth === 0);
  if (!root) return;
  const esc = (s) =>
    (s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const colors = BRANCH_COLORS;
  const lights = LIGHT;
  function renderNode(id, depth = 0) {
    const n = nodes[id];
    if (!n) return "";
    const c = colors[Math.min(depth, colors.length - 1)];
    const lc = lights[Math.min(depth, lights.length - 1)];
    return `<div class="node" style="--c:${c};--lc:${lc};margin-left:${depth * 28}px">
      <div class="q-label">${depth === 0 ? "⬡ root" : "⬡ branch"}</div>
      <div class="question">${esc(n.resolvedQuestion || n.question)}</div>
      ${n.answer ? `<div class="answer">${esc(n.answer)}</div>` : ""}
      ${n.children.map((cid) => renderNode(cid, depth + 1)).join("")}
    </div>`;
  }
  const html = `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Idea Map — ${esc(root.question)}</title>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#fafaf8;color:#1a1a2e;font-family:'Nunito',sans-serif;padding:48px 40px;max-width:900px;margin:0 auto}
h1{font-size:26px;font-weight:800;color:#7c3aed;margin-bottom:8px}
.subtitle{font-size:13px;color:#888;margin-bottom:36px}
.node{border-left:4px solid var(--c);padding:14px 18px;margin-bottom:16px;border-radius:0 14px 14px 0;background:#fff;box-shadow:0 1px 8px #0001}
.q-label{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--c);margin-bottom:4px}
.question{font-size:15px;font-weight:700;color:var(--c);margin-bottom:8px;line-height:1.5}
.answer{font-size:13px;color:#444;line-height:1.85;border-top:1px solid #f0f0f0;padding-top:10px;white-space:pre-wrap}
@media print{body{padding:24px}.node{box-shadow:none;border-left-width:3px}}
</style></head><body>
<h1>✦ ${esc(root.question)}</h1>
<p class="subtitle">Idea Map — ${new Date().toLocaleDateString()}</p>
${renderNode(root.id)}
<p style="margin-top:48px;font-size:11px;color:#bbb;text-align:center">Created with Idea Map</p>
</body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `idea-web-${root.question.slice(0, 30).replace(/\s+/g, "-")}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({ node, onClose }) {
  const c = col(node.depth);
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "#0008",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 20,
          width: "100%",
          maxWidth: 680,
          maxHeight: "82vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: `0 20px 80px ${c}44`,
          border: `2px solid ${c}`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "20px 24px 14px",
            borderBottom: `2px solid ${light(node.depth)}`,
            background: light(node.depth),
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: c,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            {node.depth === 0 ? "⬡ root topic" : `⬡ branch level ${node.depth}`}
          </div>
          <div
            style={{
              fontSize: 17,
              fontWeight: 700,
              color: c,
              lineHeight: 1.5,
              fontFamily: "Nunito,sans-serif",
            }}
          >
            {node.resolvedQuestion || node.question}
          </div>
          {node.resolvedQuestion && node.resolvedQuestion !== node.question && (
            <div style={{ fontSize: 10, color: c + "99", marginTop: 4 }}>
              original: "{node.question}"
            </div>
          )}
        </div>
        <div
          style={{
            padding: "20px 24px",
            overflowY: "auto",
            flex: 1,
            fontSize: 14,
            color: "#333",
            lineHeight: 1.9,
            fontFamily: "Nunito,sans-serif",
            whiteSpace: "pre-wrap",
          }}
        >
          {node.answer}
        </div>
        <div
          style={{
            padding: "14px 24px",
            borderTop: `1px solid ${light(node.depth)}`,
            background: light(node.depth) + "88",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 11, color: "#aaa" }}>
            Esc or click outside
          </span>
          <button
            onClick={onClose}
            style={{
              background: c,
              color: "#fff",
              border: "none",
              fontFamily: "Nunito,sans-serif",
              fontSize: 13,
              fontWeight: 700,
              padding: "8px 20px",
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Settings panel ────────────────────────────────────────────────────────────
function SettingsPanel({ cfg, onChange, onClose }) {
  const [local, setLocal] = useState(cfg);
  const save = () => {
    onChange(local);
    onClose();
  };
  const F = (label, key, ph, type = "text") => (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#7c3aed",
          letterSpacing: 0.5,
          marginBottom: 5,
        }}
      >
        {label}
      </div>
      <input
        type={type}
        value={local[key]}
        onChange={(e) => setLocal((p) => ({ ...p, [key]: e.target.value }))}
        placeholder={ph}
        style={{
          width: "100%",
          background: "#f5f3ff",
          border: "2px solid #ede9fe",
          color: "#1a1a2e",
          fontFamily: "Nunito,sans-serif",
          fontSize: 13,
          padding: "8px 12px",
          borderRadius: 9,
          outline: "none",
        }}
      />
    </div>
  );
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1900,
        background: "#0006",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 18,
          width: "100%",
          maxWidth: 460,
          padding: "28px 32px",
          boxShadow: "0 20px 80px #0003",
          border: "2px solid #ede9fe",
        }}
      >
        <div
          style={{
            fontSize: 19,
            fontWeight: 800,
            color: "#7c3aed",
            marginBottom: 22,
          }}
        >
          ⚙ API Settings
        </div>
        {F("API Key", "apiKey", "sk-ant-... or your key", "password")}
        {F(
          "API Endpoint (optional)",
          "endpoint",
          "Leave blank for Anthropic · or paste OpenAI/Ollama URL",
        )}
        {F("Model", "model", "claude-sonnet-4-5 · gpt-4o · etc.")}
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            marginTop: 8,
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: "#f5f3ff",
              color: "#7c3aed",
              border: "2px solid #ede9fe",
              fontFamily: "Nunito,sans-serif",
              fontSize: 13,
              fontWeight: 700,
              padding: "8px 18px",
              borderRadius: 9,
              cursor: "pointer",
            }}
          >
            cancel
          </button>
          <button
            onClick={save}
            style={{
              background: "#7c3aed",
              color: "#fff",
              border: "none",
              fontFamily: "Nunito,sans-serif",
              fontSize: 13,
              fontWeight: 700,
              padding: "8px 18px",
              borderRadius: 9,
              cursor: "pointer",
            }}
          >
            save
          </button>
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 11,
            color: "#aaa",
            lineHeight: 1.8,
          }}
        >
          Works with Anthropic, OpenAI, or any OpenAI-compatible API (Ollama
          etc.)
        </div>
      </div>
    </div>
  );
}

// ── Node card (organic card style) ───────────────────────────────────────────
function QANode({
  node,
  selected,
  onSelect,
  onStartDrag,
  onAddChild,
  onDelete,
  onRetry,
  onOpenModal,
}) {
  const [draft, setDraft] = useState("");
  const c = col(node.depth);
  const lc = light(node.depth);
  const isRoot = node.depth === 0;
  const preview =
    node.answer && node.answer.length > ANSWER_PREVIEW
      ? node.answer.slice(0, ANSWER_PREVIEW).trimEnd() + "…"
      : node.answer;

  const submit = () => {
    const q = draft.trim();
    if (!q) return;
    onAddChild(node.id, q);
    setDraft("");
  };

  return (
    <div
      style={{
        position: "absolute",
        left: node.x,
        top: node.y,
        transform: "translate(-50%,-50%)",
        width: NODE_W,
        zIndex: selected ? 20 : 8,
        filter: selected
          ? `drop-shadow(0 4px 24px ${c}55)`
          : "drop-shadow(0 2px 8px #0002)",
      }}
    >
      {/* header / drag handle */}
      <div
        onMouseDown={(e) => {
          e.stopPropagation();
          onStartDrag(e, node.id);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(node.id);
        }}
        style={{
          background: selected ? c : c + "ee",
          borderRadius: "14px 14px 0 0",
          padding: "7px 12px 6px",
          cursor: "grab",
          userSelect: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#fff",
            letterSpacing: 1.2,
            textTransform: "uppercase",
          }}
        >
          {isRoot ? "⬡ root" : isRoot ? "⬡ root" : "⬡ answer"}
        </span>
        <span
          style={{ fontSize: 10, color: "#ffffff88", fontFamily: "monospace" }}
        >
          ⠿
        </span>
      </div>

      {/* root question shown in card */}
      {isRoot && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onSelect(node.id);
          }}
          style={{
            background: lc,
            padding: "10px 14px",
            borderLeft: `3px solid ${c}`,
            borderRight: `3px solid ${c}`,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: c,
              lineHeight: 1.5,
              wordBreak: "break-word",
              fontFamily: "Nunito,sans-serif",
            }}
          >
            {node.question}
          </div>
        </div>
      )}

      {/* answer body */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          onSelect(node.id);
        }}
        style={{
          background: "#fff",
          borderLeft: `3px solid ${c}`,
          borderRight: `3px solid ${c}`,
          padding: "10px 14px",
          minHeight: 60,
        }}
      >
        {node.loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 12,
                height: 12,
                border: `2.5px solid ${c}33`,
                borderTop: `2.5px solid ${c}`,
                borderRadius: "50%",
                animation: "spin .7s linear infinite",
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 12,
                color: "#aaa",
                animation: "pulse 1.5s infinite",
                fontFamily: "Nunito,sans-serif",
              }}
            >
              thinking…
            </span>
          </div>
        )}
        {node.error && (
          <div
            style={{
              fontSize: 12,
              color: "#dc2626",
              lineHeight: 1.5,
              fontFamily: "Nunito,sans-serif",
            }}
          >
            {node.error}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRetry(node.id);
              }}
              style={{
                marginLeft: 8,
                background: "transparent",
                border: "1px solid #dc262655",
                color: "#dc2626",
                fontFamily: "Nunito,sans-serif",
                fontSize: 11,
                padding: "2px 7px",
                borderRadius: 5,
                cursor: "pointer",
              }}
            >
              retry
            </button>
          </div>
        )}
        {!node.loading && !node.error && node.answer && (
          <div>
            <div
              style={{
                fontSize: 12,
                color: "#334",
                lineHeight: 1.8,
                wordBreak: "break-word",
                fontFamily: "Nunito,sans-serif",
              }}
            >
              {preview}
            </div>
            {node.answer.length > ANSWER_PREVIEW && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenModal(node.id);
                }}
                style={{
                  marginTop: 8,
                  background: lc,
                  border: `1.5px solid ${c}`,
                  color: c,
                  fontFamily: "Nunito,sans-serif",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: 7,
                  cursor: "pointer",
                }}
              >
                read more ↗
              </button>
            )}
          </div>
        )}
        {!node.loading && !node.error && !node.answer && (
          <div
            style={{
              fontSize: 11,
              color: "#ddd",
              fontFamily: "Nunito,sans-serif",
            }}
          >
            awaiting answer…
          </div>
        )}
      </div>

      {/* follow-up input */}
      {!node.loading && node.answer && (
        <div
          style={{
            background: "#fafafa",
            borderLeft: `3px solid ${c}`,
            borderRight: `3px solid ${c}`,
            borderBottom: `3px solid ${c}`,
            borderRadius: "0 0 14px 14px",
            padding: "8px 10px",
            display: "flex",
            gap: 6,
            alignItems: "center",
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            placeholder="Ask a follow-up…"
            style={{
              flex: 1,
              background: "#fff",
              border: `1.5px solid ${c}44`,
              color: "#1a1a2e",
              fontFamily: "Nunito,sans-serif",
              fontSize: 12,
              padding: "5px 9px",
              borderRadius: 7,
              outline: "none",
            }}
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              submit();
            }}
            disabled={!draft.trim()}
            style={{
              background: draft.trim() ? c : "#eee",
              color: draft.trim() ? "#fff" : "#bbb",
              border: "none",
              borderRadius: 7,
              fontFamily: "Nunito,sans-serif",
              fontSize: 12,
              fontWeight: 700,
              padding: "5px 11px",
              cursor: draft.trim() ? "pointer" : "default",
              transition: "background .15s",
              whiteSpace: "nowrap",
            }}
          >
            + branch
          </button>
        </div>
      )}

      {/* delete */}
      {!isRoot && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(node.id);
          }}
          style={{
            position: "absolute",
            top: -9,
            right: -9,
            width: 22,
            height: 22,
            borderRadius: "50%",
            border: `2px solid ${c}`,
            background: "#fff",
            color: c,
            fontSize: 12,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            zIndex: 30,
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
const DEFAULT_CFG = { apiKey: "", endpoint: "", model: "claude-sonnet-4-5" };

export default function App() {
  const [cfg, setCfg] = useState(() => {
    try {
      return {
        ...DEFAULT_CFG,
        ...JSON.parse(localStorage.getItem("iw_cfg") || "{}"),
      };
    } catch {
      return DEFAULT_CFG;
    }
  });
  const [showSettings, setShowSettings] = useState(false);
  const [nodes, setNodes] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [modalId, setModalId] = useState(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [rootQ, setRootQ] = useState("");
  const [status, setStatus] = useState("");

  const isPanning = useRef(false);
  const panStart = useRef(null);
  const panOrigin = useRef(null);
  const nodeDrag = useRef(null); // {id, sx, sy, ox, oy}
  const wrapRef = useRef(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const panRef = useRef(pan);
  panRef.current = pan;

  useEffect(() => {
    try {
      localStorage.setItem("iw_cfg", JSON.stringify(cfg));
    } catch {}
  }, [cfg]);
  useEffect(() => {
    if (wrapRef.current) {
      const { clientWidth: w, clientHeight: h } = wrapRef.current;
      setPan({ x: w / 2, y: h / 2 });
    }
  }, []);

  const askNode = useCallback(
    async (nodeId) => {
      const ns = nodesRef.current;
      const node = ns[nodeId];
      if (!node) return;
      const parent = node.parentId ? ns[node.parentId] : null;
      // Resolve pronouns using parent context
      const resolved = resolvePronouns(node.question, parent);
      const context = getAncestorContext(ns, nodeId);
      setNodes((p) => ({
        ...p,
        [nodeId]: {
          ...p[nodeId],
          loading: true,
          error: null,
          resolvedQuestion: resolved,
        },
      }));
      try {
        const answer = await askBackend(cfg, resolved, context);
        setNodes((p) => ({
          ...p,
          [nodeId]: {
            ...p[nodeId],
            loading: false,
            answer,
            resolvedQuestion: resolved,
          },
        }));
      } catch (e) {
        setNodes((p) => ({
          ...p,
          [nodeId]: { ...p[nodeId], loading: false, error: e.message },
        }));
      }
    },
    [cfg],
  );

  const startMap = useCallback(() => {
    if (!cfg.apiKey.trim()) {
      setShowSettings(true);
      return;
    }
    if (!rootQ.trim()) {
      setStatus("Enter a question.");
      return;
    }
    setStatus("");
    const id = uid();
    const root = {
      id,
      question: rootQ.trim(),
      resolvedQuestion: rootQ.trim(),
      answer: null,
      error: null,
      loading: true,
      depth: 0,
      x: 0,
      y: 0,
      parentId: null,
      children: [],
    };
    setNodes({ [id]: root });
    setSelectedId(id);
    setRootQ("");
    askBackend(cfg, root.question, [])
      .then((answer) =>
        setNodes((p) => ({ ...p, [id]: { ...p[id], loading: false, answer } })),
      )
      .catch((e) =>
        setNodes((p) => ({
          ...p,
          [id]: { ...p[id], loading: false, error: e.message },
        })),
      );
  }, [cfg, rootQ]);

  const addChild = useCallback(
    (parentId, question) => {
      const cid = uid();
      setNodes((prev) => {
        const parent = prev[parentId];
        if (!parent) return prev;
        const child = {
          id: cid,
          question,
          resolvedQuestion: null,
          answer: null,
          error: null,
          loading: false,
          depth: parent.depth + 1,
          x: parent.x + 350,
          y: parent.y,
          parentId,
          children: [],
        };
        const updated = {
          ...prev,
          [parentId]: { ...parent, children: [...parent.children, cid] },
          [cid]: child,
        };
        layoutChildren(updated, parentId);
        return updated;
      });
      // askNode needs updated nodesRef — wait a tick
      setTimeout(() => askNode(cid), 60);
    },
    [askNode],
  );

  const retryNode = useCallback((id) => askNode(id), [askNode]);

  const deleteNode = useCallback(
    (id) => {
      setNodes((prev) => {
        const n = prev[id];
        if (!n || n.depth === 0) return prev;
        const updated = { ...prev };
        if (updated[n.parentId])
          updated[n.parentId] = {
            ...updated[n.parentId],
            children: updated[n.parentId].children.filter((c) => c !== id),
          };
        removeSubtree(updated, id);
        return updated;
      });
      if (selectedId === id) setSelectedId(null);
    },
    [selectedId],
  );

  const fitView = useCallback(() => {
    const ids = Object.keys(nodesRef.current);
    if (!ids.length || !wrapRef.current) return;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    ids.forEach((id) => {
      const n = nodesRef.current[id];
      minX = Math.min(minX, n.x - NODE_W / 2 - 40);
      maxX = Math.max(maxX, n.x + NODE_W / 2 + 40);
      minY = Math.min(minY, n.y - 150);
      maxY = Math.max(maxY, n.y + 150);
    });
    const { clientWidth: pw, clientHeight: ph } = wrapRef.current;
    const s = Math.max(
      0.1,
      Math.min(
        1.4,
        Math.min((pw - 60) / (maxX - minX), (ph - 60) / (maxY - minY)),
      ),
    );
    setScale(s);
    setPan({
      x: pw / 2 - (s * (minX + maxX)) / 2,
      y: ph / 2 - (s * (minY + maxY)) / 2,
    });
  }, []);

  const startNodeDrag = useCallback((e, id) => {
    const n = nodesRef.current[id];
    if (!n) return;
    nodeDrag.current = { id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y };
  }, []);

  // ── pointer events on the wrapper ─────────────────────────────────────────
  const onWrapPointerDown = useCallback((e) => {
    // Only start panning when the direct target is the wrapper itself or the SVG/canvas
    if (nodeDrag.current) return;
    if (e.target === wrapRef.current || e.target.dataset.pannable === "1") {
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      panOrigin.current = { ...panRef.current };
      wrapRef.current.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  }, []);

  const onWrapPointerMove = useCallback((e) => {
    if (nodeDrag.current) {
      const { id, sx, sy, ox, oy } = nodeDrag.current;
      const dx = (e.clientX - sx) / scaleRef.current;
      const dy = (e.clientY - sy) / scaleRef.current;
      setNodes((prev) => ({
        ...prev,
        [id]: { ...prev[id], x: ox + dx, y: oy + dy },
      }));
      return;
    }
    if (isPanning.current && panStart.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan({ x: panOrigin.current.x + dx, y: panOrigin.current.y + dy });
    }
  }, []);

  const onWrapPointerUp = useCallback((e) => {
    nodeDrag.current = null;
    isPanning.current = false;
    panStart.current = null;
    try {
      wrapRef.current?.releasePointerCapture(e.pointerId);
    } catch {}
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left,
        cy = e.clientY - rect.top;
      const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      setScale((prev) => {
        const ns = Math.max(0.1, Math.min(3, prev * f));
        setPan((p) => ({
          x: cx - (cx - p.x) * (ns / prev),
          y: cy - (cy - p.y) * (ns / prev),
        }));
        return ns;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const nodeList = Object.values(nodes);
  const lines = nodeList.filter((n) => n.parentId && nodes[n.parentId]);
  const hasNodes = nodeList.length > 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        fontFamily: "Nunito,sans-serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
        @keyframes fadeIn{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}
      `}</style>

      {modalId && nodes[modalId] && (
        <Modal node={nodes[modalId]} onClose={() => setModalId(null)} />
      )}
      {showSettings && (
        <SettingsPanel
          cfg={cfg}
          onChange={(c) => setCfg(c)}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* topbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 18px",
          borderBottom: "2px solid #ede9fe",
          background: "#fff",
          flexShrink: 0,
          flexWrap: "wrap",
          boxShadow: "0 2px 12px #7c3aed11",
        }}
      >
        <span
          style={{
            fontFamily: "Nunito,sans-serif",
            fontSize: 19,
            color: "#7c3aed",
            fontWeight: 800,
            letterSpacing: -0.5,
            whiteSpace: "nowrap",
          }}
        >
          ✦ Idea Map
        </span>

        <button
          onClick={() => setShowSettings(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "#f5f3ff",
            border: "2px solid #ede9fe",
            color: "#7c3aed",
            fontFamily: "Nunito,sans-serif",
            fontSize: 12,
            fontWeight: 700,
            padding: "5px 12px",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          <span>⚙</span>
          <span
            style={{ color: cfg.apiKey ? "#059669" : "#dc2626", fontSize: 11 }}
          >
            {cfg.apiKey ? cfg.model || "configured" : "no api key"}
          </span>
        </button>

        {!hasNodes && (
          <>
            <input
              type="text"
              placeholder="Your first question or topic…"
              value={rootQ}
              onChange={(e) => setRootQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && startMap()}
              style={{
                flex: 1,
                minWidth: 180,
                background: "#f5f3ff",
                border: "2px solid #ede9fe",
                color: "#1a1a2e",
                fontFamily: "Nunito,sans-serif",
                fontSize: 13,
                padding: "6px 12px",
                borderRadius: 9,
                outline: "none",
              }}
            />
            <button
              onClick={startMap}
              style={{
                background: "#7c3aed",
                color: "#fff",
                border: "none",
                fontFamily: "Nunito,sans-serif",
                fontSize: 13,
                fontWeight: 800,
                padding: "7px 18px",
                borderRadius: 9,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Start ✦
            </button>
          </>
        )}

        {hasNodes && (
          <>
            <button onClick={fitView} style={gBtn}>
              fit view
            </button>
            <button
              onClick={() => exportHTML(nodes)}
              style={{
                ...gBtn,
                color: "#059669",
                borderColor: "#d1fae5",
                background: "#f0fdf4",
              }}
            >
              ⬇ export
            </button>
            <button
              onClick={() => {
                setNodes({});
                setSelectedId(null);
                setModalId(null);
              }}
              style={{
                ...gBtn,
                color: "#dc2626",
                borderColor: "#fee2e2",
                background: "#fff5f5",
              }}
            >
              clear
            </button>
          </>
        )}

        {status && (
          <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>
            {status}
          </span>
        )}
        <span
          style={{
            marginLeft: "auto",
            fontSize: 10,
            color: "#c4b5fd",
            fontWeight: 600,
          }}
        >
          drag header → move · drag canvas → pan · scroll → zoom
        </span>
      </div>

      {/* canvas */}
      <div
        ref={wrapRef}
        data-pannable="0"
        style={{
          flex: 1,
          overflow: "hidden",
          position: "relative",
          background: "#faf8ff",
          cursor: isPanning.current ? "grabbing" : "grab",
          touchAction: "none",
        }}
        onPointerDown={onWrapPointerDown}
        onPointerMove={onWrapPointerMove}
        onPointerUp={onWrapPointerUp}
        onPointerCancel={onWrapPointerUp}
      >
        {/* subtle graph paper grid */}
        <svg
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
          data-pannable="1"
        >
          <defs>
            <pattern
              id="grid"
              x={pan.x % (32 * scale)}
              y={pan.y % (32 * scale)}
              width={32 * scale}
              height={32 * scale}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${32 * scale} 0 L 0 0 0 ${32 * scale}`}
                fill="none"
                stroke="#ede9fe"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="url(#grid)"
            data-pannable="1"
          />
        </svg>

        {/* transform layer */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            transformOrigin: "0 0",
            transform: `translate(${pan.x}px,${pan.y}px) scale(${scale})`,
            pointerEvents: "none",
          }}
        >
          {/* branches (SVG) */}
          <svg
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              overflow: "visible",
            }}
            width="1"
            height="1"
          >
            <defs>
              {BRANCH_COLORS.map((c, i) => (
                <marker
                  key={i}
                  id={`arr${i}`}
                  viewBox="0 0 12 12"
                  refX="10"
                  refY="6"
                  markerWidth="8"
                  markerHeight="8"
                  orient="auto"
                >
                  <path d="M1,2 L10,6 L1,10 Z" fill={c} />
                </marker>
              ))}
            </defs>
            {lines.map((n) => {
              const p = nodes[n.parentId];
              const c = col(n.depth);
              const ci = Math.min(n.depth, BRANCH_COLORS.length - 1);
              const isSel = n.id === selectedId;
              const mid = edgeMid(p.x, p.y, n.x, n.y);
              // Stroke width tapers with depth
              const sw = Math.max(1.5, 5 - n.depth * 1.2);
              // Show resolved question on edge
              const edgeLabel = n.resolvedQuestion || n.question;
              const words =
                edgeLabel.split(" ").slice(0, 7).join(" ") +
                (edgeLabel.split(" ").length > 7 ? "…" : "");
              const lw = Math.min(Math.max(words.length * 6, 80), 200);
              return (
                <g key={"eg-" + n.id}>
                  <path
                    d={branchPath(p.x, p.y, n.x, n.y)}
                    fill="none"
                    stroke={isSel ? c : c + (isSel ? "ee" : "99")}
                    strokeWidth={isSel ? sw + 1 : sw}
                    strokeLinecap="round"
                    markerEnd={`url(#arr${ci})`}
                  />
                  {/* edge label */}
                  <foreignObject
                    x={mid.x - lw / 2}
                    y={mid.y - 14}
                    width={lw}
                    height={56}
                    style={{ overflow: "visible" }}
                  >
                    <div
                      style={{
                        background: "#fff",
                        border: `2px solid ${c}`,
                        borderRadius: 8,
                        color: c,
                        fontSize: 10,
                        fontFamily: "Nunito,sans-serif",
                        fontWeight: 700,
                        padding: "2px 7px",
                        textAlign: "center",
                        lineHeight: 1.5,
                        wordBreak: "break-word",
                        boxShadow: `0 2px 8px ${c}33`,
                      }}
                    >
                      {words}
                    </div>
                  </foreignObject>
                </g>
              );
            })}
          </svg>

          {/* nodes — pointerEvents re-enabled */}
          <div style={{ pointerEvents: "auto" }}>
            {nodeList.map((n) => (
              <QANode
                key={n.id}
                node={n}
                selected={n.id === selectedId}
                onSelect={setSelectedId}
                onStartDrag={startNodeDrag}
                onAddChild={addChild}
                onDelete={deleteNode}
                onRetry={retryNode}
                onOpenModal={setModalId}
              />
            ))}
          </div>
        </div>

        {/* empty state */}
        {!hasNodes && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 60, opacity: 0.08 }}>✦</div>
            <div
              style={{
                fontSize: 13,
                color: "#c4b5fd",
                fontWeight: 600,
                lineHeight: 2.2,
                textAlign: "center",
              }}
            >
              Click ⚙ to set your API key, then type a question.
              <br />
              Branch from any answer to explore deeper.
            </div>
          </div>
        )}

        {/* zoom controls */}
        <div
          style={{
            position: "absolute",
            bottom: 20,
            left: 20,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            zIndex: 100,
          }}
        >
          {[
            ["＋", 1.15],
            ["−", 1 / 1.15],
          ].map(([label, f]) => (
            <button
              key={label}
              onClick={() => {
                const cx = wrapRef.current.clientWidth / 2,
                  cy = wrapRef.current.clientHeight / 2;
                setScale((prev) => {
                  const ns = Math.max(0.1, Math.min(3, prev * f));
                  setPan((p) => ({
                    x: cx - (cx - p.x) * (ns / prev),
                    y: cy - (cy - p.y) * (ns / prev),
                  }));
                  return ns;
                });
              }}
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                border: "2px solid #ede9fe",
                background: "#fff",
                color: "#7c3aed",
                fontSize: 18,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                boxShadow: "0 2px 8px #7c3aed22",
              }}
            >
              {label}
            </button>
          ))}
          <div
            style={{
              fontSize: 10,
              color: "#c4b5fd",
              textAlign: "center",
              fontWeight: 600,
            }}
          >
            {Math.round(scale * 100)}%
          </div>
        </div>
      </div>
    </div>
  );
}

const gBtn = {
  background: "#f5f3ff",
  color: "#7c3aed",
  border: "2px solid #ede9fe",
  fontFamily: "Nunito,sans-serif",
  fontSize: 12,
  fontWeight: 700,
  padding: "5px 13px",
  borderRadius: 8,
  cursor: "pointer",
};
