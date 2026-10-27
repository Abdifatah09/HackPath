import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { isValidEmail, validatePassword } from "../utils/validators";

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");

    const errors = {};

    if (!email) errors.email = "Email is required.";
    else if (!isValidEmail(email)) errors.email = "Enter a valid email address.";

    const pwErrors = validatePassword(password, { min: 8 });
    if (!password) errors.password = "Password is required.";
    else if (pwErrors.length) errors.password = pwErrors[0];

    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setLoading(true);

    try {
      await register({
        name: name.trim() || "User", 
        email: email.trim(),
        password,
        role: "student", 
      });
      navigate("/dashboard");
    } catch (error) {
      setErr(error?.response?.data?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="w-full max-w-md bg-white border rounded-2xl shadow p-6">
        <h1 className="text-2xl font-semibold mb-1">Create an account</h1>
        <p className="text-sm text-gray-600 mb-4">
          Create an account and start your first challenge.
        </p>

        {err && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <input
              className="w-full border rounded-lg p-3"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </div>

          <div>
            <input
              className="w-full border rounded-lg p-3"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            {fieldErrors.email && (
              <p className="text-sm text-red-600 mt-1">{fieldErrors.email}</p>
            )}
          </div>

          <div>
            <input
              className="w-full border rounded-lg p-3"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            {fieldErrors.password && (
              <p className="text-sm text-red-600 mt-1">{fieldErrors.password}</p>
            )}
          </div>

          <button
            className="w-full rounded-lg p-3 font-medium bg-black text-white disabled:opacity-60"
            disabled={loading}
            type="submit"
          >
            {loading ? "Creating..." : "Create account"}
          </button>
        </form>

        <p className="text-sm mt-4 text-gray-700">
          Already have an account?{" "}
          <Link className="underline" to="/login">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
