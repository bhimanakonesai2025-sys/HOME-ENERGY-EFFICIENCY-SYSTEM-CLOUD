(function () {
  "use strict";

  const form = document.querySelector("[data-auth-form]");

  if (!form) return;

  const mode = form.dataset.authForm;

  const messageBox = document.getElementById("form-message");
  const submitButton = form.querySelector('button[type="submit"]');

  function showMessage(message, type = "error") {
    messageBox.textContent = message;
    messageBox.className = `form-message ${type}`;
    messageBox.hidden = false;
  }

  function hideMessage() {
    messageBox.textContent = "";
    messageBox.hidden = true;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    hideMessage();

    const formData = new FormData(form);

    const body = Object.fromEntries(formData.entries());

    if (mode === "register") {
      body.name = String(body.name || "").trim();
      body.email = String(body.email || "").trim().toLowerCase();

      if (body.password !== body.confirmPassword) {
        showMessage("The passwords do not match.");
        return;
      }

      delete body.confirmPassword;
    } else {
      body.email = String(body.email || "").trim().toLowerCase();
    }

    submitButton.disabled = true;
    submitButton.textContent =
      mode === "register" ? "Creating account..." : "Signing in...";

    try {
      const endpoint =
        mode === "register"
          ? "/api/auth/register"
          : "/api/auth/login";

      const result = await EnergyAPI.post(endpoint, body);

      EnergyAPI.saveSession(result.token, result.user);

      showMessage(
        mode === "register"
          ? "Account created successfully."
          : "Login successful.",
        "success"
      );

      window.setTimeout(() => {
        window.location.href = "/index.html";
      }, 350);
    } catch (error) {
      showMessage(error.message);
    } finally {
      submitButton.disabled = false;

      submitButton.textContent =
        mode === "register" ? "Create account" : "Sign in";
    }
  });
})();