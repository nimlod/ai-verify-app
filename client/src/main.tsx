import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import App from './App';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PublicDashboard from './pages/PublicDashboard';
import PublicCheck from './pages/PublicCheck';
// 👇 これを追加
import SignUp from './pages/SignUp';

import './index.css';

const Root = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="login" element={<Login />} />
        <Route path="signup" element={<SignUp />} /> {/* 👈 サインアップ */}
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="u/:username" element={<PublicDashboard />} />
        <Route path="public" element={<PublicCheck />} />
      </Route>
    </Routes>
  </BrowserRouter>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
