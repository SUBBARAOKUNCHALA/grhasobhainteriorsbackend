const express    = require("express");
const mongoose   = require("mongoose");
const cors       = require("cors");
const dotenv     = require("dotenv");
const nodemailer = require("nodemailer");
const ExcelJS    = require("exceljs");
const cron       = require("node-cron");
const path       = require("path");
const fs         = require("fs");

dotenv.config();

const app = express();

app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected");
    startCronJob(); // start scheduler after DB connects
  })
  .catch(err => console.log(err));

const User = require("./models/User");

// ── Nodemailer (only used locally — on Render replace with Resend) ──
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: { rejectUnauthorized: false },
});

// ── Register route — save data, return success immediately ──
app.post("/register", async (req, res) => {
  try {
    const { username, email, phone } = req.body;
    console.log("New lead:", { username, email, phone });

    const newUser = new User({ username, email, phone });
    await newUser.save();
    console.log("Saved to DB ✅");

    // Return success immediately — no email sent here
    res.status(200).json({ message: "Request received successfully" });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Something went wrong", error: error.message });
  }
});

// ── Build Excel and send email ──
async function sendLeadsReport() {
  try {
    console.log("⏰ Cron triggered — checking for unsent leads...");

    // Fetch only leads not yet included in a report
    const leads = await User.find({ emailSent: false });

    if (leads.length === 0) {
      console.log("No new leads. Skipping email.");
      return;
    }

    console.log(`Found ${leads.length} new lead(s). Building Excel...`);

    // ── Create Excel file ──
    const workbook  = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Leads");

    // Header row
    worksheet.columns = [
      { header: "No.",       key: "index",    width: 6  },
      { header: "Name",      key: "username", width: 22 },
      { header: "Email",     key: "email",    width: 28 },
      { header: "Phone",     key: "phone",    width: 18 },
      { header: "Submitted", key: "date",     width: 24 },
    ];

    // Style header row
    worksheet.getRow(1).eachCell(cell => {
      cell.fill = {
        type: "pattern", pattern: "solid",
        fgColor: { argb: "FF0D2B2B" },
      };
      cell.font   = { bold: true, color: { argb: "FFE8B86D" }, size: 11 };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFC9933A" } },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    worksheet.getRow(1).height = 28;

    // Data rows
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

      // Alternate row color
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

    // Save Excel to temp file
    const filePath = path.join(__dirname, "leads_report.xlsx");
    await workbook.xlsx.writeFile(filePath);
    console.log("Excel file created ✅");

    // ── Send email with Excel attachment ──
    await transporter.sendMail({
      from:    `"Grha Sobha Website" <${process.env.EMAIL_USER}>`,
      to:      process.env.EMAIL_USER,
      subject: `Grha Sobha — ${leads.length} New Lead${leads.length > 1 ? "s" : ""} Report`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
          <div style="background:#0d2b2b;padding:24px 28px;border-radius:10px 10px 0 0;">
            <h2 style="color:#e8b86d;margin:0;letter-spacing:2px;">GRHA SOBHA</h2>
            <p style="color:rgba(245,240,235,0.6);margin:4px 0 0;font-size:12px;">
              Consultation Leads Report
            </p>
          </div>
          <div style="background:#f9f6f2;padding:24px 28px;border-radius:0 0 10px 10px;">
            <p style="font-size:15px;color:#222;">
              Hi, you have <b>${leads.length} new lead${leads.length > 1 ? "s" : ""}</b> 
              from the last 3 hours.
            </p>
            <p style="color:#555;font-size:13px;">
              Please find the Excel sheet attached with all details.
            </p>
            <p style="color:#aaa;font-size:11px;margin-top:20px;">
              This is an automated report sent every 3 hours by Grha Sobha website.
            </p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename:    `grhasobha_leads_${Date.now()}.xlsx`,
          path:        filePath,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ],
    });

    console.log("Email sent with Excel ✅");

    // ── Mark these leads as sent so they won't appear in next report ──
    const sentIds = leads.map(l => l._id);
    await User.updateMany(
      { _id: { $in: sentIds } },
      { $set: { emailSent: true } }
    );
    console.log(`Marked ${leads.length} leads as sent ✅`);

    // Clean up temp file
    fs.unlinkSync(filePath);

  } catch (err) {
    console.error("Report error:", err.message);
  }
}

// ── Cron job — runs every 3 hours ──
function startCronJob() {
  // "0 */3 * * *" = at minute 0 of every 3rd hour (12am, 3am, 6am, 9am...)
  cron.schedule("0 */3 * * *", () => {
    console.log("⏰ 3-hour cron fired");
    sendLeadsReport();
  });

  console.log("Cron job scheduled — every 3 hours ✅");
}

// ── Manual trigger for testing ──
app.get("/send-report-now", async (req, res) => {
  await sendLeadsReport();
  res.json({ message: "Report triggered manually" });
});

app.listen(process.env.PORT || 5000, () => {
  console.log(`Server running on port ${process.env.PORT || 5000}`);
});