const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  username: String,
  email:    String,
  phone:    String,
  emailSent: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model("Lead", UserSchema, "leads");