import { useState, useEffect, useRef } from "react";
import api from "../api/axios";
import Navbar from "../components/Navbar";

const PAGE_SIZE = 10;

const statusColors = {
  applied: "bg-green-900/40 text-green-400 border-green-800",
  auto_applied: "bg-green-900/40 text-green-400 border-green-800",
  manually_applied: "bg-purple-900/40 text-purple-400 border-purple-800",
  manual_required: "bg-yellow-900/40 text-yellow-400 border-yellow-800",
  pending: "bg-yellow-900/40 text-yellow-400 border-yellow-800",
  skipped: "bg-gray-800 text-gray-500 border-gray-700",
  failed: "bg-red-900/40 text-red-400 border-red-800",
  rejected: "bg-red-900/40 text-red-400 border-red-800",
  not_interested: "bg-gray-800 text-gray-500 border-gray-700",
  interviewing: "bg-blue-900/40 text-blue-400 border-blue-800",
  first_call: "bg-teal-900/40 text-teal-400 border-teal-800",
};

const statusLabel = {
  auto_applied: "Auto-applied",
  manually_applied: "Applied",
  manual_required: "Needs review",
  pending: "Pending",
  skipped: "Skipped",
  failed: "Failed",
  applied: "Applied",
  rejected: "Rejected",
  not_interested: "Not interested",
  interviewing: "Interviewing",
  first_call: "First call",
};

// Formats raw job description text into readable sections
const JobDescription = ({ text }) => {
  if (!text) return null;

  const lines = text.split("\n");
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line) {
      i++;
      continue;
    }

    // Detect section header: short line ending with ":" or all-caps word(s)
    const isHeader =
      (line.endsWith(":") && line.length < 80) ||
      (line === line.toUpperCase() &&
        line.length > 3 &&
        line.length < 60 &&
        /[A-Z]/.test(line));

    // Detect bullet point
    const isBullet = /^[-•*]\s/.test(line) || /^\d+\.\s/.test(line);

    if (isHeader) {
      elements.push(
        <p
          key={i}
          className="text-xs font-semibold text-gray-300 mt-3 mb-1 uppercase tracking-wide"
        >
          {line.replace(/:$/, "")}
        </p>,
      );
    } else if (isBullet) {
      elements.push(
        <div
          key={i}
          className="flex gap-2 text-xs text-gray-400 leading-relaxed"
        >
          <span className="text-gray-600 flex-shrink-0 mt-0.5">·</span>
          <span>{line.replace(/^[-•*]\s/, "").replace(/^\d+\.\s/, "")}</span>
        </div>,
      );
    } else {
      elements.push(
        <p key={i} className="text-xs text-gray-400 leading-relaxed">
          {line}
        </p>,
      );
    }

    i++;
  }

  return <div className="flex flex-col gap-0.5">{elements}</div>;
};

const Applications = () => {
  const [applications, setApplications] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [notesDraft, setNotesDraft] = useState({});
  const [saving, setSaving] = useState({});
  const intervalRef = useRef(null);

  useEffect(() => {
    fetchApplications();
    intervalRef.current = setInterval(() => fetchApplications(true), 30000);
    return () => clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [filter, search, sort]);

  const fetchApplications = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api.get("/matching/applications?limit=200");
      setApplications(res.data.applications);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Failed to fetch applications:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const updateApp = async (appId, payload) => {
    setSaving((prev) => ({ ...prev, [appId]: true }));
    try {
      const res = await api.patch(`/matching/applications/${appId}`, payload);
      const updated = res.data.application;
      setApplications((prev) =>
        prev.map((a) => (a.id === appId ? { ...a, ...updated } : a)),
      );
    } catch (err) {
      console.error("Failed to update application:", err);
      alert("Failed to save — please try again");
    } finally {
      setSaving((prev) => ({ ...prev, [appId]: false }));
    }
  };

  const saveNote = async (appId, note) => {
    await updateApp(appId, { notes: note });
  };

  const downloadDoc = async (type, jobId) => {
    try {
      const res = await api.get(`/documents/${type}/${jobId}/download`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type}-${jobId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Document not generated yet — run the pipeline first");
    }
  };

  const toggleExpand = (appId) => {
    setExpanded((prev) => ({ ...prev, [appId]: !prev[appId] }));
  };

  let filtered =
    filter === "all"
      ? applications
      : filter === "favourites"
        ? applications.filter((a) => a.is_favourite)
        : applications.filter((a) => a.status === filter);

  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (a) =>
        a.title?.toLowerCase().includes(q) ||
        a.company?.toLowerCase().includes(q),
    );
  }

  filtered = [...filtered].sort((a, b) => {
    const dateA = new Date(a.apply_attempted_at || a.created_at || 0);
    const dateB = new Date(b.apply_attempted_at || b.created_at || 0);
    return sort === "newest" ? dateB - dateA : dateA - dateB;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />
      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">
            Applications
            {filtered.length > 0 && (
              <span className="ml-2 text-base font-normal text-gray-500">
                ({filtered.length})
              </span>
            )}
          </h2>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-gray-500">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => fetchApplications(true)}
              disabled={refreshing}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg text-xs text-gray-300 transition flex items-center gap-1.5"
            >
              <span className={refreshing ? "animate-spin inline-block" : ""}>
                ↻
              </span>
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* Search + Sort */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or company…"
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-600 transition"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-600 transition"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>

        {/* Status filters */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {[
            "all",
            "auto_applied",
            "manual_required",
            "manually_applied",
            "first_call",
            "interviewing",
            "rejected",
            "not_interested",
            "pending",
            "skipped",
            "favourites",
          ].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition border ${
                filter === f
                  ? "bg-blue-600 border-transparent text-white"
                  : "bg-transparent border-gray-700 text-gray-400 hover:border-gray-500"
              }`}
            >
              {statusLabel[f] || f}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-400">
            {search ? `No results for "${search}"` : "No applications found."}
          </p>
        ) : (
          <>
            <div className="space-y-3">
              {paginated.map((app) => {
                const isExpanded = expanded[app.id];
                const isSavingThis = saving[app.id];
                const draft = notesDraft[app.id] ?? app.notes ?? "";

                // Status groups drive which actions show
                const isApplied = [
                  "applied",
                  "auto_applied",
                  "manually_applied",
                ].includes(app.status);
                const isManual = app.status === "manual_required";
                // "Not interested" only for undecided states — NOT for manual_required (already has a CTA)
                const canDismiss = ["pending", "skipped", "failed"].includes(
                  app.status,
                );

                const postedDate = app.posted_at
                  ? new Date(app.posted_at).toLocaleDateString("en-CA", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : null;
                const appliedDate = app.apply_attempted_at
                  ? new Date(app.apply_attempted_at).toLocaleDateString(
                      "en-CA",
                      { month: "short", day: "numeric", year: "numeric" },
                    )
                  : null;

                return (
                  <div
                    key={app.id}
                    className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden"
                  >
                    {/* Card header — click to expand */}
                    <div
                      className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-gray-800/30 transition"
                      onClick={() => toggleExpand(app.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-semibold text-white truncate">
                            {app.title}
                          </h3>
                          {app.is_favourite && (
                            <span className="text-pink-400 text-xs flex-shrink-0">
                              ★ Favourite
                            </span>
                          )}
                        </div>
                        <p className="text-gray-400 text-sm">
                          {app.company} — {app.location}
                        </p>
                        <p className="text-gray-500 text-xs mt-1">
                          Match:{" "}
                          {app.match_score != null
                            ? `${app.match_score}%`
                            : "N/A"}
                          {" | "}
                          {app.salary_min && app.salary_max
                            ? `$${app.salary_min.toLocaleString()} – $${app.salary_max.toLocaleString()}`
                            : "Salary not listed"}
                          {postedDate && (
                            <>
                              {" "}
                              |{" "}
                              <span className="text-gray-600">
                                Posted {postedDate}
                              </span>
                            </>
                          )}
                          {appliedDate && (
                            <>
                              {" "}
                              |{" "}
                              <span className="text-gray-600">
                                Applied {appliedDate}
                              </span>
                            </>
                          )}
                        </p>
                        {!isExpanded && app.match_reasoning && (
                          <p className="text-gray-600 text-xs mt-1 line-clamp-1">
                            {app.match_reasoning}
                          </p>
                        )}
                        {app.notes && (
                          <p className="text-gray-500 text-xs mt-1 italic">
                            📝 {app.notes}
                          </p>
                        )}
                      </div>

                      {/* Right side: status badge + job link + chevron — stop propagation so clicks don't expand */}
                      <div
                        className="flex items-center gap-2 flex-shrink-0 flex-wrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium border ${statusColors[app.status] || statusColors.skipped}`}
                        >
                          {statusLabel[app.status] || app.status}
                        </span>
                        {/* ★ Favourite toggle */}
                        <button
                          onClick={() =>
                            updateApp(app.id, {
                              is_favourite: !app.is_favourite,
                            })
                          }
                          disabled={isSavingThis}
                          className={`text-base leading-none transition disabled:opacity-50 ${
                            app.is_favourite
                              ? "text-pink-400 hover:text-pink-300"
                              : "text-gray-600 hover:text-gray-400"
                          }`}
                        >
                          ★
                        </button>

                        <a
                          href={app.url}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1 bg-blue-900/40 hover:bg-blue-800/40 border border-blue-800 rounded-lg text-xs text-blue-400 transition"
                        >
                          View Job ↗
                        </a>

                        <span className="text-gray-600 text-xs ml-1">
                          {isExpanded ? "▲" : "▼"}
                        </span>
                      </div>
                    </div>

                    {/* Expanded panel */}
                    {isExpanded && (
                      <div className="border-t border-gray-800 px-5 py-4 flex flex-col gap-5">
                        {/* ── Action buttons (status-driven) ── */}
                        <div className="flex flex-wrap gap-2">
                          {/* MANUAL REQUIRED: read description, then decide */}
                          {isManual && (
                            <>
                              <button
                                onClick={() =>
                                  updateApp(app.id, {
                                    status: "manually_applied",
                                  })
                                }
                                disabled={isSavingThis}
                                className="px-3 py-1.5 bg-green-900/40 hover:bg-green-800/50 border border-green-800 text-green-400 rounded-lg text-xs transition disabled:opacity-50"
                              >
                                ✓ Mark as Applied
                              </button>
                              <button
                                onClick={() =>
                                  updateApp(app.id, {
                                    status: "not_interested",
                                  })
                                }
                                disabled={isSavingThis}
                                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 rounded-lg text-xs transition disabled:opacity-50"
                              >
                                Not interested
                              </button>
                            </>
                          )}

                          {/* PENDING / SKIPPED / FAILED: can only dismiss */}
                          {canDismiss && (
                            <button
                              onClick={() =>
                                updateApp(app.id, { status: "not_interested" })
                              }
                              disabled={isSavingThis}
                              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 rounded-lg text-xs transition disabled:opacity-50"
                            >
                              Not interested
                            </button>
                          )}

                          {/* POST-APPLY: track what happened */}
                          {isApplied && (
                            <>
                              <button
                                onClick={() =>
                                  updateApp(app.id, { status: "first_call" })
                                }
                                disabled={isSavingThis}
                                className="px-3 py-1.5 bg-teal-900/40 hover:bg-teal-800/50 border border-teal-800 text-teal-400 rounded-lg text-xs transition disabled:opacity-50"
                              >
                                📞 First call
                              </button>
                              <button
                                onClick={() =>
                                  updateApp(app.id, { status: "interviewing" })
                                }
                                disabled={isSavingThis}
                                className="px-3 py-1.5 bg-blue-900/40 hover:bg-blue-800/50 border border-blue-800 text-blue-400 rounded-lg text-xs transition disabled:opacity-50"
                              >
                                🎯 Interviewing
                              </button>
                              <button
                                onClick={() =>
                                  updateApp(app.id, { status: "rejected" })
                                }
                                disabled={isSavingThis}
                                className="px-3 py-1.5 bg-red-900/40 hover:bg-red-800/50 border border-red-800 text-red-400 rounded-lg text-xs transition disabled:opacity-50"
                              >
                                ✕ Rejected
                              </button>
                            </>
                          )}

                          {/* Resume + Cover Letter downloads — shown for applied and manual_required */}
                          {(isApplied || isManual) && (
                            <>
                              <button
                                onClick={() =>
                                  downloadDoc("resume", app.job_id)
                                }
                                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg text-xs transition flex items-center gap-1"
                              >
                                ↓ Resume
                              </button>
                              <button
                                onClick={() =>
                                  downloadDoc("cover-letter", app.job_id)
                                }
                                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg text-xs transition flex items-center gap-1"
                              >
                                ↓ Cover Letter
                              </button>
                            </>
                          )}
                        </div>

                        {/* ── Notes — always available ── */}
                        <div>
                          <p className="text-xs font-medium text-gray-400 mb-1.5">
                            Notes
                          </p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={draft}
                              onChange={(e) =>
                                setNotesDraft((prev) => ({
                                  ...prev,
                                  [app.id]: e.target.value,
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveNote(app.id, draft);
                              }}
                              placeholder="e.g. Too much experience required, French needed…"
                              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-600 transition"
                            />
                            <button
                              onClick={() => saveNote(app.id, draft)}
                              disabled={isSavingThis}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-xs text-white transition"
                            >
                              {isSavingThis ? "Saving…" : "Save"}
                            </button>
                          </div>
                        </div>

                        {/* ── AI reasoning ── */}
                        {app.match_reasoning && (
                          <div>
                            <p className="text-xs font-medium text-gray-400 mb-1">
                              AI reasoning
                            </p>
                            <p className="text-sm text-gray-300 leading-relaxed">
                              {app.match_reasoning}
                            </p>
                          </div>
                        )}

                        {/* ── Skills ── */}
                        <div className="flex gap-6 flex-wrap">
                          {app.matched_skills?.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-gray-400 mb-1">
                                Matched skills
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {app.matched_skills.map((s) => (
                                  <span
                                    key={s}
                                    className="px-2 py-0.5 bg-green-900/30 border border-green-800 text-green-400 text-xs rounded-full"
                                  >
                                    {s}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {app.missing_skills?.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-gray-400 mb-1">
                                Missing skills
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {app.missing_skills.map((s) => (
                                  <span
                                    key={s}
                                    className="px-2 py-0.5 bg-red-900/30 border border-red-800 text-red-400 text-xs rounded-full"
                                  >
                                    {s}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* ── Job description ── */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-medium text-gray-400">
                              Job description
                            </p>
                            {postedDate && (
                              <span className="text-xs text-gray-600">
                                Posted {postedDate}
                              </span>
                            )}
                          </div>
                          <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg px-4 py-3 max-h-64 overflow-y-auto">
                            {app.description ? (
                              <JobDescription text={app.description} />
                            ) : (
                              <p className="text-xs text-gray-600 italic">
                                No description available — view the job posting
                                directly for details.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg text-sm text-gray-300 transition"
                >
                  ← Prev
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(
                      (p) =>
                        p === 1 || p === totalPages || Math.abs(p - page) <= 1,
                    )
                    .reduce((acc, p, idx, arr) => {
                      if (idx > 0 && p - arr[idx - 1] > 1) acc.push("...");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, idx) =>
                      p === "..." ? (
                        <span
                          key={`ellipsis-${idx}`}
                          className="px-2 text-gray-600 text-sm"
                        >
                          …
                        </span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setPage(p)}
                          className={`w-8 h-8 rounded-lg text-sm transition ${
                            page === p
                              ? "bg-blue-600 text-white"
                              : "bg-gray-800 hover:bg-gray-700 text-gray-400"
                          }`}
                        >
                          {p}
                        </button>
                      ),
                    )}
                </div>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg text-sm text-gray-300 transition"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Applications;
