// Loads a ticket's customer/order/order-count and scanner flags, then runs the
// policy engine. The DB-backed counterpart to the pure evaluate().
import Customer from '../../models/Customer.js';
import Order from '../../models/Order.js';
import ToolCatalog from '../../models/ToolCatalog.js';
import { scanTicket } from '../guardrails/inputScanner.js';
import { evaluate } from './policyEngine.js';

export async function evaluateTicket(ticket) {
  const customer = (await Customer.findOne({ customer_id: ticket.customer_id }).lean()) || {};
  const order = ticket.order_id ? await Order.findOne({ order_id: ticket.order_id }).lean() : null;
  const orderCount = await Order.countDocuments({ customer_id: ticket.customer_id });
  const couponTool = await ToolCatalog.findOne({ tool_name: 'issue_coupon' }).lean();
  const flags = scanTicket(ticket, { couponCap: couponTool?.max_amount_inr ?? 1000 });
  return { policy: evaluate({ ticket, customer, order, flags, orderCount }), customer, order };
}
