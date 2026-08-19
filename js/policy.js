/**
 * This-process sandbox / approval / tools-mode policy for the exec bundle.
 * Vocabulary matches dsh-base (`DSH_PERMISSION_MODE`, approval ask|never,
 * tools native|code|both). Auto-allow is a headless answerer, not `never`
 * (dsh `never` auto-rejects).
 * @module dsh-exec-extension/policy
 */

export const SANDBOX_MODES = /** @type {const} */ (['read-only', 'workspace-write', 'danger-full-access'])
export const APPROVALS = /** @type {const} */ (['ask', 'never', 'allow'])
export const TOOLS_MODES = /** @type {const} */ (['native', 'code', 'both'])
export const FORMATS = /** @type {const} */ (['text', 'json'])

/** Pi `--thinking` → dsh effort. Extra Pi tiers collapse onto the nearest DeepSeek value. */
export const THINKING_TO_EFFORT = {
  off: 'off',
  minimal: 'high',
  low: 'high',
  medium: 'high',
  high: 'high',
  xhigh: 'max',
  max: 'max',
}

const SANDBOX_SET = new Set(SANDBOX_MODES)
const APPROVAL_SET = new Set(APPROVALS)
const TOOLS_SET = new Set(TOOLS_MODES)
const FORMAT_SET = new Set(FORMATS)

/**
 * @param {string} raw
 * @param {{ error: (message: string) => never }} program
 * @returns {(typeof SANDBOX_MODES)[number]}
 */
export function parseSandbox(raw, program) {
  if (!SANDBOX_SET.has(raw)) {
    program.error(`error: --sandbox must be one of ${SANDBOX_MODES.join(', ')}, got ${JSON.stringify(raw)}`)
  }
  return /** @type {(typeof SANDBOX_MODES)[number]} */ (raw)
}

/**
 * @param {string} raw
 * @param {{ error: (message: string) => never }} program
 * @returns {(typeof APPROVALS)[number]}
 */
export function parseApproval(raw, program) {
  if (!APPROVAL_SET.has(raw)) {
    program.error(`error: --approval must be one of ${APPROVALS.join(', ')}, got ${JSON.stringify(raw)}`)
  }
  return /** @type {(typeof APPROVALS)[number]} */ (raw)
}

/**
 * @param {string} raw
 * @param {{ error: (message: string) => never }} program
 * @returns {(typeof TOOLS_MODES)[number]}
 */
export function parseToolsMode(raw, program) {
  if (!TOOLS_SET.has(raw)) {
    program.error(`error: --tools-mode must be one of ${TOOLS_MODES.join(', ')}, got ${JSON.stringify(raw)}`)
  }
  return /** @type {(typeof TOOLS_MODES)[number]} */ (raw)
}

/**
 * @param {string} raw
 * @param {{ error: (message: string) => never }} program
 * @returns {(typeof FORMATS)[number]}
 */
export function parseFormat(raw, program) {
  if (!FORMAT_SET.has(raw)) {
    program.error(`error: --format must be text or json, got ${JSON.stringify(raw)}`)
  }
  return /** @type {(typeof FORMATS)[number]} */ (raw)
}

/**
 * @param {string} raw
 * @param {{ error: (message: string) => never }} program
 * @returns {'off' | 'high' | 'max'}
 */
export function parseThinking(raw, program) {
  const effort = THINKING_TO_EFFORT[raw]
  if (effort === undefined) {
    program.error(`error: --thinking must be one of ${Object.keys(THINKING_TO_EFFORT).join(', ')}, got ${JSON.stringify(raw)}`)
  }
  return effort
}

/**
 * @typedef {object} PolicyInput
 * @property {string} [sandbox]
 * @property {string} [permissionMode]
 * @property {string} [approval]
 * @property {boolean} [fullAuto]
 * @property {boolean} [yolo]
 * @property {{ error: (message: string) => never }} program
 */

/**
 * @typedef {object} ResolvedPolicy
 * @property {(typeof SANDBOX_MODES)[number]} permissionMode
 * @property {'ask' | 'never'} approvalPolicy
 * @property {boolean} autoApprove
 */

/**
 * @param {PolicyInput} input
 * @returns {ResolvedPolicy}
 */
export function resolvePolicy(input) {
  const { program } = input
  let permissionMode = parseSandbox(input.sandbox ?? input.permissionMode ?? 'workspace-write', program)

  const yolo = input.yolo === true
  if (yolo) permissionMode = 'danger-full-access'

  let approval = input.approval
  let autoApprove = false
  if (input.fullAuto === true) autoApprove = true
  if (yolo) {
    approval = approval ?? 'never'
    autoApprove = false
  } else if (permissionMode === 'danger-full-access' && approval === undefined) {
    approval = 'never'
  }

  const resolvedApproval = parseApproval(approval ?? 'ask', program)
  if (resolvedApproval === 'allow') {
    return { permissionMode, approvalPolicy: 'ask', autoApprove: true }
  }
  if (resolvedApproval === 'never') {
    return { permissionMode, approvalPolicy: 'never', autoApprove: false }
  }
  return { permissionMode, approvalPolicy: 'ask', autoApprove }
}
