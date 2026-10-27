import React from "react";
import { Routes, Route } from "react-router-dom";
import Login from "../pages/Login";
import Register from "../pages/Register";
import Dashboard from "../pages/Dashboard";
import ProtectedRoute from "../components/ProtectedRoute";
import ForgotPassword from "../pages/ForgotPassword";
import ResetPassword from "../pages/ResetPassword";
import Profile from "../pages/Profile";
import AdminRoute from "./AdminRoute";
import AdminCurriculum from "../pages/AdminCurriculum";
import Home from "../pages/Home";
import ProgressOverview from "../pages/ProgressOverview";
import SubjectsProgress from "../pages/SubjectsProgress";
import SubjectDetail from "../pages/SubjectDetail";
import DifficultiesProgress from "../pages/DifficultiesProgress";
import DifficultyDetail from "../pages/DifficultyDetail";
import SectionsProgress from "../pages/SectionsProgress";
import SectionDetail from "../pages/SectionDetail";
import ProgressByChallenge from "../pages/ProgressByChallenge";
import MyPathDifficulty from "../pages/MyPathDifficulty";
import DifficultyChallenges from "../pages/DifficultyChallenges";
import SolveChallenge from "../pages/SolveChallenge";
import Achievements from "../pages/Achievements";
import AdminAnalytics from "../pages/AdminAnalytics";


export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/" element={<Home />} />

      <Route 
        path="/progress" 
        element={
          <ProtectedRoute>
            <ProgressOverview />
          </ProtectedRoute>
        } />
      <Route 
        path="/progress/subjects" 
        element={
          <ProtectedRoute>
            <SubjectsProgress />
          </ProtectedRoute>
        } />
      <Route 
      path="/progress/subjects/:subjectId" 
      element={
        <ProtectedRoute>
          <SubjectDetail />
        </ProtectedRoute>
      } />
      <Route 
       path="/progress/difficulties"
        element={
          <ProtectedRoute>
            <DifficultiesProgress />
          </ProtectedRoute>
        } />
      <Route 
        path="/progress/difficulties/:difficultyId" 
        element={
          <ProtectedRoute>
            <DifficultyDetail />
          </ProtectedRoute>
        } />
      <Route 
        path="/progress/sections" 
        element={
          <ProtectedRoute>
            <SectionsProgress />
          </ProtectedRoute>
        } />
      <Route 
        path="/progress/sections/:sectionId" 
        element={
          <ProtectedRoute>
            <SectionDetail />
          </ProtectedRoute>
        } />
      <Route 
      path="/progress/challenges" 
      element={
        <ProtectedRoute>
          <ProgressByChallenge />
        </ProtectedRoute>
      } />
      <Route 
        path="/my-path/difficulty/:difficultyId" 
        element={
          <ProtectedRoute>
            <MyPathDifficulty />
          </ProtectedRoute>
        } />     
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />   
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-path/difficulty/:difficultyId/solve"
        element={
          <ProtectedRoute>
            <DifficultyChallenges />
          </ProtectedRoute>
        }
      />
      <Route
        path="/challenges/:id/solve"
        element={
          <ProtectedRoute>
            <SolveChallenge />
          </ProtectedRoute>
        }
      />
      <Route
        path="/achievements"
        element={
          <ProtectedRoute>
            <Achievements />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/curriculum"
        element={
         <AdminRoute>
            <AdminCurriculum />
         </AdminRoute>
        }
      />
      <Route
        path="/admin/analytics"
        element={
         <AdminRoute>
            <AdminAnalytics />
         </AdminRoute>
        }
      />
    </Routes>
  );
}
