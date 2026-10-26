import mongoose from 'mongoose';

const { Schema } = mongoose;

// Demo users (agent, manager). Passwords stored as bcrypt hashes only.
const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true },
    role: { type: String, enum: ['agent', 'manager'], required: true },
    password_hash: { type: String, required: true },
  },
  { collection: 'users' },
);

export default mongoose.models.User || mongoose.model('User', userSchema);
