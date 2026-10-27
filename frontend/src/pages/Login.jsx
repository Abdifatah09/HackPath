import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { isValidEmail, validatePassword } from "../utils/validators";
import { profileService } from "../services/profileService";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});


  const onSubmit = async (e) => {
    e.preventDefault(); 
    setErr("");
    setLoading(true);

    const errors = {};

    if (!email) errors.email = "Email is required.";
    else if (!isValidEmail(email)) errors.email = "Enter a valid email address.";

    const pwErrors = validatePassword(password, { min: 8 });
    if (!password) errors.password = "Password is required.";
    else if (pwErrors.length) errors.password = pwErrors[0];

    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setLoading(false);
      return;
    }
    setFieldErrors({});

    try {
      await login(email, password);

    try {
      await profileService.me();
      navigate("/dashboard");
     } catch (err) {
       navigate("/profile");
     }

    } catch (error) {
      setErr(error?.response?.data?.message || "Login failed");
    }  finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md border rounded-xl p-6">
        <h1 className="text-2xl font-semibold mb-4">Login</h1>
        {err && <div className="mb-3 text-sm text-red-600">{err}</div>}
        <form onSubmit={onSubmit} className="space-y-3">
          <input
            className="w-full border rounded-lg p-3"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {fieldErrors.email && <p className="text-sm text-red-600">{fieldErrors.email}</p>}

          <input
            className="w-full border rounded-lg p-3"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {fieldErrors.password && <p className="text-sm text-red-600">{fieldErrors.password}</p>}

          <button
            className="w-full border rounded-lg p-3 font-medium"
            disabled={loading}
            type="submit"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
        <p className="text-sm mt-4">
          Don’t have an account?{" "}
          <Link className="underline" to="/register">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
