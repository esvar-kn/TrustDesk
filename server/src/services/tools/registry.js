// Tool registry: loads the seeded tool_catalog and enforces catalog-level rules
// (existence, required fields, allowed categories, amount cap). The policy
// allowlist and human approval are enforced separately in the tool-action
// service — this layer is just "is this a valid, well-formed request for the
// tool as cataloged".
import { fail } from '../../errors.js';
import ToolCatalog from '../../models/ToolCatalog.js';

let cache = null;

export async function load() {
  const tools = await ToolCatalog.find().lean();
  cache = new Map(tools.map((t) => [t.tool_name, t]));
  return cache;
}

async function ensure() {
  if (!cache) await load();
  return cache;
}

export function resetCache() {
  cache = null;
}

export async function get(toolName) {
  return (await ensure()).get(toolName);
}

export async function has(toolName) {
  return (await ensure()).has(toolName);
}

export async function list() {
  return [...(await ensure()).values()];
}

// Tool must exist in the catalog.
export async function assertExists(toolName) {
  const tool = await get(toolName);
  if (!tool) fail('NOT_FOUND', `Unknown tool: ${toolName}`);
  return tool;
}

// All required_fields must be present and non-empty in the payload.
export function assertRequiredFields(tool, payload = {}) {
  const missing = (tool.required_fields || []).filter((f) => {
    const v = payload[f];
    return v === undefined || v === null || v === '';
  });
  if (missing.length) fail('VALIDATION_ERROR', `Missing required field(s): ${missing.join(', ')}`);
}

// The ticket's category must be in the tool's allowed_categories.
export function assertAllowedCategory(tool, category) {
  if (!(tool.allowed_categories || []).includes(category)) {
    fail('POLICY_BLOCKED', `Tool ${tool.tool_name} is not allowed for category "${category}"`);
  }
}

// payload.amount must not exceed the tool's max_amount_inr (when set).
export function assertAmountCap(tool, payload = {}) {
  if (tool.max_amount_inr != null && payload.amount != null && payload.amount > tool.max_amount_inr) {
    fail('POLICY_BLOCKED', `Amount ${payload.amount} exceeds cap of ${tool.max_amount_inr}`);
  }
}

// Run all catalog-level checks; returns the tool. (Category optional.)
export async function validate({ toolName, payload = {}, category = null } = {}) {
  const tool = await assertExists(toolName);
  assertRequiredFields(tool, payload);
  if (category != null) assertAllowedCategory(tool, category);
  assertAmountCap(tool, payload);
  return tool;
}

export const registry = {
  load,
  resetCache,
  get,
  has,
  list,
  assertExists,
  assertRequiredFields,
  assertAllowedCategory,
  assertAmountCap,
  validate,
};
