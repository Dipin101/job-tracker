import { useAuth } from "../context/AuthContext";

const Navbar = () => {
  const { logout } = useAuth();

  return (
    <nav className="border-b border-gray-800 px-6 py-4 flex justify-between items-center">
      <a href="/dashboard" className="text-xl font-bold text-white">
        Job Tracker
      </a>
      <div className="flex items-center gap-4">
        <a
          href="/dashboard"
          className="text-gray-400 hover:text-white transition text-sm"
        >
          Dashboard
        </a>
        <a
          href="/applications"
          className="text-gray-400 hover:text-white transition text-sm"
        >
          Applications
        </a>
        <a
          href="/upload"
          className="text-gray-400 hover:text-white transition text-sm"
        >
          Upload CV
        </a>
        <a
          href="/profile"
          className="text-gray-400 hover:text-white transition text-sm"
        >
          Profile
        </a>
        <button
          onClick={logout}
          className="text-gray-400 hover:text-red-400 transition text-sm"
        >
          Logout
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
