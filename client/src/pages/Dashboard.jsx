import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";

const Dashboard = () => {
  const { logout } = useAuth();
  const [status, setStatus] = useState("active");
  const [stats, setStats] = useState(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await api.get("/matching/applications");
      const apps = res.data.applications;
      setStats({
        total: apps.length,
        applied: apps.filter((a) => a.status === "applied").length,
        pending: apps.filter((a) => a.status === "pending").length,
        skipped: apps.filter((a) => a.status === "skipped").length,
        favourites: apps.filter((a) => a.is_favourite).length,
      });
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  };

  const runPipeline = async () => {
    setRunning(true);
    setMessage("");
    try {
      const res = await api.post("/engine/run");
      if (res.data.skipped) {
        setMessage(`Pipeline skipped: ${res.data.reason}`);
      } else {
        setMessage(
          `Pipeline complete — Applied: ${res.data.applied} | Matched: ${res.data.matched} | Failed: ${res.data.failed}`,
        );
        fetchStats();
      }
    } catch (err) {
      setMessage("Pipeline failed — check console");
    } finally {
      setRunning(false);
    }
  };

  const updateStatus = async (newStatus) => {
    try {
      await api.post("/engine/status", { status: newStatus });
      setStatus(newStatus);
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  const statusColors = {
    active: "bg-green-600",
    paused: "bg-yellow-600",
    interviewing: "bg-blue-600",
    employed: "bg-gray-600",
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Navbar */}
      <nav className="border-b border-gray-800 px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">Job Tracker</h1>
        <div className="flex items-center gap-4">
          <a
            href="/applications"
            className="text-gray-400 hover:text-white transition"
          >
            Applications
          </a>
          <a
            href="/upload"
            className="text-gray-400 hover:text-white transition"
          >
            Upload CV
          </a>
          <button
            onClick={logout}
            className="text-gray-400 hover:text-red-400 transition text-sm"
          >
            Logout
          </button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            {[
              { label: "Total", value: stats.total, color: "text-white" },
              {
                label: "Applied",
                value: stats.applied,
                color: "text-green-400",
              },
              {
                label: "Pending",
                value: stats.pending,
                color: "text-yellow-400",
              },
              {
                label: "Skipped",
                value: stats.skipped,
                color: "text-gray-400",
              },
              {
                label: "Favourites",
                value: stats.favourites,
                color: "text-pink-400",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center"
              >
                <div className={`text-3xl font-bold ${stat.color}`}>
                  {stat.value}
                </div>
                <div className="text-gray-400 text-sm mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Pipeline */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Run Pipeline</h2>
          <p className="text-gray-400 text-sm mb-4">
            Fetches new jobs, matches them to your CV, generates documents and
            applies automatically.
          </p>
          <button
            onClick={runPipeline}
            disabled={running || status === "employed"}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-semibold transition"
          >
            {running ? "Running..." : "Run Pipeline"}
          </button>
          {message && <p className="mt-3 text-sm text-gray-300">{message}</p>}
        </div>

        {/* Kill Switch */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4">Job Search Status</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {["active", "paused", "interviewing", "employed"].map((s) => (
              <button
                key={s}
                onClick={() => updateStatus(s)}
                className={`py-3 rounded-lg font-medium capitalize transition border ${
                  status === s
                    ? `${statusColors[s]} border-transparent text-white`
                    : "bg-transparent border-gray-700 text-gray-400 hover:border-gray-500"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <p className="text-gray-500 text-xs mt-3">
            Setting to "employed" disables the pipeline entirely.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
