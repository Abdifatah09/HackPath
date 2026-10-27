import React from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import logo from "../assets/logo.png";

function rankIcon(rank) {
  const r = String(rank || "").toLowerCase();
  if (r === "master") return "👑";
  if (r === "diamond") return "🔥";
  if (r === "platinum") return "💎";
  if (r === "gold") return "🥇";
  if (r === "silver") return "🥈";
  if (r === "bronze") return "🥉";
  return "🏷️";
}

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, stats, isReady, logout } = useAuth(); // ✅ stats from context

  const isAuthed = Boolean(user);

  const linkClass = ({ isActive }) =>
    `text-sm font-medium transition ${
      isActive ? "text-white" : "text-white/80 hover:text-white"
    }`;

  const hideNavbar = location.pathname === "/reset-password";

  if (hideNavbar) return null;

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-white/10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex h-16 items-center justify-between">
            <NavLink to="/" className="flex items-center gap-3">
              <img
                src={logo}
                alt="HackPath logo"
                className="h-9 w-9 rounded-md bg-white/10 ring-1 ring-white/15 object-contain"
              />
              <span className="text-white font-semibold tracking-wide">
                HackPath
              </span>
            </NavLink>

            <div className="flex items-center gap-6">
              {!isReady ? (
                <div className="text-white/70 text-sm">Loading...</div>
              ) : isAuthed ? (
                <>
                  <nav className="flex items-center gap-8">
                    <NavLink to="/dashboard" className={linkClass}>
                      Dashboard
                    </NavLink>

                    <NavLink to="/progress" className={linkClass}>
                      Progress
                    </NavLink>

                    <NavLink to="/profile" className={linkClass}>
                      Profile
                    </NavLink>
                  </nav>

                  {/* ✅ Rank chip (now live from context) */}
                  <button
                    type="button"
                    onClick={() => navigate("/achievements")}
                    className="hidden sm:inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/15 transition"
                    title="View your achievements"
                  >
                    <span className="text-base leading-none">
                      {rankIcon(stats?.rank)}
                    </span>
                    <span>{stats?.rank || "Bronze"}</span>
                    <span className="text-white/70 text-xs">
                      • Lv {stats?.level || 1}
                    </span>
                  </button>

                  <button
                    onClick={handleLogout}
                    className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 active:bg-red-800 transition"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <nav className="flex items-center gap-6">
                  <NavLink to="/login" className={linkClass}>
                    Login
                  </NavLink>
                  <NavLink to="/register" className={linkClass}>
                    Register
                  </NavLink>
                </nav>
              )}
            </div>
          </div>
        </div>
      </div>

      {isReady && isAuthed && location.pathname.startsWith("/progress") && (
        <div className="bg-white border-b">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex flex-wrap gap-4 py-3 text-sm">
              <NavLink
                to="/progress"
                end
                className={({ isActive }) =>
                  isActive
                    ? "font-semibold text-slate-900"
                    : "text-slate-600 hover:text-slate-900"
                }
              >
                Overview
              </NavLink>

              <NavLink
                to="/progress/subjects"
                className={({ isActive }) =>
                  isActive
                    ? "font-semibold text-slate-900"
                    : "text-slate-600 hover:text-slate-900"
                }
              >
                Subjects
              </NavLink>

              <NavLink
                to="/progress/difficulties"
                className={({ isActive }) =>
                  isActive
                    ? "font-semibold text-slate-900"
                    : "text-slate-600 hover:text-slate-900"
                }
              >
                Difficulties
              </NavLink>

              <NavLink
                to="/progress/sections"
                className={({ isActive }) =>
                  isActive
                    ? "font-semibold text-slate-900"
                    : "text-slate-600 hover:text-slate-900"
                }
              >
                Sections
              </NavLink>

              <NavLink
                to="/progress/challenges"
                className={({ isActive }) =>
                  isActive
                    ? "font-semibold text-slate-900"
                    : "text-slate-600 hover:text-slate-900"
                }
              >
                Challenges
              </NavLink>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}