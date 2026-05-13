/**
 * Summary:
 * This page shows the login screen for the researcher admin panel.
 * Researchers enter the admin password here before they can access the dashboard
 * for viewing, filtering, exporting, or deleting experiment submissions.
 *
 * Search for: CONFIG YOU WILL EDIT to edit relevant changes
 */
import { useState } from "react";

// Backend URL used by the admin login page.
// For local testing, this usually stays as "http://localhost:5050".
const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5050";

const AdminLogin = () => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(data.error || "Login failed");

      sessionStorage.setItem("adminToken", data.token);
      window.location.href = "/admin";
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>
      <form onSubmit={submit} style={s.card}>
        {/* CONFIG YOU WILL EDIT:
            Title shown on the admin login page.
        */}
        <h1 style={s.title}>Experiment Admin</h1>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          // CONFIG YOU WILL EDIT:
          // Placeholder text shown inside the password box.
          placeholder="Admin password"
          style={s.input}
        />
        {error && <div style={s.error}>{error}</div>}
        <button type="submit" disabled={loading} style={s.button}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
};

// CONFIG YOU WILL EDIT:
// Styling for the admin login page.
// You can change colors, fonts, spacing, and button style to match your study or institution.
const s = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#f4f4f4",
    fontFamily: "Arial, sans-serif",
  },
  card: {
    width: "min(380px, calc(100vw - 32px))",
    background: "#fff",
    borderRadius: 6,
    boxShadow: "0 1px 10px rgba(0,0,0,0.12)",
    padding: "1.4rem",
    boxSizing: "border-box",
  },
  title: {
    margin: "0 0 1rem",
    color: "#0094ff",
    fontSize: "1.25rem",
  },
  input: {
    width: "100%",
    padding: "0.65rem 0.75rem",
    border: "1px solid #ccc",
    borderRadius: 4,
    boxSizing: "border-box",
    fontSize: "0.95rem",
  },
  error: {
    marginTop: "0.75rem",
    color: "#c62828",
    fontSize: "0.88rem",
  },
  button: {
    width: "100%",
    marginTop: "1rem",
    padding: "0.65rem",
    border: "1px solid #0086e6",
    borderRadius: 4,
    background: "#0094ff",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },
};

export default AdminLogin;
