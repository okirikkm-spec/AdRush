import { getFingerprint } from "./fingerprint";

export const API_BASE = process.env.REACT_APP_API_BASE || "";

/* ─────────────── Токен ─────────────── */

export function saveToken(token) {
  localStorage.setItem("token", token);
}
export function getToken() {
  return localStorage.getItem("token");
}
export function removeToken() {
  localStorage.removeItem("token");
}
export function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}
export function isAuthenticated() {
  const t = getToken();
  return !!t && !isTokenExpired(t);
}

function authHeaders(extra = {}) {
  const token = getToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

/** Превращает путь к медиа в абсолютный URL (внешние ссылки оставляет как есть). */
export function mediaUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

async function parseError(res, fallback) {
  try {
    const body = await res.json();
    const err = new Error(body.error || fallback);
    err.requires2fa = !!body.requires2fa;
    err.status = res.status;
    return err;
  } catch {
    const err = new Error(fallback);
    err.status = res.status;
    return err;
  }
}

async function jsonRequest(url, { method = "GET", body, auth = false } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: auth ? authHeaders(headers) : headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await parseError(res, "Ошибка запроса");
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/* ─────────────── Аутентификация ─────────────── */

export async function register(username, password) {
  const fingerprint = await getFingerprint();
  return jsonRequest("/api/auth/register", { method: "POST", body: { username, password, fingerprint } });
}
export async function login(username, password, code) {
  const fingerprint = await getFingerprint();
  return jsonRequest("/api/auth/login", { method: "POST", body: { username, password, code, fingerprint } });
}
export function recoverPassword(username, code, newPassword) {
  return jsonRequest("/api/auth/recover", { method: "POST", body: { username, code, newPassword } });
}
export function fetchMe() {
  return jsonRequest("/api/auth/me", { auth: true });
}
export function updateMe(data) {
  return jsonRequest("/api/auth/me", { method: "PUT", body: data, auth: true });
}
export function changePassword(oldPassword, newPassword) {
  return jsonRequest("/api/auth/me/password", { method: "POST", body: { oldPassword, newPassword }, auth: true });
}
export function setPrivacy(isPrivate) {
  return jsonRequest("/api/auth/me/privacy", { method: "POST", body: { private: isPrivate }, auth: true });
}
export function setup2fa() {
  return jsonRequest("/api/auth/2fa/setup", { method: "POST", auth: true });
}
export function enable2fa(code) {
  return jsonRequest("/api/auth/2fa/enable", { method: "POST", body: { code }, auth: true });
}
export function disable2fa(code) {
  return jsonRequest("/api/auth/2fa/disable", { method: "POST", body: { code }, auth: true });
}

export async function uploadAvatar(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/api/auth/me/avatar`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
  if (!res.ok) throw await parseError(res, "Ошибка загрузки аватарки");
  return res.json();
}

/* ─────────────── Энергетики ─────────────── */

export function fetchDrinks() {
  return jsonRequest("/api/drinks", { auth: true });
}
export function fetchDrink(id) {
  return jsonRequest(`/api/drinks/${id}`, { auth: true });
}
export function createDrink(data) {
  return jsonRequest("/api/drinks", { method: "POST", body: data, auth: true });
}
export function updateDrink(id, data) {
  return jsonRequest(`/api/drinks/${id}`, { method: "PUT", body: data, auth: true });
}
export function deleteDrink(id) {
  return jsonRequest(`/api/drinks/${id}`, { method: "DELETE", auth: true });
}
export function deleteDrinkPhoto(drinkId, photoId) {
  return jsonRequest(`/api/drinks/${drinkId}/photos/${photoId}`, { method: "DELETE", auth: true });
}
/** Сохранить кадрирование обложки (ракурс для карточки и окна). */
export function updateCoverFraming(id, framing) {
  return jsonRequest(`/api/drinks/${id}/cover`, { method: "PUT", body: framing, auth: true });
}
/** Изменить порядок фотографий (массив id в нужном порядке; первое — обложка). */
export function reorderDrinkPhotos(id, order) {
  return jsonRequest(`/api/drinks/${id}/photos/order`, { method: "PUT", body: { order }, auth: true });
}
/** Бренды, для которых на бэкенде есть парсер каталога. */
export function fetchParseSources() {
  return jsonRequest(`/api/drinks/parse/sources`, { auth: true });
}
/** Запустить парсинг выбранных брендов. reparse=false — только новые; true — обновить и существующие. */
export function runParse({ brands, reparse = false }) {
  return jsonRequest(`/api/drinks/parse`, { method: "POST", body: { brands, reparse }, auth: true });
}
/**
 * Оптимизация медиа: скачать внешние картинки в наше хранилище и достроить недостающие превью.
 * Возвращает { downloaded, thumbnailed, skipped, failed }.
 */
export function optimizeMedia() {
  return jsonRequest(`/api/drinks/media/optimize`, { method: "POST", auth: true });
}
/**
 * Загрузить сохранённый HTML каталога Monster (парсится на сервере).
 * reparse=false — только новые карточки; true — обновить и существующие.
 */
export async function uploadMonsterCatalog(file, reparse = false) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("reparse", reparse);
  const res = await fetch(`${API_BASE}/api/drinks/parse/monster`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
  if (!res.ok) throw await parseError(res, "Ошибка загрузки каталога Monster");
  return res.json();
}
export async function addDrinkPhoto(id, file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/api/drinks/${id}/photos`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
  if (!res.ok) throw await parseError(res, "Ошибка загрузки фото");
  return res.json();
}

export function addDrinkPhotoByUrl(id, url) {
  return jsonRequest(`/api/drinks/${id}/photos/url`, { method: "POST", body: { url }, auth: true });
}

/* ─────────────── Отзывы ─────────────── */

export function fetchReviews(drinkId) {
  return jsonRequest(`/api/drinks/${drinkId}/reviews`, { auth: true });
}
export function fetchRating(drinkId) {
  return jsonRequest(`/api/drinks/${drinkId}/rating`, { auth: true });
}
export function submitReview(drinkId, rating, text) {
  return jsonRequest(`/api/drinks/${drinkId}/reviews`, { method: "POST", body: { rating, text }, auth: true });
}
export function deleteMyReview(drinkId) {
  return jsonRequest(`/api/drinks/${drinkId}/reviews/me`, { method: "DELETE", auth: true });
}

/* ─────────────── Пользователи ─────────────── */

export function fetchUserProfile(id) {
  return jsonRequest(`/api/users/${id}`, { auth: true });
}

/* ─────────────── Модерация (админ) ─────────────── */

export function fetchAdminUsers() {
  return jsonRequest("/api/admin/users", { auth: true });
}
export function fetchLinkedAccounts(userId) {
  return jsonRequest(`/api/admin/users/${userId}/linked`, { auth: true });
}
export function banUser(userId, { reason, durationDays, deleteComments, alsoBanUserIds }) {
  return jsonRequest(`/api/admin/users/${userId}/ban`, {
    method: "POST",
    body: { reason, durationDays, deleteComments, alsoBanUserIds },
    auth: true,
  });
}
export function unbanUser(userId) {
  return jsonRequest(`/api/admin/users/${userId}/unban`, { method: "POST", auth: true });
}
export function deleteUserAccount(userId) {
  return jsonRequest(`/api/admin/users/${userId}`, { method: "DELETE", auth: true });
}
export function deleteReviewAsAdmin(reviewId, reason) {
  return jsonRequest(`/api/admin/reviews/${reviewId}`, { method: "DELETE", body: { reason }, auth: true });
}
export function setUserAdmin(userId, admin) {
  return jsonRequest(`/api/admin/users/${userId}/role`, { method: "POST", body: { admin }, auth: true });
}
export function warnUser(userId, message) {
  return jsonRequest(`/api/admin/users/${userId}/warn`, { method: "POST", body: { message }, auth: true });
}

/* ─────────────── Журнал аудита (админ) ─────────────── */

export function fetchAuditLog({ actorId, action, targetId, q, page = 0, size = 50 } = {}) {
  const p = new URLSearchParams();
  if (actorId) p.set("actorId", actorId);
  if (action) p.set("action", action);
  if (targetId) p.set("targetId", targetId);
  if (q) p.set("q", q);
  p.set("page", page);
  p.set("size", size);
  return jsonRequest(`/api/admin/audit?${p.toString()}`, { auth: true });
}
export function fetchAuditActors() {
  return jsonRequest("/api/admin/audit/actors", { auth: true });
}

/* ─────────────── Уведомления ─────────────── */

export function fetchNotifications() {
  return jsonRequest("/api/notifications", { auth: true });
}
export function fetchUnreadCount() {
  return jsonRequest("/api/notifications/unread-count", { auth: true });
}
export function markNotificationsRead() {
  return jsonRequest("/api/notifications/read", { method: "POST", auth: true });
}
