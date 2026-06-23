import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./ThemeContext";
import { ChatProvider } from "./ChatContext";
import PrivateRoute from "./components/PrivateRoute";
import MainPage from "./pages/MainPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import RecoverPage from "./pages/RecoverPage";
import ProfilePage from "./pages/ProfilePage";
import UserPage from "./pages/UserPage";
import AdminPage from "./pages/AdminPage";
import ChatsPage from "./pages/ChatsPage";

export default function App() {
  return (
    <ThemeProvider>
      <ChatProvider>
        <div className="bg-grid" aria-hidden="true" />
        <div className="corner-glow" aria-hidden="true" />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<MainPage />} />
            {/* «Страница энергетика» теперь открывается модалкой поверх главной (deep-link сохранён) */}
            <Route path="/drink/:id" element={<MainPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/recover" element={<RecoverPage />} />
            <Route path="/user/:id" element={<UserPage />} />
            <Route element={<PrivateRoute />}>
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/chats" element={<ChatsPage />} />
              <Route path="/chats/:id" element={<ChatsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ChatProvider>
    </ThemeProvider>
  );
}
