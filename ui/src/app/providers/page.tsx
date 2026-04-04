"use client";

import { useEffect, useState } from "react";
import { listProviders } from "@/lib/api";
import type { Provider } from "@/lib/api";

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", type: "openai", credential: "" });
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      const data = await listProviders();
      setProviders(data.providers);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          credentials: { API_KEY: form.credential },
        }),
      });
      if (!res.ok) throw new Error("Failed to create provider");
      setShowAdd(false);
      setForm({ name: "", type: "openai", credential: "" });
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    }
    setSubmitting(false);
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete provider "${name}"?`)) return;
    try {
      await fetch(`/api/providers/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      load();
    } catch {}
  };

  const providerTypes = [
    { value: "openai", label: "OpenAI / NVIDIA NIM" },
    { value: "anthropic", label: "Anthropic" },
    { value: "ollama", label: "Ollama (local)" },
    { value: "vllm", label: "vLLM (local)" },
  ];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Providers</h1>
          <p className="text-sm text-zinc-500 mt-1">
            API key providers for inference routing
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
        >
          {showAdd ? "Cancel" : "Add Provider"}
        </button>
      </div>

      {/* Add provider form */}
      {showAdd && (
        <form
          onSubmit={handleAdd}
          className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-4 space-y-3"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. nvidia-nim"
                required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                {providerTypes.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">
                API Key
              </label>
              <input
                type="password"
                value={form.credential}
                onChange={(e) =>
                  setForm({ ...form, credential: e.target.value })
                }
                placeholder="sk-... or nvapi-..."
                required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-md text-sm font-medium transition-colors"
          >
            {submitting ? "Creating..." : "Create Provider"}
          </button>
        </form>
      )}

      {/* Provider list */}
      <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-zinc-500">
            Loading...
          </div>
        ) : providers.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500">
            No providers configured
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700/50 text-xs text-zinc-500 uppercase tracking-wider">
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Type</th>
                <th className="text-left p-3 font-medium">Credential</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <tr
                  key={p.id || p.name}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                >
                  <td className="p-3 font-medium text-zinc-200">{p.name}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 bg-zinc-700/50 rounded text-xs text-zinc-300">
                      {p.type}
                    </span>
                  </td>
                  <td className="p-3 text-zinc-500 font-mono text-xs">
                    {Object.keys(p.config || {}).length > 0
                      ? Object.entries(p.config)
                          .map(([k, v]) => `${k}=${v.slice(0, 30)}...`)
                          .join(", ")
                      : "configured"}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => handleDelete(p.name)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
