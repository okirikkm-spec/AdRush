import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./ThemeContext";
import PrivateRoute from "./components/PrivateRoute";
import MainPage from "./pages/MainPage";
import DrinkPage from "./pages/DrinkPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import RecoverPage from "./pages/RecoverPage";
import ProfilePage from "./pages/ProfilePage";
import UserPage from "./pages/UserPage";
import AdminPage from "./pages/AdminPage";

export default function App() {
  return (
    <ThemeProvider>
      <div className="bg-grid" aria-hidden="true" />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MainPage />} />
          <Route path="/drink/:id" element={<DrinkPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/recover" element={<RecoverPage />} />
          <Route path="/user/:id" element={<UserPage />} />
          <Route element={<PrivateRoute />}>
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
