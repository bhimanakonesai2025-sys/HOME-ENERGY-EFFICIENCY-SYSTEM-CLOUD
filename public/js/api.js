(function () {
  "use strict";

  const TOKEN_KEY = "energyflow_token";
  const USER_KEY = "energyflow_user";

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || "null");
    } catch {
      return null;
    }
  }

  function saveSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});

    if (
      options.body !== undefined &&
      !(options.body instanceof FormData)
    ) {
      headers.set("Content-Type", "application/json");
    }

    const token = getToken();

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    let response;

    try {
      response = await fetch(path, {
        ...options,
        headers
      });
    } catch {
      throw new Error(
        "Cannot reach the EnergyFlow server. Check your connection."
      );
    }

    let data;

    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (response.status === 401 && token) {
      clearSession();

      if (!location.pathname.endsWith("/login.html")) {
        location.href = "/login.html";
      }
    }

    if (!response.ok || data.success === false) {
      throw new Error(
        data.error || `Request failed (${response.status}).`
      );
    }

    return data;
  }

  function get(path) {
    return request(path, {
      method: "GET"
    });
  }

  function post(path, body) {
    return request(path, {
      method: "POST",
      body: JSON.stringify(body)
    });
  }

  function patch(path, body) {
    return request(path, {
      method: "PATCH",
      body: JSON.stringify(body)
    });
  }

  function requireLogin() {
    if (!getToken()) {
      location.href = "/login.html";
      return false;
    }

    return true;
  }

  function logout() {
    clearSession();
    location.href = "/login.html";
  }

  window.EnergyAPI = {
    get,
    post,
    patch,
    request,
    getToken,
    getUser,
    saveSession,
    clearSession,
    requireLogin,
    logout
  };
})();