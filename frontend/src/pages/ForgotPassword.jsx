import React, { useState } from "react";
import { Link, useNavigate} from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { isValidEmail, validatePassword } from "../utils/validators";

export default function ForgotPassword() {
  const { forgotpassword, resetpassword } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1); 
  const [email, setEmail] = useState("");

  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const [fieldErrors, setFieldErrors] = useState({});

  const validateStep1 = () => {
    const errors = {};
    if (!email) errors.email = "Email is required.";
    else if (!isValidEmail(email)) errors.email = "Enter a valid email address.";
    return errors;
  };

  const validateStep2 = () => {
    const errors = {};
    const finalEmail = (email || "").trim();

    if (!finalEmail) errors.email = "Email is required.";
    else if (!isValidEmail(finalEmail)) errors.email = "Enter a valid email address.";

    if (!code || code.trim().length !== 6) errors.code = "Enter the 6-digit code.";

    const pwErrors = validatePassword(newPassword, { min: 8 });
    if (!newPassword) errors.newPassword = "New password is required.";
    else if (pwErrors.length) errors.newPassword = pwErrors[0];

    return errors;
  };

  const requestCode = async (e) => {
    e.preventDefault();
    setErr("");
    setMsg("");

    const errors = validateStep1();
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setLoading(true);

    try {
      await forgotpassword(email.trim());
      setMsg("If the email exists, a reset code has been sent to your email.");
      setStep(2);
    } catch (error) {
      setErr(error?.response?.data?.message || "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const resetWithCode = async (e) => {
    e.preventDefault();
    setErr("");
    setMsg("");

    const errors = validateStep2();
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setLoading(true);

    try {
      await resetpassword({
        email: email.trim(),
        code: code.trim(),
        newPassword,
      });

      setMsg("Password reset successful. You can now log in.");
      setCode("");
      setNewPassword("");
      setTimeout(() => navigate("/login"), 2000);
    } catch (error) {
      setErr(error?.response?.data?.message || "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="w-full max-w-md bg-white border rounded-2xl shadow p-6">
        <h1 className="text-2xl font-semibold mb-2">Forgot password</h1>

        {err && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        )}
        {msg && (
          <div className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            {msg}
          </div>
        )}

        {step === 1 && (
          <>
            <p className="text-sm text-gray-600 mb-4">
              Enter your email and we’ll send you a 6-digit reset code.
            </p>

            <form onSubmit={requestCode} className="space-y-3">
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

              <button
                className="w-full rounded-lg p-3 font-medium bg-black text-white disabled:opacity-60"
                disabled={loading}
                type="submit"
              >
                {loading ? "Sending..." : "Send reset code"}
              </button>
            </form>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-sm text-gray-600 mb-4">
              We sent a 6-digit code to <span className="font-medium">{email}</span>.
              Enter it below and choose a new password.
            </p>

            <form onSubmit={resetWithCode} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  className="w-full border rounded-lg p-3 bg-gray-50"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {fieldErrors.email && (
                  <p className="text-sm text-red-600 mt-1">{fieldErrors.email}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Reset code</label>
                <input
                  inputMode="numeric"
                  className="w-full border rounded-lg p-3 tracking-widest text-center text-lg"
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="123456"
                  maxLength={6}
                />
                {fieldErrors.code && (
                  <p className="text-sm text-red-600 mt-1">{fieldErrors.code}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">New password</label>
                <input
                  className="w-full border rounded-lg p-3"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password"
                  autoComplete="new-password"
                />
                {fieldErrors.newPassword && (
                  <p className="text-sm text-red-600 mt-1">{fieldErrors.newPassword}</p>
                )}
              </div>

              <button
                className="w-full rounded-lg p-3 font-medium bg-black text-white disabled:opacity-60"
                disabled={loading}
                type="submit"
              >
                {loading ? "Resetting..." : "Reset password"}
              </button>

              <button
                type="button"
                className="w-full rounded-lg p-3 font-medium border"
                onClick={() => {
                  setStep(1);
                  setErr("");
                  setMsg("");
                  setCode("");
                  setNewPassword("");
                }}
              >
                Use a different email
              </button>
            </form>
          </>
        )}

        <p className="text-sm mt-4 text-gray-700">
          <Link className="underline" to="/login">
            Back to Login
          </Link>
        </p>
      </div>
    </div>
  );
}
