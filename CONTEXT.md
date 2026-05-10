# Idea Map — Project Context

> Read this file before making any changes. It contains the full history, architecture, decisions, and known issues so you can continue development without missing context.

---

## What This Is

**Idea Map** is an AI-powered interactive learning tool. The user types a question, Claude answers it, and from any answer they can branch into follow-up questions — building a visual spider/idea map of knowledge. It was built iteratively in a Claude.ai chat session and renamed from "idea map" to "Idea Map".

The core insight: **each node stores its ancestor chain as context**, so Claude always knows the full learning path when answering a follow-up. Asking "why should I use them?" at depth 3 is resolved to "why should I use NoSQL databases?" before being sent to the API.

---

## Stack

```
ideaweb/
├── backend/
│   ├── server.js        Express API proxy (Node.js)
│   └── package.json     dependencies: express, cors, @anthropic-ai/sdk
├── frontend/
│   ├── src/
│   │   ├── App.jsx      Entire React app (single file, no component split yet)
│   │   ├── main.jsx     ReactDOM entry point
│   │   └── index.css    Global resets + keyframe animations
│   ├── index.html
│   ├── package.json     dependencies: react, react-dom; dev: vite, @vitejs/plugin-react
│   └── vite.config.js   Proxies /api → localhost:3001
├── start.sh             Starts both servers (backend then frontend)
└── CONTEXT.md           This file
```

**Frontend:** React 18 + Vite. No router, no state library, no component library. Everything lives in `App.jsx`.

**Backend:** Express. Its only job is to proxy requests to the Anthropic API (or any OpenAI-compatible endpoint) to avoid CORS issues. It does NOT store any state.

---

## Running the Project

```bash
# Option A — one command
sh start.sh

# Option B — two terminals
cd backend && npm install && node server.js     # port 3001
cd frontend && npm install && npm run dev       # port 3000
```

Open `http://localhost:3000`. The Vite dev server proxies `/api/*` to `http://localhost:3001`.

---

## Architecture — How Nodes Work

Every node is a plain JS object stored in a React `useState` dict keyed by ID:

```js
{
  id: "n1",
  question: "why should I use them",               // user's raw input
  resolvedQuestion: "why should I use NoSQL databases", // after pronoun resolution
  answer: "NoSQL databases are useful because...",
  error: null,
  loading: false,
  depth: 2,           // 0 = root
  x: 340,             // canvas position (before pan/scale transform)
  y: -180,
  parentId: "n0",
  children: ["n3", "n4"],
}
```

### Context chain

When asking a question at depth N, the backend receives an array of ancestor Q&A pairs from root down to (but not including) the current node. This is built by `getAncestorContext()` in `App.jsx`. The backend builds a proper multi-turn message array from this.

### Pronoun resolution

`resolvePronouns(question, parentNode)` runs client-side before the API call. It matches a regex of common pronouns (`them|they|it|this|these|those|that|its|their|him|her|he|she`) and replaces them with the first 5 meaningful words stripped from the parent's resolved question. The resolved version is stored as `resolvedQuestion` on the node and shown on the edge label and in the modal.

### Layout

`layoutChildren(nodes, parentId)` arranges children in a fan around the parent using polar coordinates. It runs mutably on a copy of the nodes dict before `setNodes()` is called. The spread angle and radius scale with the number of children. Re-layout happens every time a child is added.

---

## Canvas / Interaction Model

- **Pan:** `onPointerDown/Move/Up` on the wrapper div with `setPointerCapture()`. This locks pointer events to the wrapper even when the cursor drifts over nodes.
- **Node drag:** Each node's header (`⠿ drag`) calls `onStartDrag(e, id)` which sets a `nodeDrag` ref. The global `onPointerMove` handler checks this ref first, before pan.
- **Zoom:** `wheel` event on the wrapper, scaling around the cursor position.
- **Transform:** A single `<div>` with `transform: translate(panX, panY) scale(scale)` wraps all nodes and SVG edges. Nodes have `position: absolute` inside it.
- **SVG edges:** Rendered as cubic bezier paths (`branchPath`). Each edge has a `<foreignObject>` at the midpoint showing the resolved question as a pill label. Arrow markers are defined per depth color.

---

## Backend — Flexible API Support

`POST /api/ask` accepts:

```json
{
  "apiKey": "sk-ant-...",
  "endpoint": "", // optional — leave blank for Anthropic default
  "model": "claude-sonnet-4-5",
  "question": "...",
  "context": [{ "question": "...", "answer": "..." }]
}
```

**Routing logic in `server.js`:**

- If `endpoint` is blank or contains `anthropic.com` → uses `@anthropic-ai/sdk` (Anthropic messages API)
- Otherwise → treats as OpenAI-compatible, sends a `POST` to that URL with `Authorization: Bearer {apiKey}` and the OpenAI chat completions body shape

Works with: Anthropic, OpenAI, Ollama (`http://localhost:11434/v1/chat/completions`), and any OpenAI-compatible API.

**System prompt** instructs Claude to answer in 3–6 sentences of plain prose (no markdown headers or bullets) focused on the specific question using the ancestor chain as context.

---

## Frontend — Key Functions

| Function                          | Location      | Purpose                                            |
| --------------------------------- | ------------- | -------------------------------------------------- |
| `resolvePronouns(q, parent)`      | App.jsx top   | Replaces pronouns with parent topic label          |
| `layoutChildren(nodes, parentId)` | App.jsx top   | Fan layout for child nodes                         |
| `getAncestorContext(nodes, id)`   | App.jsx top   | Builds Q&A chain for API context                   |
| `branchPath(x1,y1,x2,y2)`         | App.jsx top   | SVG cubic bezier for edges                         |
| `edgeMid(x1,y1,x2,y2)`            | App.jsx top   | Midpoint on bezier for label placement             |
| `exportHTML(nodes)`               | App.jsx top   | Generates + downloads standalone HTML reading file |
| `askNode(nodeId)`                 | App component | Calls backend, updates node with answer            |
| `startMap()`                      | App component | Creates root node, starts first API call           |
| `addChild(parentId, q)`           | App component | Creates child node, triggers layout + askNode      |
| `fitView()`                       | App component | Scales + pans to fit all nodes in viewport         |
| `startNodeDrag(e, id)`            | App component | Sets nodeDrag ref for pointer capture              |

---

## UI Components (all in App.jsx)

- **`<QANode>`** — The card. Has a colored drag handle header, optional question display (root only), answer body with 220-char preview truncation, "read more ↗" button, follow-up input, and delete button.
- **`<Modal>`** — Fullscreen overlay showing the full answer. Closes on Escape or outside click. Shows original vs resolved question if they differ.
- **`<SettingsPanel>`** — API key + endpoint + model fields. Saved to `localStorage` under key `iw_cfg`.

---

## Visual Design

- **Font:** Nunito (Google Fonts) — rounded, friendly
- **Colors:** 7 branch colors cycling by depth:
  - depth 0: `#7c3aed` purple
  - depth 1: `#059669` green
  - depth 2: `#d97706` amber
  - depth 3: `#2563eb` blue
  - depth 4: `#db2777` pink
  - depth 5: `#0891b2` cyan
  - depth 6: `#65a30d` lime
- Each depth has a matching light tint (`LIGHT` array) for backgrounds
- Branch strokes taper with depth: `strokeWidth = max(1.5, 5 - depth * 1.2)`
- Cards: white background, 3px colored left/right/bottom border, solid colored header
- Canvas background: `#faf8ff` (light lavender) with graph-paper grid of `#ede9fe`
- Selected node gets a `drop-shadow` CSS filter

---

## Known Issues / Decided Not to Fix

- **Markdown in answers:** Claude sometimes returns `**bold**` or `#` headers despite the system prompt saying plain prose. Fix: post-process answer to strip markdown, or strengthen prompt.
- **Layout overlap:** Many children at the same depth can visually overlap cards. Individual node drag is the workaround.
- **No persistence:** Refreshing loses the map. Fix: serialize `nodes` dict to localStorage or downloadable JSON.
- **No undo:** Deleting a branch is permanent.
- **Children don't follow parent drag:** Dragging a node doesn't reposition its children. They stay put.

---

## Feature Ideas (not yet built)

- **Save / load** — serialize `nodes` to JSON, download or store in localStorage, re-import
- **Collapse / expand branches** — toggle subtree visibility
- **Search** — highlight nodes matching a keyword across the whole map
- **Re-ask** — re-run a question with different model/prompt
- **Auto-expand** — given a root, auto-generate N branches without user input
- **Minimap** — small overview panel for large maps
- **Node resize** — drag handle to make cards wider/narrower
- **Multi-root** — multiple independent trees on the same canvas
- **Markdown rendering** — render answer text as proper markdown instead of plain text

---

## How to Continue in Claude Code

Start a session with:

> "I'm working on a project called Idea Map — read `CONTEXT.md` in the project root first, then help me [your task]."

Claude Code can read all files directly so you don't need to paste code. Point it to this file first, then describe what you want. The most important files to know are `frontend/src/App.jsx` (entire frontend) and `backend/server.js` (entire backend).

---

## Iteration History

| Version | Key changes                                                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| v1      | Basic topic-expansion idea map, HTML file, hit CORS wall                                                                              |
| v2      | Rebuilt as React artifact in Claude.ai sandbox to bypass CORS                                                                         |
| v3      | Split frontend/backend; Q&A node design (question top, answer bottom)                                                                 |
| v3.1    | Fixed model string (`claude-sonnet-4-5`); better error messages                                                                       |
| v3.2    | Working canvas pan (pointer capture), pronoun resolver, flexible API settings, HTML export                                            |
| v4      | Organic theme (Nunito, white cards, tapered branches), renamed to Idea Map, questions on edge labels, resolved question shown on edge |

_Current version: v4 — file: `ideaweb_v4.zip`_
