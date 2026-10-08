import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    // Always stored lower-cased, so the unique index is case-insensitive.
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    passwordHash: { type: String, required: true },
    phone: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
)

export const User = mongoose.model('User', userSchema)
