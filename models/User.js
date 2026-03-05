const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  username: String,
  email:    String,
  phone:    String,
  emailSent: { type: Boolean, default: false }, // ← track if included in report
}, { timestamps: true });

module.exports = mongoose.model("GrhaShobha", UserSchema);