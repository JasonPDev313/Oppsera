import { useState } from "react";

const phases = [
  { id: 0, label: "Phase 0", name: "Eval Infrastructure", color: "#ef4444", sessions: ["0", "0.5"] },
  { id: 1, label: "Phase 1", name: "Core Semantic Layer", color: "#3b82f6", sessions: ["1", "2", "3", "4"] },
  { id: 2, label: "Phase 2", name: "Datasets + Lenses", color: "#8b5cf6", sessions: ["5", "6"] },
  { id: 3, label: "Phase 3", name: "Frontend + Polish", color: "#10b981", sessions: ["7", "8", "9", "10"] },
];

const sessions = {
  "0": { name: "Eval DB + Capture", files: 15, desc: "semantic_eval_turns, capture service, feedback commands, quality scoring", layer: "backend" },
  "0.5": { name: "Super Admin Panel", files: 32, desc: "apps/admin/ scaffold, platform auth, eval feed, review UI, quality dashboard, golden examples", layer: "admin" },
  "1": { name: "Schema + Registry", files: 11, desc: "semantic_metrics, dimensions, entities, join graph, TypeScript registry, compact dictionary", layer: "backend" },
  "2": { name: "Query Engine", files: 10, desc: "Plan→SQL compiler, comparison semantics, permission filter, PII guard, read-only execution", layer: "backend" },
  "3": { name: "LLM Integration", files: 13, desc: "Contract of Truth, prompt builder, OpenAI + Anthropic providers, clarification rules, conversation manager", layer: "backend" },
  "4": { name: "API Routes + Security", files: 20, desc: "REST endpoints, query budget, read-only guard, entitlements, audit logging", layer: "backend" },
  "5": { name: "Golf Analytics", files: 9, desc: "30+ golf metrics (RevPATT, utilization, pace), golf dimensions, entities, join paths", layer: "backend" },
  "6": { name: "Custom Lenses", files: 16, desc: "Lens engine, narrative builder, CFO/Golf GM/VP Revenue/Inventory/Board lenses, playbooks", layer: "backend" },
  "7": { name: "Chat UI + Frontend", files: 23, desc: "ChatPanel, ResultPanel, FeedbackWidget, MetricPicker, FilterBuilder, lens selector", layer: "frontend" },
  "8": { name: "Performance + Cache", files: 9, desc: "Registry cache, query cache, LLM context cache, indexes, query optimizer, observability", layer: "backend" },
  "9": { name: "E2E Tests", files: 9, desc: "F&B sales flow, golf utilization, inventory latest, clarification flow, security tests", layer: "tests" },
  "10": { name: "Final Wiring + Docs", files: 12, desc: "Sync script, entitlements, events, CLAUDE.md updates, CONVENTIONS.md §51-57", layer: "docs" },
};

const architecture = {
  apps: [
    {
      name: "apps/web/",
      subtitle: "Customer App",
      domain: "app.oppsera.com",
      color: "#3b82f6",
      features: ["Chat Interface", "Data Explorer", "Lens Selector", "FeedbackWidget", "Result Panels"],
    },
    {
      name: "apps/admin/",
      subtitle: "Super Admin Panel",
      domain: "admin.oppsera.com",
      color: "#ef4444",
      features: ["Eval Feed (cross-tenant)", "Turn Review + Scoring", "Quality Dashboard", "Golden Examples", "Pattern Analysis"],
    },
  ],
  packages: [
    {
      name: "packages/modules/semantic/",
      color: "#8b5cf6",
      modules: [
        { name: "registry/", desc: "Metrics, dimensions, entities, join graph" },
        { name: "engine/", desc: "Query compiler, executor, permissions, PII" },
        { name: "llm/", desc: "Providers, prompts, validation, conversation" },
        { name: "lenses/", desc: "Lens engine, narrative builder, playbooks" },
        { name: "evaluation/", desc: "Capture, feedback, examples, aggregation" },
        { name: "cache/", desc: "Registry, query, LLM context caching" },
        { name: "security/", desc: "Read-only guard, query budget" },
      ],
    },
    {
      name: "packages/db/",
      color: "#f59e0b",
      modules: [
        { name: "schema/semantic.ts", desc: "7 semantic tables" },
        { name: "schema/evaluation.ts", desc: "4 eval tables" },
        { name: "schema/semantic-lenses.ts", desc: "3 lens tables" },
        { name: "schema/platform.ts", desc: "platform_admins" },
      ],
    },
  ],
};

const dataFlow = [
  { from: "User asks question", to: "ChatPanel", type: "input" },
  { from: "ChatPanel", to: "POST /semantic/chat", type: "api" },
  { from: "POST /semantic/chat", to: "ConversationManager", type: "internal" },
  { from: "ConversationManager", to: "LLM Provider", type: "external" },
  { from: "LLM Provider", to: "Plan + Rationale (JSON)", type: "response" },
  { from: "Plan + Rationale", to: "Plan Validator", type: "internal" },
  { from: "Plan Validator", to: "Query Compiler", type: "internal" },
  { from: "Query Compiler", to: "Parameterized SQL", type: "output" },
  { from: "Parameterized SQL", to: "Query Executor (read-only role)", type: "internal" },
  { from: "Query Executor", to: "rm_* tables (Postgres)", type: "db" },
  { from: "Query Results", to: "Lens Engine", type: "internal" },
  { from: "Lens Engine", to: "Narrative Builder (LLM)", type: "external" },
  { from: "Narrative", to: "EvalCaptureService.recordTurn()", type: "internal" },
  { from: "Response", to: "ResultPanel + FeedbackWidget", type: "output" },
];

const securityLayers = [
  { name: "Contract of Truth", desc: "LLM can't invent data, write SQL, or hallucinate slugs", icon: "📜" },
  { name: "Plan Validation", desc: "Zod schema + registry cross-reference strips unknown slugs", icon: "✅" },
  { name: "Dynamic Whitelist", desc: "Only tables in registry are queryable — built at runtime", icon: "📋" },
  { name: "SET LOCAL ROLE", desc: "semantic_readonly — DB physically prevents writes", icon: "🔒" },
  { name: "Regex Guard", desc: "Defense-in-depth scan for INSERT/UPDATE/DELETE/DROP", icon: "🛡" },
  { name: "Tenant Isolation", desc: "tenant_id always injected by compiler, never from user", icon: "🏢" },
  { name: "Query Budget", desc: "100/hr/tenant, 10s timeout, 10K row max", icon: "⏱" },
  { name: "PII Masking", desc: "Redact/hash/truncate based on field + role", icon: "🙈" },
];

const TabButton = ({ active, onClick, children, count }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
      active ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-200"
    }`}
  >
    {children}
    {count && <span className="ml-1.5 text-xs opacity-60">({count})</span>}
  </button>
);

const Badge = ({ color, children }) => (
  <span
    className="px-2 py-0.5 rounded-full text-xs font-medium"
    style={{ backgroundColor: color + "20", color }}
  >
    {children}
  </span>
);

export default function OppsEraArchViz() {
  const [tab, setTab] = useState("overview");
  const [hoveredSession, setHoveredSession] = useState(null);
  const [expandedModule, setExpandedModule] = useState(null);

  const totalFiles = Object.values(sessions).reduce((sum, s) => sum + s.files, 0);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-lg">✨</div>
            <div>
              <h1 className="text-2xl font-bold text-white">OppsEra Assistant Module</h1>
              <p className="text-gray-400 text-sm">Semantic Layer + LLM Query Engine + Eval Infrastructure</p>
            </div>
          </div>
          <div className="flex gap-4 mt-4 text-sm text-gray-400">
            <span>📦 <strong className="text-gray-200">12</strong> build sessions</span>
            <span>📄 <strong className="text-gray-200">~{totalFiles}</strong> files</span>
            <span>🧱 <strong className="text-gray-200">15</strong> DB tables</span>
            <span>🏗 <strong className="text-gray-200">2</strong> Next.js apps</span>
            <span>📊 <strong className="text-gray-200">50+</strong> metrics</span>
          </div>
        </div>

        {/* Tab Nav */}
        <div className="flex gap-1 bg-gray-900 rounded-xl p-1 mb-6 overflow-x-auto">
          <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>Build Timeline</TabButton>
          <TabButton active={tab === "architecture"} onClick={() => setTab("architecture")}>Architecture</TabButton>
          <TabButton active={tab === "dataflow"} onClick={() => setTab("dataflow")}>Data Flow</TabButton>
          <TabButton active={tab === "security"} onClick={() => setTab("security")}>Security Layers</TabButton>
          <TabButton active={tab === "files"} onClick={() => setTab("files")}>File Tree</TabButton>
        </div>

        {/* BUILD TIMELINE */}
        {tab === "overview" && (
          <div className="space-y-6">
            {phases.map((phase) => (
              <div key={phase.id} className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-2 h-8 rounded-full" style={{ backgroundColor: phase.color }} />
                  <div>
                    <span className="text-xs font-mono uppercase tracking-wider" style={{ color: phase.color }}>{phase.label}</span>
                    <h2 className="text-lg font-semibold text-white">{phase.name}</h2>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {phase.sessions.map((sid) => {
                    const s = sessions[sid];
                    const layerColors = { backend: "#3b82f6", admin: "#ef4444", frontend: "#10b981", tests: "#f59e0b", docs: "#8b5cf6" };
                    return (
                      <div
                        key={sid}
                        className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-gray-500 transition-all cursor-pointer"
                        onMouseEnter={() => setHoveredSession(sid)}
                        onMouseLeave={() => setHoveredSession(null)}
                        style={hoveredSession === sid ? { borderColor: phase.color } : {}}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono bg-gray-700 px-2 py-0.5 rounded">S{sid}</span>
                            <span className="font-medium text-white">{s.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge color={layerColors[s.layer]}>{s.layer}</Badge>
                            <span className="text-xs text-gray-500">{s.files} files</span>
                          </div>
                        </div>
                        <p className="text-sm text-gray-400 leading-relaxed">{s.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Dependency arrows */}
            <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
              <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">Dependency Chain</h3>
              <div className="font-mono text-sm text-gray-400 space-y-1">
                <p><span className="text-red-400">S0</span> → <span className="text-red-400">S0.5</span> <span className="text-gray-600">(admin panel needs eval DB)</span></p>
                <p><span className="text-red-400">S0</span> → <span className="text-blue-400">S1</span> → <span className="text-blue-400">S2</span> → <span className="text-blue-400">S3</span> → <span className="text-blue-400">S4</span> <span className="text-gray-600">(core layer chain)</span></p>
                <p><span className="text-blue-400">S1</span> → <span className="text-purple-400">S5</span> <span className="text-gray-600">(golf extends registry)</span></p>
                <p><span className="text-blue-400">S1-4</span> → <span className="text-purple-400">S6</span> <span className="text-gray-600">(lenses need full engine)</span></p>
                <p><span className="text-red-400">S0</span> + <span className="text-purple-400">S1-6</span> → <span className="text-green-400">S7</span> <span className="text-gray-600">(frontend needs everything)</span></p>
                <p><span className="text-purple-400">S5</span> + <span className="text-green-400">S8</span> <span className="text-gray-600">can run in parallel</span></p>
              </div>
            </div>
          </div>
        )}

        {/* ARCHITECTURE */}
        {tab === "architecture" && (
          <div className="space-y-6">
            {/* Apps */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {architecture.apps.map((app) => (
                <div key={app.name} className="bg-gray-900 rounded-2xl p-5 border-2" style={{ borderColor: app.color + "40" }}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: app.color }} />
                    <span className="font-mono text-sm" style={{ color: app.color }}>{app.name}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-1">{app.subtitle}</h3>
                  <p className="text-xs text-gray-500 mb-3 font-mono">{app.domain}</p>
                  <div className="flex flex-wrap gap-2">
                    {app.features.map((f) => (
                      <span key={f} className="text-xs bg-gray-800 text-gray-300 px-2.5 py-1 rounded-lg">{f}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Shared Packages */}
            {architecture.packages.map((pkg) => (
              <div key={pkg.name} className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: pkg.color }} />
                  <span className="font-mono text-sm font-medium" style={{ color: pkg.color }}>{pkg.name}</span>
                  <span className="text-xs text-gray-500">shared by both apps</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {pkg.modules.map((m) => (
                    <div
                      key={m.name}
                      className="bg-gray-800 rounded-lg p-3 border border-gray-700 hover:border-gray-500 transition-colors cursor-pointer"
                      onClick={() => setExpandedModule(expandedModule === m.name ? null : m.name)}
                    >
                      <div className="font-mono text-xs text-gray-300 mb-1">{m.name}</div>
                      <div className="text-xs text-gray-500">{m.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* DB Tables summary */}
            <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
              <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">New Database Tables (15)</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {[
                  "semantic_metrics", "semantic_dimensions", "semantic_entities", "semantic_join_paths",
                  "semantic_filters", "semantic_metric_permissions", "semantic_dimension_permissions",
                  "semantic_pii_fields", "semantic_eval_sessions", "semantic_eval_turns",
                  "semantic_eval_examples", "semantic_eval_quality_daily", "semantic_lenses",
                  "semantic_lens_packs", "platform_admins"
                ].map((t) => (
                  <div key={t} className="bg-gray-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-amber-300/80 border border-gray-700">
                    {t}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* DATA FLOW */}
        {tab === "dataflow" && (
          <div className="space-y-1">
            <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800 mb-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-1 uppercase tracking-wider">Query Flow: User Question → Answer</h3>
              <p className="text-xs text-gray-500 mb-4">Every step from natural language to data-backed narrative</p>
            </div>
            {dataFlow.map((step, i) => {
              const typeColors = {
                input: { bg: "#10b981", label: "USER" },
                api: { bg: "#3b82f6", label: "API" },
                internal: { bg: "#8b5cf6", label: "INTERNAL" },
                external: { bg: "#f59e0b", label: "LLM" },
                response: { bg: "#06b6d4", label: "RESPONSE" },
                output: { bg: "#10b981", label: "OUTPUT" },
                db: { bg: "#ef4444", label: "DATABASE" },
              };
              const tc = typeColors[step.type];
              return (
                <div key={i} className="flex items-stretch">
                  {/* Vertical line */}
                  <div className="flex flex-col items-center mr-4 w-8">
                    <div className="w-3 h-3 rounded-full border-2 flex-shrink-0" style={{ borderColor: tc.bg, backgroundColor: i === 0 || i === dataFlow.length - 1 ? tc.bg : "transparent" }} />
                    {i < dataFlow.length - 1 && <div className="w-0.5 flex-1 bg-gray-700" />}
                  </div>
                  {/* Content */}
                  <div className="bg-gray-900 rounded-xl p-3 mb-1 flex-1 border border-gray-800 flex items-center gap-3">
                    <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ backgroundColor: tc.bg + "20", color: tc.bg }}>{tc.label}</span>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-300 font-medium">{step.from}</span>
                      <span className="text-gray-600">→</span>
                      <span className="text-gray-400">{step.to}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Feedback loop */}
            <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800 mt-6">
              <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">Feedback Flywheel</h3>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {[
                  { text: "User rates response", icon: "⭐" },
                  { text: "Stored in eval_turns", icon: "💾" },
                  { text: "Admin reviews in admin panel", icon: "👀" },
                  { text: "Good turns promoted to golden examples", icon: "🏆" },
                  { text: "Examples fed to LLM prompt builder", icon: "🤖" },
                  { text: "Better answers next time", icon: "📈" },
                ].map((step, i) => (
                  <div key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-gray-600 mx-1">→</span>}
                    <span className="bg-gray-800 px-3 py-1.5 rounded-lg text-gray-300 border border-gray-700">
                      {step.icon} {step.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SECURITY */}
        {tab === "security" && (
          <div className="space-y-3">
            <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800 mb-2">
              <h3 className="text-sm font-semibold text-gray-300 mb-1 uppercase tracking-wider">8 Security Layers</h3>
              <p className="text-xs text-gray-500">Defense-in-depth: LLM never writes SQL, DB physically prevents writes, every query is tenant-scoped</p>
            </div>
            {securityLayers.map((layer, i) => (
              <div key={i} className="bg-gray-900 rounded-xl p-4 border border-gray-800 flex items-start gap-4">
                <div className="text-2xl flex-shrink-0 w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center">{layer.icon}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-gray-500">Layer {i + 1}</span>
                    <h4 className="font-medium text-white">{layer.name}</h4>
                  </div>
                  <p className="text-sm text-gray-400">{layer.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* FILE TREE */}
        {tab === "files" && (
          <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
            <h3 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider">New Files by Location</h3>
            <div className="font-mono text-sm space-y-4">
              {[
                {
                  root: "packages/db/",
                  color: "#f59e0b",
                  files: [
                    "src/schema/semantic.ts",
                    "src/schema/evaluation.ts",
                    "src/schema/semantic-lenses.ts",
                    "src/schema/platform.ts",
                    "migrations/NNNN_semantic_layer.sql",
                    "migrations/NNNN_evaluation_layer.sql",
                    "migrations/NNNN_semantic_lenses.sql",
                    "migrations/NNNN_platform_admins.sql",
                    "migrations/NNNN_semantic_performance_indexes.sql",
                  ]
                },
                {
                  root: "packages/modules/semantic/",
                  color: "#8b5cf6",
                  files: [
                    "src/registry/ (metrics, dimensions, entities, join-graph, golf-*, index)",
                    "src/engine/ (compiler, executor, permissions, pii, comparisons, optimizer)",
                    "src/llm/ (types, contract, prompt-builder, providers/*, validator, clarification, conversation, audit)",
                    "src/lenses/ (types, engine, narrative, builtins, commands/*, queries/*, validation, safety)",
                    "src/evaluation/ (types, capture, feedback, queries, aggregation, examples, validation)",
                    "src/cache/ (registry, query, llm-context, warming)",
                    "src/security/ (query-budget, read-only-guard)",
                    "src/validation/ (query-plan, api-schemas, metric-schemas, chat-schemas)",
                    "src/commands/ (create-metric, update-metric, set-permissions, etc.)",
                    "src/queries/ (list-metrics, suggest-items, get-definition, etc.)",
                    "src/monitoring/ (query-metrics)",
                    "src/sync/ (sync-registry, golf-seed)",
                    "src/setup/ (register-entitlements, register-events)",
                    "src/examples/ (e2e-fnb-sales, e2e-golf, e2e-inventory, e2e-clarification)",
                    "src/__tests__/ (registry, query-engine, conversation, lenses, security)",
                  ]
                },
                {
                  root: "apps/web/src/",
                  color: "#3b82f6",
                  files: [
                    "app/(dashboard)/insights/ (page, explore, lenses, history, layout)",
                    "app/api/v1/semantic/ (metrics, dimensions, filters, query, chat, suggest, definitions, lenses, admin/*)",
                    "app/api/v1/semantic/eval/turns/[id]/feedback/ (user feedback only)",
                    "components/insights/ (ChatPanel, ResultPanel, FeedbackWidget, LensSelector, MetricPicker, FilterBuilder, etc.)",
                    "hooks/ (use-semantic, use-chat, use-lenses, use-feedback)",
                    "types/insights.ts",
                  ]
                },
                {
                  root: "apps/admin/src/",
                  color: "#ef4444",
                  files: [
                    "app/layout.tsx, page.tsx, login/page.tsx",
                    "app/(admin)/layout.tsx (sidebar, tenant selector)",
                    "app/(admin)/eval/ (feed, turns/[id], dashboard, examples)",
                    "app/api/auth/ (login, logout, session)",
                    "app/api/v1/eval/ (feed, turns, review, promote, dashboard, examples, patterns, compare)",
                    "components/eval/ (TurnCard, PlanViewer, SqlViewer, KpiCard, Stars, Verdict, Flags)",
                    "components/shared/ (TenantSelector, AdminSidebar)",
                    "hooks/ (use-admin-auth, use-eval, use-tenants)",
                    "lib/auth.ts, middleware.ts",
                  ]
                },
              ].map((group) => (
                <div key={group.root}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: group.color }} />
                    <span className="font-semibold" style={{ color: group.color }}>{group.root}</span>
                  </div>
                  <div className="ml-6 space-y-0.5">
                    {group.files.map((f, i) => (
                      <div key={i} className="text-gray-400 text-xs">{f}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
