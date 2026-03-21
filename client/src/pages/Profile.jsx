import { useState, useEffect } from "react";
import api from "../api/axios";
import Navbar from "../components/Navbar";
import { useAuth } from "../context/AuthContext";

const Profile = () => {
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    location: "",
    work_authorization: "",
    years_experience: 0,
    salary_expectation_min: "",
    salary_expectation_max: "",
    linkedin_url: "",
    portfolio_url: "",
    bio_summary: "",
    job_titles: "",
    match_threshold: 70,
    experience_level: "entry",
    country: "ca",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const { pipelineRunning } = useAuth();

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await api.get("/auth/profile");
      const u = res.data.user;
      setForm({
        full_name: u.full_name || "",
        phone: u.phone || "",
        location: u.location || "",
        work_authorization: u.work_authorization || "",
        years_experience: u.years_experience || 0,
        salary_expectation_min: u.salary_expectation_min || "",
        salary_expectation_max: u.salary_expectation_max || "",
        linkedin_url: u.linkedin_url || "",
        portfolio_url: u.portfolio_url || "",
        bio_summary: u.bio_summary || "",
        job_titles: u.job_titles?.join(", ") || "",
        match_threshold: u.match_threshold || 70,
        experience_level: u.experience_level || "entry",
        country: u.country || "ca",
      });
    } catch (err) {
      console.error("Failed to fetch profile:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await api.put("/auth/profile", {
        ...form,
        job_titles: form.job_titles
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        years_experience: parseInt(form.years_experience),
        salary_expectation_min: parseInt(form.salary_expectation_min) || null,
        salary_expectation_max: parseInt(form.salary_expectation_max) || null,
        match_threshold: parseInt(form.match_threshold),
      });
      setMessage("✓ Profile saved");
    } catch (err) {
      setMessage("✗ Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition";
  const labelClass = "block text-sm font-medium text-gray-300 mb-2";

  if (loading) return <div className="min-h-screen bg-gray-950" />;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      <div className="max-w-2xl mx-auto px-6 py-10">
        {pipelineRunning && (
          <div className="mb-6 p-4 bg-yellow-900/30 border border-yellow-800 rounded-xl text-yellow-400 text-sm">
            ⚠️ Pipeline is currently running — saving profile changes now may
            affect active applications. Please wait until it finishes.
          </div>
        )}
        <h2 className="text-2xl font-bold mb-8">Profile & Settings</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Personal Info */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h3 className="text-lg font-semibold mb-4">Personal Info</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Full Name</label>
                <input
                  name="full_name"
                  value={form.full_name}
                  onChange={handleChange}
                  className={inputClass}
                  placeholder="Dipin Khatri"
                />
              </div>
              <div>
                <label className={labelClass}>Phone</label>
                <input
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  className={inputClass}
                  placeholder="437 987 0735"
                />
              </div>
              <div>
                <label className={labelClass}>Location</label>
                <input
                  name="location"
                  value={form.location}
                  onChange={handleChange}
                  className={inputClass}
                  placeholder="Toronto, ON"
                />
              </div>
              <div>
                <label className={labelClass}>Work Authorization</label>
                <input
                  name="work_authorization"
                  value={form.work_authorization}
                  onChange={handleChange}
                  className={inputClass}
                  placeholder="Open Work Permit"
                />
              </div>
              <div>
                <label className={labelClass}>LinkedIn URL</label>
                <input
                  name="linkedin_url"
                  value={form.linkedin_url}
                  onChange={handleChange}
                  className={inputClass}
                  placeholder="https://linkedin.com/in/..."
                />
              </div>
              <div>
                <label className={labelClass}>Portfolio URL</label>
                <input
                  name="portfolio_url"
                  value={form.portfolio_url}
                  onChange={handleChange}
                  className={inputClass}
                  placeholder="https://yoursite.com"
                />
              </div>
            </div>
          </div>

          {/* Bio */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h3 className="text-lg font-semibold mb-2">Bio Summary</h3>
            <p className="text-gray-400 text-sm mb-4">
              Be honest and specific — AI uses this to write cover letters that
              sound like you.
            </p>
            <textarea
              name="bio_summary"
              value={form.bio_summary}
              onChange={handleChange}
              rows={5}
              className={inputClass}
              placeholder="Write a short honest summary of your background, experience, and what you're looking for..."
            />
          </div>

          {/* Job Search Settings */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h3 className="text-lg font-semibold mb-4">Job Search Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Experience Level</label>
                <select
                  name="experience_level"
                  value={form.experience_level}
                  onChange={handleChange}
                  className={inputClass}
                >
                  <option value="entry">Entry</option>
                  <option value="mid">Mid</option>
                  <option value="senior">Senior</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Country</label>
                <select
                  name="country"
                  value={form.country}
                  onChange={handleChange}
                  className={inputClass}
                >
                  <option value="ca">Canada</option>
                  <option value="gb">United Kingdom</option>
                  <option value="us">United States</option>
                  <option value="au">Australia</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Years Experience</label>
                <input
                  type="number"
                  name="years_experience"
                  value={form.years_experience}
                  onChange={handleChange}
                  className={inputClass}
                  min="0"
                  max="30"
                />
              </div>
              <div>
                <label className={labelClass}>Match Threshold (%)</label>
                <input
                  type="number"
                  name="match_threshold"
                  value={form.match_threshold}
                  onChange={handleChange}
                  className={inputClass}
                  min="50"
                  max="95"
                />
              </div>
              <div>
                <label className={labelClass}>Min Salary</label>
                <input
                  type="number"
                  name="salary_expectation_min"
                  value={form.salary_expectation_min}
                  onChange={handleChange}
                  className={inputClass}
                  placeholder="50000"
                />
              </div>
              <div>
                <label className={labelClass}>Max Salary</label>
                <input
                  type="number"
                  name="salary_expectation_max"
                  value={form.salary_expectation_max}
                  onChange={handleChange}
                  className={inputClass}
                  placeholder="80000"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className={labelClass}>Job Titles (comma separated)</label>
              <input
                name="job_titles"
                value={form.job_titles}
                onChange={handleChange}
                className={inputClass}
                placeholder="Junior Full Stack Developer, Junior Backend Developer"
              />
            </div>
          </div>

          {message && (
            <p
              className={`text-sm ${message.startsWith("✓") ? "text-green-400" : "text-red-400"}`}
            >
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || pipelineRunning}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-semibold transition"
          >
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Profile;
