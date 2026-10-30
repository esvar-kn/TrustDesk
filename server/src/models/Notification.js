import mongoose from 'mongoose';

const { Schema } = mongoose;

// Human-queue notifications (Phase 8.9). When a ticket escalates, an entry is
// written here and a mock Slack/email send is logged — the demo stand-in for a
// real human-review queue integration.
const notificationSchema = new Schema(
  {
    notification_id: { type: String, required: true, unique: true },
    type: { type: String, default: 'escalation' },
    ticket_id: { type: String, index: true },
    channel: { type: String, default: 'human-review' },
    message: String,
    read: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now },
  },
  { collection: 'notifications' },
);

notificationSchema.index({ read: 1, created_at: -1 });

export default mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
