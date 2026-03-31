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
const STAGE_CYCLE_MS = 4000;

const Dashboard = () => {
  const { user, pipelineRunning, setPipelineRunning } = useAuth();
  const [status, setStatus] = useState("active");
  const [stats, setStats] = useState(null);
  const [currentStage, setCurrentStage] = useState(null);
  const [log, setLog] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [pipelineStats, setPipelineStats] = useState(null);
  const [error, setError] = useState(null);
  const [cronRunning, setCronRunning] = useState(false); // cron awareness
  const logRef = useRef(null);
  const stageCycleRef = useRef(null);
  const pipelineRunningRef = useRef(false);
  const cronRunningRef = useRef(false);

  useEffect(() => {
    fetchStats();
    fetchLatestJobs();
    checkPipelineStatus();

    const interval = setInterval(() => {
      fetchStats();
      fetchLatestJobs();
      checkPipelineStatus();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  useEffect(() => {
    return () => {
      if (stageCycleRef.current) clearInterval(stageCycleRef.current);
    };
  }, []);

  // ── Check if cron is running in background ──────────────────────────────────
  const checkPipelineStatus = async () => {
    try {
      const res = await api.get("/pipeline/status");
      const running = res.data.running;

      if (running && !pipelineRunningRef.current) {
        // cron just started — show it in UI
        pipelineRunningRef.current = true;
        cronRunningRef.current = true;
        setCronRunning(true);
        setPipelineRunning(true);
        startStageCycle(true);
      } else if (!running && cronRunningRef.current) {
        // cron just finished — refresh results
        pipelineRunningRef.current = false;
        cronRunningRef.current = false;
        setCronRunning(false);
        setPipelineRunning(false);
        stopStageCycle();
        setCurrentStage("done");
        addLog("Cron pipeline completed ✓", "success");
        await fetchStats();
        await fetchLatestJobs();
      }
    } catch (err) {
      console.error("Failed to check pipeline status:", err);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await api.get("/matching/stats");
      setStats(res.data);
      // const apps = res.data.applications;
      // setStats({
      //   total: apps.length,
      //   applied: apps.filter((a) =>
      //     ["applied", "auto_applied", "manually_applied"].includes(a.status),
      //   ).length,
      //   pending: apps.filter((a) => a.status === "pending").length,
      //   skipped: apps.filter((a) => a.status === "skipped").length,
      //   favourites: apps.filter((a) => a.is_favourite).length,
      // });
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  };

  const fetchLatestJobs = async () => {
    try {
      const res = await api.get("/pipeline/results");
      if (res.data?.length) setJobs(res.data);
    } catch (err) {
      console.error("Failed to fetch latest jobs:", err);
    }
  };

  const addLog = (msg, type = "info") =>
    setLog((prev) => [
      ...prev,
      { msg, type, ts: new Date().toLocaleTimeString() },
    ]);

  const startStageCycle = (isCron = false) => {
    const cycleStages = ["fetch", "match", "apply"];
    let idx = 0;
    setCurrentStage(cycleStages[0]);
    addLog(
      isCron
        ? "Cron pipeline started automatically…"
        : "Fetching fresh job listings…",
    );

    stageCycleRef.current = setInterval(() => {
      idx = (idx + 1) % cycleStages.length;
      setCurrentStage(cycleStages[idx]);
      const msgs = {
        fetch: "Fetching fresh job listings…",
        match: "Scoring jobs against your profile…",
        apply: "Generating documents & applying…",
      };
      addLog(msgs[cycleStages[idx]]);
    }, STAGE_CYCLE_MS);
  };

  const stopStageCycle = () => {
    if (stageCycleRef.current) {
      clearInterval(stageCycleRef.current);
      stageCycleRef.current = null;
    }
  };

  const runPipeline = async () => {
    if (status === "employed" || status === "paused" || pipelineRunning) return;
    pipelineRunningRef.current = true;
    cronRunningRef.current = false;
    setPipelineRunning(true);
    setCronRunning(false);
    setLog([]);
    setJobs([]);
    setPipelineStats(null);
    setError(null);

    startStageCycle(false);

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

      const data = await res.json();
      stopStageCycle();
      setCurrentStage("done");

      // addLog(`Fetched ${data.fetchedCount ?? 0} jobs`, "info");
      // addLog(`${data.processed ?? 0} jobs matched your threshold`, "info");
      // addLog(
      //   `Applied to ${data.autoApplied ?? 0} jobs, ${data.manualRequired ?? 0} need manual review`,
      //   "success",
      // );
      addLog("Pipeline started - running in background", "info");

      setPipelineStats({
        fetched: data.fetchedCount,
        matched: data.processed,
        autoApplied: data.autoApplied,
        manualRequired: data.manualRequired,
        failed: data.failed,
      });

      if (data.jobs?.length) setJobs(data.jobs);
      await fetchStats();
    } catch (err) {
      stopStageCycle();
      setCurrentStage(null);
      setError(err.message);
      addLog(`Error: ${err.message}`, "error");
    } finally {
      pipelineRunningRef.current = false;
      setPipelineRunning(false);
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

  const stageIndex = STAGES.indexOf(currentStage);
  const pipelineDisabled =
    pipelineRunning || status === "employed" || status === "paused";
  const pipelineLabel = pipelineRunning
    ? cronRunning
      ? "Cron running…"
      : "Running..."
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
            <div className="flex items-center gap-2">
              {cronRunning && (
                <span className="text-xs text-blue-400 border border-blue-800 rounded px-2 py-1 animate-pulse">
                  Cron running
                </span>
              )}
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
          </div>

          <p className="text-gray-400 text-sm mb-4">
            Fetches new jobs, matches them to your CV, generates documents and
            applies automatically.
          </p>

          {!pipelineRunning && (
            <button
              onClick={runPipeline}
              disabled={pipelineDisabled}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-semibold transition"
            >
              {pipelineLabel}
            </button>
          )}

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

              {pipelineRunning && (
                <p className="text-xs text-blue-400 mt-3 animate-pulse">
                  {cronRunning
                    ? "Cron pipeline is running in the background…"
                    : "Pipeline is running — this may take a few minutes…"}
                </p>
              )}
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

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
              {cronRunning
                ? "Background run — live results"
                : `This run — ${jobs.length} job${jobs.length !== 1 ? "s" : ""}`}
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
                          className={`text-sm font-semibold ${
                            job.match_score >= 70
                              ? "text-green-400"
                              : job.match_score >= 55
                                ? "text-yellow-400"
                                : "text-gray-400"
                          }`}
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
