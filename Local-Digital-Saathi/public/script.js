const $ = (id) => document.getElementById(id);
const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[ch]));

$("year").textContent = new Date().getFullYear();

const menuToggle = $("menuToggle");
const nav = $("nav");
menuToggle.addEventListener("click", () => {
  const isOpen = nav.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.textContent = isOpen ? "✕" : "☰";
});
nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
  nav.classList.remove("open");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.textContent = "☰";
}));

async function loadServices() {
  const grid = $("serviceGrid");
  const select = $("service");
  try {
    const response = await fetch("/api/services");
    if (!response.ok) throw new Error("Services could not be loaded.");
    const data = await response.json();
    const services = data.services || [];
    if (!services.length) {
      grid.innerHTML = '<p class="form-note">Services will be added soon. You can still send an enquiry.</p>';
      return;
    }
    grid.innerHTML = services.map((service, index) => `
      <article class="service-card ${index === 0 ? "featured" : ""}">
        <div class="service-icon ${["purple","orange","green"][index % 3]}">${["▧","✳","◉"][index % 3]}</div>
        <div class="card-kicker">${escapeHTML(service.tagline || "OUR SERVICE")}</div>
        <h3>${escapeHTML(service.name)}</h3>
        <p>${escapeHTML(service.description)}</p>
        <div class="service-price">${escapeHTML(service.priceLabel)}</div>
        <a href="#contact" class="card-link" data-service="${escapeHTML(service.name)}">Enquire about this ↗</a>
      </article>`).join("");
    select.innerHTML = '<option value="">Choose a service</option>' +
      services.map((service) => `<option value="${escapeHTML(service.name)}">${escapeHTML(service.name)}</option>`).join("") +
      '<option value="Not sure yet">Not sure yet</option>';
    document.querySelectorAll("[data-service]").forEach((link) => link.addEventListener("click", () => {
      select.value = link.dataset.service;
    }));
  } catch (error) {
    grid.innerHTML = '<p class="form-note">Could not load services. Please refresh the page or contact us.</p>';
    console.error(error);
  }
}
loadServices();

$("leadForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const button = $("submitBtn");
  const note = $("formNote");
  const payload = {
    name: $("name").value.trim(),
    businessName: $("businessName").value.trim(),
    service: $("service").value,
    phone: $("phone").value.trim(),
    details: $("details").value.trim()
  };
  button.disabled = true;
  button.textContent = "Submitting…";
  note.textContent = "Saving your enquiry securely…";

  try {
    const response = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not save the enquiry.");
    note.textContent = "✓ Enquiry saved successfully! You can also send a WhatsApp message.";
    const message = `Hello Local Digital Saathi! I submitted an enquiry.\nName: ${payload.name}\nBusiness: ${payload.businessName}\nService: ${payload.service}\nPhone: ${payload.phone || "Not provided"}\nRequirements: ${payload.details || "Please contact me to discuss."}\nReference: ${result.lead.id}`;
    const whatsappUrl = "https://wa.me/?text=" + encodeURIComponent(message);
    const openWhatsApp = confirm("Your enquiry has been saved. Would you also like to open WhatsApp to send a message?");
    if (openWhatsApp) window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    form.reset();
  } catch (error) {
    note.textContent = error.message || "Something went wrong. Please try again.";
  } finally {
    button.disabled = false;
    button.textContent = "Submit enquiry ↗";
  }
});
