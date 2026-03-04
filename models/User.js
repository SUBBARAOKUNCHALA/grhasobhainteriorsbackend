const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  phone: String,
}, { timestamps: true });

module.exports = mongoose.model("GrhaShobha", userSchema);