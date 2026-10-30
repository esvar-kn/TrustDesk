// Human-queue notifications (Phase 8.9). emitEscalation writes one notification
// per escalated ticket (deduped while an unread one already exists) and logs a
// mock Slack/email send — the demo stand-in for a real integration.
import { logger } from '../../config/logger.js';
import { newId } from '../ids.js';
import Notification from '../../models/Notification.js';

export async function emitEscalation(ticketId, reason) {
  // Avoid piling up duplicates if the same ticket is re-triaged.
  const existing = await Notification.findOne({ ticket_id: ticketId, type: 'escalation', read: false });
  if (existing) return existing;

  const message = `Ticket ${ticketId} escalated to human review${reason ? ` (${reason})` : ''}.`;
  const doc = await Notification.create({
    notification_id: newId('ntf'),
    type: 'escalation',
    ticket_id: ticketId,
    channel: 'human-review',
    message,
  });
  // Mock outbound send (Slack/email).
  logger.info({ ticket_id: ticketId, channel: 'human-review' }, `[notify] ${message}`);
  return doc;
}

export const notifier = { emitEscalation };
