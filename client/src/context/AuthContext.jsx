import { createContext, useContext, useState, useEffect } from "react";
import api from "../api/axios";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pipelineRunning, setPipelineRunning] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    const user = localStorage.getItem("user");
    if (token && user) {
      setUser(JSON.parse(user));
    } else if (token) {
      setUser({ token });
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const res = await api.post("/auth/login", { email, password });
    localStorage.setItem("accessToken", res.data.accessToken);
    localStorage.setItem("user", JSON.stringify(res.data.user)); // ADD THIS
    setUser(res.data.user);
    return res.data;
  };
  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (err) {
      console.error(error);
    }
    localStorage.removeItem("accessToken");
    localStorage.removeItem("user"); // ADD THIS
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        loading,
        pipelineRunning,
        setPipelineRunning,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
