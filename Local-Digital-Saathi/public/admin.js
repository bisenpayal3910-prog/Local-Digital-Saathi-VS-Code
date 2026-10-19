const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[ch]));
let leads = [];
let services = [];

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    if (url !== "/api/admin/login" && !$("dashboardPanel").hidden) showLogin();
    throw new Error(data.error || "Please sign in again.");
  }
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function message(text, type = "") {
  const el = $("notice");
  el.textContent = text;
  el.className = "message " + type;
}
function showLogin() {
  $("loginPanel").hidden = false;
  $("dashboardPanel").hidden = true;
}
function showDashboard() {
  $("loginPanel").hidden = true;
  $("dashboardPanel").hidden = false;
}
async function checkSession() {
  try {
    const result = await api("/api/admin/me");
    if (result.authenticated) {
      showDashboard();
      await refreshAll();
    } else showLogin();
  } catch { showLogin(); }
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("loginButton");
  const output = $("loginMessage");
  button.disabled = true;
  output.textContent = "Signing in…";
  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ username: $("username").value.trim(), password: $("password").value })
    });
    $("password").value = "";
    showDashboard();
    await refreshAll();
  } catch (error) {
    output.textContent = error.message;
    output.className = "message error";
  } finally { button.disabled = false; }
});

$("logoutBtn").addEventListener("click", async () => {
  try { await api("/api/admin/logout", { method: "POST" }); } catch {}
  showLogin();
  $("loginMessage").textContent = "You have been signed out.";
});

async function refreshAll() {
  try {
    const [leadData, serviceData] = await Promise.all([
      api("/api/admin/leads"), api("/api/admin/services")
    ]);
    leads = leadData.leads || [];
    services = serviceData.services || [];
    $("totalLeads").textContent = leadData.stats.total ?? leads.length;
    $("newLeads").textContent = leadData.stats.newCount ?? 0;
    $("wonLeads").textContent = leadData.stats.wonCount ?? 0;
    renderLeads();
    renderServices();
    message("Data is up to date.", "success");
  } catch (error) { message(error.message, "error"); }
}
function renderLeads() {
  const q = $("leadSearch").value.trim().toLowerCase();
  const status = $("statusFilter").value;
  const rows = leads.filter((lead) =>
    (!status || lead.status === status) &&
    (!q || [lead.name, lead.businessName, lead.service, lead.phone].some((v) => String(v || "").toLowerCase().includes(q)))
  );
  if (!rows.length) {
    $("leadsContainer").innerHTML = '<div class="empty">No matching enquiries yet.</div>';
    return;
  }
  $("leadsContainer").innerHTML = rows.map((lead) => `
    <article class="lead-item" data-id="${esc(lead.id)}">
      <div class="lead-main"><h3>${esc(lead.name)} · ${esc(lead.businessName)}</h3>
        <div class="lead-meta"><span>${esc(new Date(lead.createdAt).toLocaleString())}</span>
        ${lead.phone ? `<a href="tel:${esc(lead.phone)}">${esc(lead.phone)}</a>` : ""}
        <span class="status-pill status-${esc(lead.status)}">${esc(lead.status)}</span></div>
        <div class="lead-service">${esc(lead.service)}</div><div class="lead-details">${esc(lead.details || "No extra details.")}</div>
      </div>
      <div class="lead-controls"><label>Status<select class="lead-status">${["new","contacted","quoted","won","lost"].map(s => `<option value="${s}" ${lead.status === s ? "selected" : ""}>${s[0].toUpperCase()+s.slice(1)}</option>`).join("")}</select></label>
        <label>Private admin notes<textarea class="lead-notes" rows="2" maxlength="1200">${esc(lead.adminNotes || "")}</textarea></label>
        <div class="control-row"><button class="btn btn-primary save-lead">Save</button><button class="btn btn-danger delete-lead">Delete</button></div>
      </div>
    </article>`).join("");

  $("leadsContainer").querySelectorAll(".save-lead").forEach((button) => button.addEventListener("click", async () => {
    const card = button.closest(".lead-item");
    button.disabled = true;
    try {
      await api("/api/admin/leads/" + card.dataset.id, {
        method: "PATCH",
        body: JSON.stringify({ status: card.querySelector(".lead-status").value, adminNotes: card.querySelector(".lead-notes").value })
      });
      message("Enquiry updated.", "success");
      await refreshAll();
    } catch (error) { message(error.message, "error"); }
    finally { button.disabled = false; }
  }));
  $("leadsContainer").querySelectorAll(".delete-lead").forEach((button) => button.addEventListener("click", async () => {
    const card = button.closest(".lead-item");
    if (!confirm("Delete this enquiry permanently?")) return;
    button.disabled = true;
    try {
      await api("/api/admin/leads/" + card.dataset.id, { method: "DELETE" });
      message("Enquiry deleted.", "success");
      await refreshAll();
    } catch (error) { message(error.message, "error"); }
    finally { button.disabled = false; }
  }));
}

function resetServiceForm() {
  $("serviceId").value = "";
  $("serviceForm").reset();
  $("serviceOrder").value = "10";
  $("serviceSave").textContent = "Add service";
  $("serviceCancel").hidden = true;
}
function renderServices() {
  if (!services.length) {
    $("servicesContainer").innerHTML = '<div class="empty">No services yet. Add one above.</div>';
    return;
  }
  $("servicesContainer").innerHTML = services.map((service) => `
    <article class="service-row" data-id="${esc(service.id)}"><div>
      <h3>${esc(service.name)} <span class="status-pill ${service.active ? "status-won" : "status-lost"}">${service.active ? "Active" : "Hidden"}</span></h3>
      <p>${esc(service.description)}</p><small>${esc(service.priceLabel)} · ${esc(service.tagline)}</small>
    </div><div class="service-actions"><button class="btn btn-light edit-service">Edit</button><button class="btn btn-light toggle-service">${service.active ? "Hide" : "Publish"}</button><button class="btn btn-danger delete-service">Delete</button></div></article>`).join("");

  $("servicesContainer").querySelectorAll(".edit-service").forEach((button) => button.addEventListener("click", () => {
    const service = services.find((item) => item.id === button.closest(".service-row").dataset.id);
    if (!service) return;
    $("serviceId").value = service.id;
    $("serviceName").value = service.name;
    $("serviceTagline").value = service.tagline || "";
    $("servicePrice").value = service.priceLabel || "";
    $("serviceDescription").value = service.description || "";
    $("serviceOrder").value = service.sortOrder ?? 10;
    $("serviceSave").textContent = "Save changes";
    $("serviceCancel").hidden = false;
    $("serviceName").focus();
  }));
  $("servicesContainer").querySelectorAll(".toggle-service").forEach((button) => button.addEventListener("click", async () => {
    const service = services.find((item) => item.id === button.closest(".service-row").dataset.id);
    if (!service) return;
    button.disabled = true;
    try {
      await api("/api/admin/services/" + service.id, { method: "PATCH", body: JSON.stringify({ active: !service.active }) });
      message(service.active ? "Service hidden." : "Service published.", "success");
      await refreshAll();
    } catch (error) { message(error.message, "error"); }
    finally { button.disabled = false; }
  }));
  $("servicesContainer").querySelectorAll(".delete-service").forEach((button) => button.addEventListener("click", async () => {
    const service = services.find((item) => item.id === button.closest(".service-row").dataset.id);
    if (!service || !confirm(`Delete "${service.name}"?`)) return;
    button.disabled = true;
    try {
      await api("/api/admin/services/" + service.id, { method: "DELETE" });
      message("Service deleted.", "success");
      await refreshAll();
    } catch (error) { message(error.message, "error"); }
    finally { button.disabled = false; }
  }));
}

$("serviceForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("serviceId").value;
  const payload = {
    name: $("serviceName").value.trim(),
    tagline: $("serviceTagline").value.trim(),
    priceLabel: $("servicePrice").value.trim() || "Ask for quote",
    description: $("serviceDescription").value.trim(),
    sortOrder: Number($("serviceOrder").value || 10)
  };
  const button = $("serviceSave");
  button.disabled = true;
  try {
    await api(id ? "/api/admin/services/" + id : "/api/admin/services", {
      method: id ? "PATCH" : "POST", body: JSON.stringify(payload)
    });
    message(id ? "Service updated." : "Service added.", "success");
    resetServiceForm();
    await refreshAll();
  } catch (error) { message(error.message, "error"); }
  finally { button.disabled = false; }
});
$("serviceCancel").addEventListener("click", resetServiceForm);
$("refreshBtn").addEventListener("click", refreshAll);
$("leadSearch").addEventListener("input", renderLeads);
$("statusFilter").addEventListener("change", renderLeads);
checkSession();
