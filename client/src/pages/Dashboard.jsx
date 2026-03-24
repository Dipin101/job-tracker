import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";
import Navbar from "../components/Navbar";

const STATUS_META = {
  auto_applied: { label: "Auto-applied", dot: "bg-green-400" },
  manual_required: { label: "Needs review", dot: "bg-yellow-400" },
  failed: { label: "Failed", dot: "bg-red-400" },
  pending: { label: "Pending", dot: "bg-blue-400" },
  skipped: { label: "Skipped", dot: "bg-gray-500" },
  manually_applied: { label: "Manual", dot: "bg-purple-400" },
};

const killSwitchColors = {
  active: "bg-green-600",
  paused: "bg-yellow-600",
  interviewing: "bg-blue-600",
  employed: "bg-gray-600",
};

const STAGES = ["fetch", "match", "apply", "done"];
const Dashboard = () => {
  const { user, pipelineRunning, setPipelineRunning } = useAuth();
  const [status, setStatus] = useState("active");
  const [stats, setStats] = useState(null);
  const [currentStage, setCurrentStage] = useState(null);
  const [log, setLog] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [pipelineStats, setPipelineStats] = useState(null);
  const [error, setError] = useState(null);
  const logRef = useRef(null);

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const fetchStats = async () => {
    try {
      const res = await api.get("/matching/applications");
      const apps = res.data.applications;
      setStats({
        total: apps.length,
        applied: apps.filter((a) =>
          ["applied", "auto_applied", "manually_applied"].includes(a.status),
        ).length,
        pending: apps.filter((a) => a.status === "pending").length,
        skipped: apps.filter((a) => a.status === "skipped").length,
        favourites: apps.filter((a) => a.is_favourite).length,
      });
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  };

  const runPipeline = async () => {
    if (status === "employed" || status === "paused") return;

    setPipelineRunning(true);
    setLog([]);
    setJobs([]);
    setPipelineStats(null);
    setError(null);
    setCurrentStage("fetch");

    const addLog = (msg, type = "info") =>
      setLog((prev) => [
        ...prev,
        { msg, type, ts: new Date().toLocaleTimeString() },
      ]);

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api/pipeline/run`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
          },
          credentials: "include",
          body: JSON.stringify({ userId: user?.id }),
        },
      );

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            setCurrentStage(evt.stage);
            addLog(
              evt.message,
              evt.status === "error"
                ? "error"
                : evt.status === "complete"
                  ? "success"
                  : "info",
            );

            if (evt.stage === "apply" && evt.data?.jobId) {
              setJobs((prev) => {
                const exists = prev.find((j) => j.id === evt.data.jobId);
                if (exists)
                  return prev.map((j) =>
                    j.id === evt.data.jobId ? { ...j, ...evt.data } : j,
                  );
                return [
                  {
                    id: evt.data.jobId,
                    title: evt.data.title,
                    company: evt.data.company,
                    status: evt.data.status,
                    match_score: evt.data.matchScore,
                  },
                  ...prev,
                ];
              });
            }

            if (evt.stage === "done" && evt.data) {
              setPipelineStats({
                fetched: evt.data.fetchedCount,
                matched: evt.data.processed,
                autoApplied: evt.data.autoApplied,
                manualRequired: evt.data.manualRequired,
                failed: evt.data.failed,
              });
              if (evt.data.jobs?.length) setJobs(evt.data.jobs);
              fetchStats();
            }
          } catch {
            /* malformed SSE line */
          }
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setPipelineRunning(false);
    }
  };

  //updating status
  const updateStatus = async (newStatus) => {
    try {
      await api.post("/engine/status", { status: newStatus });
      setStatus(newStatus);
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  const stageIndex = STAGES.indexOf(currentStage);
  const pipelineDisabled =
    pipelineRunning || status === "employed" || status === "paused";
  const pipelineLabel = pipelineRunning
    ? "Running..."
    : status === "employed"
      ? "Disabled (employed)"
      : status === "paused"
        ? "Paused"
        : "Run Pipeline";

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Run Pipeline</h2>
            {status === "paused" && (
              <span className="text-xs text-yellow-400 border border-yellow-800 rounded px-2 py-1">
                Paused
              </span>
            )}
            {status === "interviewing" && (
              <span className="text-xs text-blue-400 border border-blue-800 rounded px-2 py-1">
                Interviewing mode
              </span>
            )}
          </div>

          <p className="text-gray-400 text-sm mb-4">
            Fetches new jobs, matches them to your CV, generates documents and
            applies automatically.
          </p>

          <button
            onClick={runPipeline}
            disabled={pipelineDisabled}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-semibold transition"
          >
            {pipelineLabel}
          </button>

          {/* Stage progress bar */}
          {(pipelineRunning || currentStage) && (
            <div className="mt-6">
              <div className="flex items-center gap-0 mb-4">
                {STAGES.map((s, i) => {
                  const isDone = stageIndex > i || currentStage === "done";
                  const isActive = currentStage === s && s !== "done";
                  return (
                    <div key={s} className="flex items-center flex-1">
                      {i > 0 && (
                        <div
                          className={`h-0.5 flex-1 transition-all duration-500 ${isDone ? "bg-green-500" : "bg-gray-700"}`}
                        />
                      )}
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium border transition-all duration-300 flex-shrink-0 ${
                          isDone
                            ? "bg-green-600 border-green-600 text-white"
                            : isActive
                              ? "bg-blue-600 border-blue-600 text-white animate-pulse"
                              : "bg-gray-800 border-gray-700 text-gray-500"
                        }`}
                      >
                        {isDone ? "✓" : i + 1}
                      </div>
                      {i < STAGES.length - 1 && (
                        <div
                          className={`h-0.5 flex-1 transition-all duration-500 ${isDone ? "bg-green-500" : "bg-gray-700"}`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-xs text-gray-500 px-1 mb-4">
                {["Fetch", "Match", "Apply", "Done"].map((l) => (
                  <span key={l}>{l}</span>
                ))}
              </div>

              {/* Live log */}
              <div
                ref={logRef}
                className="bg-gray-950 border border-gray-800 rounded-lg p-3 max-h-32 overflow-y-auto flex flex-col gap-1"
              >
                {log.map((l, i) => (
                  <div key={i} className="flex gap-3 text-xs">
                    <span className="text-gray-600 flex-shrink-0">{l.ts}</span>
                    <span
                      className={
                        l.type === "error"
                          ? "text-red-400"
                          : l.type === "success"
                            ? "text-green-400"
                            : "text-gray-400"
                      }
                    >
                      {l.msg}
                    </span>
                  </div>
                ))}
                {log.length === 0 && (
                  <span className="text-xs text-gray-600">Starting…</span>
                )}
              </div>
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

          {/* Pipeline summary stats */}
          {pipelineStats && (
            <div className="grid grid-cols-5 gap-3 mt-5">
              {[
                { label: "Fetched", value: pipelineStats.fetched },
                { label: "Matched", value: pipelineStats.matched },
                {
                  label: "Auto-applied",
                  value: pipelineStats.autoApplied,
                  color: "text-green-400",
                },
                {
                  label: "Needs review",
                  value: pipelineStats.manualRequired,
                  color: "text-yellow-400",
                },
                {
                  label: "Failed",
                  value: pipelineStats.failed,
                  color: "text-red-400",
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className="bg-gray-800 rounded-lg p-3 text-center"
                >
                  <div
                    className={`text-xl font-bold ${s.color || "text-white"}`}
                  >
                    {s.value ?? "—"}
                  </div>
                  <div className="text-gray-500 text-xs mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Applied jobs */}
        {jobs.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">
              This run — {jobs.length} job{jobs.length !== 1 ? "s" : ""}
            </h2>
            <div className="flex flex-col gap-3">
              {jobs.map((job) => {
                const meta = STATUS_META[job.status] || STATUS_META.skipped;
                return (
                  <div
                    key={job.id}
                    className="bg-gray-800 rounded-xl p-4 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">
                        {job.title}
                      </div>
                      <div className="text-gray-400 text-xs mt-0.5">
                        {job.company}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {job.match_score != null && (
                        <span
                          className={`text-sm font-semibold ${job.match_score >= 70 ? "text-green-400" : job.match_score >= 55 ? "text-yellow-400" : "text-gray-400"}`}
                        >
                          {job.match_score}%
                        </span>
                      )}
                      <span className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-gray-700">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${meta.dot}`}
                        />
                        {meta.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
                    ? `${killSwitchColors[s]} border-transparent text-white`
                    : "bg-transparent border-gray-700 text-gray-400 hover:border-gray-500"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <p className="text-gray-500 text-xs mt-3">
            "Paused" and "employed" disable the pipeline entirely.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
