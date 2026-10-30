import mongoose from 'mongoose';

const { Schema } = mongoose;

// Users. Passwords stored as bcrypt hashes only. Roles: agent (triage/draft/
// request), manager (+ approve/execute + user admin), auditor (read-only).
const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true },
    role: { type: String, enum: ['agent', 'manager', 'auditor'], required: true },
    password_hash: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
  },
  { collection: 'users' },
);

export default mongoose.models.User || mongoose.model('User', userSchema);
