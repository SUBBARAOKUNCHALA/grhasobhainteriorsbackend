const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const nodemailer = require("nodemailer");

dotenv.config();

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
}));

app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

const User = require("./models/User");

// ✅ Fixed transporter
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,  // App Password here
  },
  tls: {
    rejectUnauthorized: false,
  },
});

// Verify on startup
transporter.verify((error, success) => {
  if (error) console.log("SMTP Error:", error);
  else console.log("SMTP Ready ✅");
});

app.post("/register", async (req, res) => {
  try {
    console.log("subbu",req.body)
    const { username, email, phone } = req.body;

    const newUser = new User({ username, email, phone });
    await newUser.save();
    console.log("subbu")

    await transporter.sendMail({
      from: `"Grha Sobha Website" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      replyTo: email,
      subject: "New Consultation Request",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
          <div style="background:#0d2b2b;padding:24px 28px;border-radius:10px 10px 0 0;">
            <h2 style="color:#e8b86d;margin:0;letter-spacing:2px;">GRHA SOBHA</h2>
            <p style="color:rgba(245,240,235,0.6);margin:4px 0 0;font-size:12px;">New Consultation Request</p>
          </div>
          <div style="background:#f9f6f2;padding:24px 28px;border-radius:0 0 10px 10px;">
            <p><b>Name:</b> ${username}</p>
            <p><b>Email:</b> ${email}</p>
            <p><b>Phone:</b> ${phone}</p>
            <p style="color:#888;font-size:12px;margin-top:20px;">
              Sent from grhasobha.com contact form
            </p>
          </div>
        </div>
      `,
    });

    res.status(200).json({ message: "Data saved & mail sent" });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Something went wrong", error: error.message });
  }
});

app.listen(process.env.PORT || 5000, () => {
  console.log(`Server running on port ${process.env.PORT || 5000}`);
});