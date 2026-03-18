import { useState } from "react";
import api from "../api/axios";

const Upload = () => {
  const [cvFile, setCvFile] = useState(null);
  const [githubUrl, setGithubUrl] = useState("");
  const [cvLoading, setCvLoading] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);
  const [cvMessage, setCvMessage] = useState("");
  const [githubMessage, setGithubMessage] = useState("");

  const uploadCV = async (e) => {
    e.preventDefault();
    if (!cvFile) return;

    setCvLoading(true);
    setCvMessage("");

    try {
      const formData = new FormData();
      formData.append("resume", cvFile);

      const res = await api.post("/resume/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setCvMessage(
        `✓ CV uploaded — ${res.data.skills?.length || 0} skills extracted`,
      );
    } catch (err) {
      setCvMessage(`✗ ${err.response?.data?.message || "Upload failed"}`);
    } finally {
      setCvLoading(false);
    }
  };

  const connectGithub = async (e) => {
    e.preventDefault();
    if (!githubUrl) return;

    setGithubLoading(true);
    setGithubMessage("");

    try {
      const res = await api.post("/github/connect", { githubUrl });
      setGithubMessage(
        `✓ GitHub connected — ${res.data.skills?.length || 0} skills analyzed`,
      );
    } catch (err) {
      setGithubMessage(
        `✗ ${err.response?.data?.message || "Connection failed"}`,
      );
    } finally {
      setGithubLoading(false);
    }
  };

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
            href="/applications"
            className="text-gray-400 hover:text-white transition"
          >
            Applications
          </a>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-10">
        <h2 className="text-2xl font-bold mb-8">Upload CV & Connect GitHub</h2>

        {/* CV Upload */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <h3 className="text-lg font-semibold mb-2">Upload CV</h3>
          <p className="text-gray-400 text-sm mb-4">
            Upload your base CV as a PDF. AI will extract your skills
            automatically.
          </p>
          <form onSubmit={uploadCV}>
            <div className="mb-4">
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setCvFile(e.target.files[0])}
                className="w-full text-gray-300 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-700 file:text-white hover:file:bg-gray-600 cursor-pointer"
              />
            </div>
            <button
              type="submit"
              disabled={cvLoading || !cvFile}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-medium transition"
            >
              {cvLoading ? "Uploading..." : "Upload CV"}
            </button>
            {cvMessage && (
              <p
                className={`mt-3 text-sm ${cvMessage.startsWith("✓") ? "text-green-400" : "text-red-400"}`}
              >
                {cvMessage}
              </p>
            )}
          </form>
        </div>

        {/* GitHub Connect */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-lg font-semibold mb-2">Connect GitHub</h3>
          <p className="text-gray-400 text-sm mb-4">
            Connect your GitHub profile so AI can analyze your repos and extract
            additional skills.
          </p>
          <form onSubmit={connectGithub}>
            <div className="mb-4">
              <input
                type="url"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="https://github.com/yourusername"
                required
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
              />
            </div>
            <button
              type="submit"
              disabled={githubLoading || !githubUrl}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-medium transition"
            >
              {githubLoading ? "Connecting..." : "Connect GitHub"}
            </button>
            {githubMessage && (
              <p
                className={`mt-3 text-sm ${githubMessage.startsWith("✓") ? "text-green-400" : "text-red-400"}`}
              >
                {githubMessage}
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default Upload;
