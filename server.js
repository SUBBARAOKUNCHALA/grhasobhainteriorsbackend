const express    = require("express");
const mongoose   = require("mongoose");
const cors       = require("cors");
const dotenv     = require("dotenv");
const ExcelJS    = require("exceljs");
const cron       = require("node-cron");
const path       = require("path");
const fs         = require("fs");

dotenv.config(); // ← MUST be first

const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();

app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected");
    startCronJob();
    keepAlive();
  })
  .catch(err => console.log(err));

const User = require("./models/User");

// Ping route — keeps Render awake
app.get("/ping", (req, res) => {
  res.json({ status: "alive", time: new Date().toISOString() });
});

// Register route
app.post("/register", async (req, res) => {
  try {
    const { username, email, phone } = req.body;
    console.log("New lead:", { username, email, phone });

    const newUser = new User({ username, email, phone });
    await newUser.save();
    console.log("Saved to DB .");

    res.status(200).json({ message: "Request received successfully" });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Something went wrong", error: error.message });
  }
});

// Build Excel and send email
async function sendLeadsReport() {
  try {
    console.log(" Checking for unsent leads...");

    const leads = await User.find({ emailSent: false });

    if (leads.length === 0) {
      console.log("No new leads. Skipping.");
      return;
    }

    console.log(`Found ${leads.length} new lead(s). Building Excel...`);

    const workbook  = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Leads");

    worksheet.columns = [
      { header: "No.",       key: "index",    width: 6  },
      { header: "Name",      key: "username", width: 22 },
      { header: "Email",     key: "email",    width: 28 },
      { header: "Phone",     key: "phone",    width: 18 },
      { header: "Submitted", key: "date",     width: 24 },
    ];

    worksheet.getRow(1).eachCell(cell => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D2B2B" } };
      cell.font = { bold: true, color: { argb: "FFE8B86D" }, size: 11 };
      cell.border = { bottom: { style: "thin", color: { argb: "FFC9933A" } } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    worksheet.getRow(1).height = 28;

    leads.forEach((lead, i) => {
      const row = worksheet.addRow({
        index:    i + 1,
        username: lead.username,
        email:    lead.email,
        phone:    lead.phone,
        date:     new Date(lead.createdAt).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata"
                  }),
      });
      row.eachCell(cell => {
        cell.fill = {
          type: "pattern", pattern: "solid",
          fgColor: { argb: i % 2 === 0 ? "FFFAF7F2" : "FFFFFFFF" },
        };
        cell.alignment = { vertical: "middle", horizontal: "left" };
        cell.font = { size: 10 };
      });
      row.height = 22;
    });

    const filePath = path.join(__dirname, "leads_report.xlsx");
    await workbook.xlsx.writeFile(filePath);
    console.log("Excel file created .");

    const excelBuffer = fs.readFileSync(filePath);

    const { data, error } = await resend.emails.send({
      from:    "Grha Sobha <onboarding@resend.dev>",
      to:      ["grhasobhainteriors@gmail.com"],
      subject: `Grha Sobha — ${leads.length} New Lead${leads.length > 1 ? "s" : ""} Report`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
          <div style="background:#0d2b2b;padding:24px 28px;border-radius:10px 10px 0 0;">
            <h2 style="color:#e8b86d;margin:0;letter-spacing:2px;">GRHA SOBHA</h2>
            <p style="color:rgba(245,240,235,0.6);margin:4px 0 0;font-size:12px;">Consultation Leads Report</p>
          </div>
          <div style="background:#f9f6f2;padding:24px 28px;border-radius:0 0 10px 10px;">
            <p style="font-size:15px;color:#222;">
              Hi, you have <b>${leads.length} new lead${leads.length > 1 ? "s" : ""}</b> from the last 3 hours.
            </p>
            <p style="color:#555;font-size:13px;">Excel sheet attached with all details.</p>
            <p style="color:#aaa;font-size:11px;margin-top:20px;">Automated report — Grha Sobha website.</p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename:    `grhasobha_leads_${Date.now()}.xlsx`,
          content:     excelBuffer.toString("base64"),
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ],
    });

    if (error) {
      console.error("Resend error:", error);
      throw new Error(error.message);
    }

    console.log("Email sent with Excel .", data.id);

    const sentIds = leads.map(l => l._id);
    await User.updateMany(
      { _id: { $in: sentIds } },
      { $set: { emailSent: true } }
    );
    console.log(`Marked ${leads.length} leads as sent .`);

    fs.unlinkSync(filePath);

  } catch (err) {
    console.error("Report error:", err.message);
  }
}

// Cron — every 3 minutes for testing
function startCronJob() {
  cron.schedule("*/3 * * * *", () => {
    console.log("3min  cron fired");
    sendLeadsReport();
  });
  console.log("Cron job scheduled — every 3 minutes .");
}

// Keep Render free tier alive
function keepAlive() {
  setInterval(() => {
    const url = "https://grhasobhainteriorsbackend.onrender.com";
    fetch(`${url}/ping`)
      .then(() => console.log("Self-ping ."))
      .catch(err => console.log("Ping failed:", err.message));
  }, 10 * 60 * 1000);
  console.log("Keep-alive started .");
}

// Manual trigger
app.get("/send-report-now", async (req, res) => {
  await sendLeadsReport();
  res.json({ message: "Report triggered manually" });
});

app.listen(process.env.PORT || 5000, () => {
  console.log(`Server running on port ${process.env.PORT || 5000}`);
});