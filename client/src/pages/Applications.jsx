import { useState, useEffect, useRef } from "react";
import api from "../api/axios";
import Navbar from "../components/Navbar";

const Applications = () => {
  const [applications, setApplications] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    fetchApplications();
    intervalRef.current = setInterval(() => {
      fetchApplications(true);
    }, 30000);
    return () => clearInterval(intervalRef.current);
  }, []);

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
    } catch (err) {
      alert("Document not generated yet — run the pipeline first");
    }
  };

  const statusColors = {
    applied: "bg-green-900/40 text-green-400 border-green-800",
    auto_applied: "bg-green-900/40 text-green-400 border-green-800",
    manually_applied: "bg-purple-900/40 text-purple-400 border-purple-800",
    manual_required: "bg-yellow-900/40 text-yellow-400 border-yellow-800",
    pending: "bg-yellow-900/40 text-yellow-400 border-yellow-800",
    skipped: "bg-gray-800 text-gray-500 border-gray-700",
    failed: "bg-red-900/40 text-red-400 border-red-800",
  };

  const statusLabel = {
    auto_applied: "Auto-applied",
    manually_applied: "Manual",
    manual_required: "Needs review",
    pending: "Pending",
    skipped: "Skipped",
    failed: "Failed",
    applied: "Applied",
  };

  // 1. Status filter
  let result =
    filter === "all"
      ? applications
      : filter === "favourites"
        ? applications.filter((a) => a.is_favourite)
        : applications.filter((a) => a.status === filter);

  // 2. Search — title or company
  if (search.trim()) {
    const q = search.toLowerCase();
    result = result.filter(
      (a) =>
        a.title?.toLowerCase().includes(q) ||
        a.company?.toLowerCase().includes(q),
    );
  }

  // 3. Sort by date
  result = [...result].sort((a, b) => {
    const dateA = new Date(a.apply_attempted_at || a.created_at || 0);
    const dateB = new Date(b.apply_attempted_at || b.created_at || 0);
    return sort === "newest" ? dateB - dateA : dateA - dateB;
  });

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">
            Applications
            {result.length > 0 && (
              <span className="ml-2 text-base font-normal text-gray-500">
                ({result.length})
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
        ) : result.length === 0 ? (
          <p className="text-gray-400">
            {search ? `No results for "${search}"` : "No applications found."}
          </p>
        ) : (
          <div className="space-y-3">
            {result.map((app) => (
              <div
                key={app.id}
                className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
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
                    {app.match_score != null ? `${app.match_score}%` : "N/A"} |{" "}
                    {app.salary_min && app.salary_max
                      ? `$${app.salary_min.toLocaleString()} – $${app.salary_max.toLocaleString()}`
                      : "Salary not listed"}
                    {app.apply_attempted_at && (
                      <>
                        {" "}
                        |{" "}
                        {new Date(app.apply_attempted_at).toLocaleDateString(
                          "en-CA",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          },
                        )}
                      </>
                    )}
                  </p>
                  <p className="text-gray-600 text-xs mt-1 line-clamp-1">
                    {app.match_reasoning}
                  </p>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium border ${
                      statusColors[app.status] || statusColors.skipped
                    }`}
                  >
                    {statusLabel[app.status] || app.status}
                  </span>

                  {["applied", "auto_applied", "manually_applied"].includes(
                    app.status,
                  ) && (
                    <>
                      <button
                        onClick={() => downloadDoc("resume", app.job_id)}
                        className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs transition"
                      >
                        Resume
                      </button>
                      <button
                        onClick={() => downloadDoc("cover-letter", app.job_id)}
                        className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs transition"
                      >
                        Cover Letter
                      </button>
                    </>
                  )}

                  <a
                    href={app.url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1 bg-blue-900/40 hover:bg-blue-800/40 border border-blue-800 rounded-lg text-xs text-blue-400 transition"
                  >
                    View Job
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Applications;
