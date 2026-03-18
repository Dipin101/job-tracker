import { useState, useEffect } from "react";
import api from "../api/axios";

const Applications = () => {
  const [applications, setApplications] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    try {
      const res = await api.get("/matching/applications?limit=50");
      setApplications(res.data.applications);
    } catch (err) {
      console.error("Failed to fetch applications:", err);
    } finally {
      setLoading(false);
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
    pending: "bg-yellow-900/40 text-yellow-400 border-yellow-800",
    skipped: "bg-gray-800 text-gray-500 border-gray-700",
    failed: "bg-red-900/40 text-red-400 border-red-800",
  };

  const filtered =
    filter === "all"
      ? applications
      : filter === "favourites"
        ? applications.filter((a) => a.is_favourite)
        : applications.filter((a) => a.status === filter);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Navbar */}
      <nav className="border-b border-gray-800 px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">Job Tracker</h1>
        <div className="flex items-center gap-4">
          <a
            href="/dashboard"
            className="text-gray-400 hover:text-white transition"
          >
            Dashboard
          </a>
          <a
            href="/upload"
            className="text-gray-400 hover:text-white transition"
          >
            Upload CV
          </a>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-10">
        <h2 className="text-2xl font-bold mb-6">Applications</h2>

        {/* Filters */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {["all", "applied", "pending", "skipped", "favourites"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition border ${
                filter === f
                  ? "bg-blue-600 border-transparent text-white"
                  : "bg-transparent border-gray-700 text-gray-400 hover:border-gray-500"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-400">No applications found.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((app) => (
              <div
                key={app.id}
                className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-semibold text-white">{app.title}</h3>
                    {app.is_favourite && (
                      <span className="text-pink-400 text-xs">★ Favourite</span>
                    )}
                  </div>
                  <p className="text-gray-400 text-sm">
                    {app.company} — {app.location}
                  </p>
                  <p className="text-gray-500 text-xs mt-1">
                    Match: {app.match_score}% |{" "}
                    {app.salary_min && app.salary_max
                      ? `$${app.salary_min.toLocaleString()} – $${app.salary_max.toLocaleString()}`
                      : "Salary not listed"}
                  </p>
                  <p className="text-gray-600 text-xs mt-1 line-clamp-1">
                    {app.match_reasoning}
                  </p>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium border capitalize ${
                      statusColors[app.status] || statusColors.skipped
                    }`}
                  >
                    {app.status}
                  </span>

                  {app.status === "applied" && (
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
