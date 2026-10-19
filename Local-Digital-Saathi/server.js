require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3000);

if (!process.env.SESSION_SECRET) {
  console.warn("WARNING: Set SESSION_SECRET in your .env file before using this app.");
}

app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));

app.use(session({
  name: "lds.sid",
  secret: process.env.SESSION_SECRET || "local-dev-only-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8
  }
}));

const leadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many enquiries from this network. Please try again later." }
});

const leadSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  businessName: { type: String, required: true, trim: true, maxlength: 100 },
  service: { type: String, required: true, trim: true, maxlength: 100 },
  phone: { type: String, trim: true, maxlength: 30, default: "" },
  details: { type: String, trim: true, maxlength: 600, default: "" },
  status: {
    type: String,
    enum: ["new", "contacted", "quoted", "won", "lost"],
    default: "new"
  },
  adminNotes: { type: String, maxlength: 1200, default: "" }
}, { timestamps: true });

const serviceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true, maxlength: 100 },
  tagline: { type: String, trim: true, maxlength: 100, default: "" },
  description: { type: String, trim: true, maxlength: 500, default: "" },
  priceLabel: { type: String, trim: true, maxlength: 80, default: "Ask for quote" },
  active: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 10, min: 0, max: 999 }
}, { timestamps: true });

const Lead = mongoose.model("Lead", leadSchema);
const Service = mongoose.model("Service", serviceSchema);

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin === true) return next();
  return res.status(401).json({ error: "Please sign in as the administrator." });
}

function cleanString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function serviceOutput(service) {
  return {
    id: String(service._id),
    name: service.name,
    tagline: service.tagline,
    description: service.description,
    priceLabel: service.priceLabel,
    active: service.active,
    sortOrder: service.sortOrder,
    createdAt: service.createdAt
  };
}

function leadOutput(lead) {
  return {
    id: String(lead._id),
    name: lead.name,
    businessName: lead.businessName,
    service: lead.service,
    phone: lead.phone,
    details: lead.details,
    status: lead.status,
    adminNotes: lead.adminNotes,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt
  };
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" });
});

// Public: list active services
app.get("/api/services", async (req, res, next) => {
  try {
    const services = await Service.find({ active: true }).sort({ sortOrder: 1, createdAt: 1 }).lean();
    res.json({ services: services.map(serviceOutput) });
  } catch (error) {
    next(error);
  }
});

// Public: submit an enquiry
app.post("/api/leads", leadLimiter, async (req, res, next) => {
  try {
    const name = cleanString(req.body.name, 80);
    const businessName = cleanString(req.body.businessName || req.body.business_name, 100);
    const service = cleanString(req.body.service, 100);
    const phone = cleanString(req.body.phone, 30);
    const details = cleanString(req.body.details, 600);

    if (name.length < 2 || businessName.length < 2 || !service) {
      return res.status(400).json({ error: "Please enter your name, business name and service." });
    }

    const lead = await Lead.create({ name, businessName, service, phone, details });
    return res.status(201).json({
      ok: true,
      message: "Your enquiry has been saved.",
      lead: { id: String(lead._id), createdAt: lead.createdAt }
    });
  } catch (error) {
    next(error);
  }
});

// Admin login
app.post("/api/admin/login", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false
}), (req, res, next) => {
  const username = cleanString(req.body.username, 100);
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const expectedUser = process.env.ADMIN_USERNAME || "admin";
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedPassword || username !== expectedUser || password !== expectedPassword) {
    return res.status(401).json({ error: "Incorrect username or password. Check your .env file." });
  }

  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.isAdmin = true;
    req.session.save((saveError) => {
      if (saveError) return next(saveError);
      return res.json({ ok: true, message: "Signed in successfully." });
    });
  });
});

app.get("/api/admin/me", (req, res) => {
  res.json({ authenticated: Boolean(req.session && req.session.isAdmin === true) });
});

app.post("/api/admin/logout", requireAdmin, (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie("lds.sid", { httpOnly: true, sameSite: "strict" });
    res.json({ ok: true });
  });
});

// Admin: lead dashboard and statistics
app.get("/api/admin/leads", requireAdmin, async (req, res, next) => {
  try {
    const leads = await Lead.find().sort({ createdAt: -1 }).limit(500).lean();
    const [total, newCount, wonCount] = await Promise.all([
      Lead.countDocuments(),
      Lead.countDocuments({ status: "new" }),
      Lead.countDocuments({ status: "won" })
    ]);
    res.json({
      leads: leads.map(leadOutput),
      stats: { total, newCount, wonCount }
    });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/leads/:id", requireAdmin, async (req, res, next) => {
  try {
    const allowedStatuses = ["new", "contacted", "quoted", "won", "lost"];
    const status = cleanString(req.body.status, 20);
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: "Choose a valid enquiry status." });
    }

    const adminNotes = cleanString(req.body.adminNotes, 1200);
    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { status, adminNotes },
      { new: true, runValidators: true }
    );
    if (!lead) return res.status(404).json({ error: "Enquiry not found." });
    res.json({ ok: true, lead: leadOutput(lead) });
  } catch (error) {
    if (error.name === "CastError") return res.status(400).json({ error: "Invalid enquiry ID." });
    next(error);
  }
});

app.delete("/api/admin/leads/:id", requireAdmin, async (req, res, next) => {
  try {
    const lead = await Lead.findByIdAndDelete(req.params.id);
    if (!lead) return res.status(404).json({ error: "Enquiry not found." });
    res.json({ ok: true });
  } catch (error) {
    if (error.name === "CastError") return res.status(400).json({ error: "Invalid enquiry ID." });
    next(error);
  }
});

// Admin: service management
app.get("/api/admin/services", requireAdmin, async (req, res, next) => {
  try {
    const services = await Service.find().sort({ sortOrder: 1, createdAt: 1 }).lean();
    res.json({ services: services.map(serviceOutput) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/services", requireAdmin, async (req, res, next) => {
  try {
    const payload = {
      name: cleanString(req.body.name, 100),
      tagline: cleanString(req.body.tagline, 100),
      description: cleanString(req.body.description, 500),
      priceLabel: cleanString(req.body.priceLabel, 80) || "Ask for quote",
      sortOrder: Math.max(0, Math.min(999, Number(req.body.sortOrder) || 10)),
      active: req.body.active !== false
    };
    if (payload.name.length < 2) return res.status(400).json({ error: "Service name must be at least 2 characters." });
    const service = await Service.create(payload);
    res.status(201).json({ ok: true, service: serviceOutput(service) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "A service with this name already exists." });
    next(error);
  }
});

app.patch("/api/admin/services/:id", requireAdmin, async (req, res, next) => {
  try {
    const update = {};
    if (req.body.name !== undefined) update.name = cleanString(req.body.name, 100);
    if (req.body.tagline !== undefined) update.tagline = cleanString(req.body.tagline, 100);
    if (req.body.description !== undefined) update.description = cleanString(req.body.description, 500);
    if (req.body.priceLabel !== undefined) update.priceLabel = cleanString(req.body.priceLabel, 80) || "Ask for quote";
    if (req.body.active !== undefined) update.active = req.body.active === true;
    if (req.body.sortOrder !== undefined) update.sortOrder = Math.max(0, Math.min(999, Number(req.body.sortOrder) || 0));

    const service = await Service.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!service) return res.status(404).json({ error: "Service not found." });
    res.json({ ok: true, service: serviceOutput(service) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "A service with this name already exists." });
    if (error.name === "CastError") return res.status(400).json({ error: "Invalid service ID." });
    next(error);
  }
});

app.delete("/api/admin/services/:id", requireAdmin, async (req, res, next) => {
  try {
    const service = await Service.findByIdAndDelete(req.params.id);
    if (!service) return res.status(404).json({ error: "Service not found." });
    res.json({ ok: true });
  } catch (error) {
    if (error.name === "CastError") return res.status(400).json({ error: "Invalid service ID." });
    next(error);
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.use((req, res) => {
  res.status(404).json({ error: "Page or API route not found." });
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

async function seedServices() {
  const count = await Service.countDocuments();
  if (count > 0) return;
  await Service.insertMany([
    {
      name: "Business Website",
      tagline: "GET FOUND ONLINE",
      description: "A mobile-friendly website with services, business details and a WhatsApp enquiry path.",
      priceLabel: "From ₹1,999",
      sortOrder: 1
    },
    {
      name: "Social Media Creatives",
      tagline: "LOOK PROFESSIONAL",
      description: "Promotional posts, festival creatives and basic content planning for local brands.",
      priceLabel: "From ₹999",
      sortOrder: 2
    },
    {
      name: "WhatsApp Business Setup",
      tagline: "MAKE CONTACT EASY",
      description: "Click-to-chat setup, greeting guidance and service catalogue assistance.",
      priceLabel: "From ₹499",
      sortOrder: 3
    }
  ]);
  console.log("Default services added to the database.");
}

async function start() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/local_digital_saathi");
    console.log("MongoDB connected.");
    await seedServices();
    app.listen(PORT, () => {
      console.log(`Local Digital Saathi running at http://localhost:${PORT}`);
      console.log(`Admin dashboard: http://localhost:${PORT}/admin.html`);
    });
  } catch (error) {
    console.error("Could not start the app. Is MongoDB running and MONGODB_URI correct?");
    console.error(error.message);
    process.exit(1);
  }
}

start();
