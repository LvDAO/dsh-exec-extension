/**
 * Assemble one headless task from argv, piped stdin, attached files, and an
 * optional JSON Schema suffix. OpenCode concatenates message then stdin;
 * Pi inlines `@file` attachments into the prompt.
 * @module dsh-exec-extension/task
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024

/**
 * @param {string} raw
 * @returns {{ files: string[], words: string[] }}
 */
export function splitAtFiles(rawArgs) {
  const files = []
  const words = []
  for (const token of rawArgs) {
    if (token.startsWith('@') && token.length > 1) {
      files.push(token.slice(1))
      continue
    }
    words.push(token)
  }
  return { files, words }
}

/**
 * @param {{
 *   argvTask?: string
 *   stdinText?: string
 *   files?: { path: string, body: string }[]
 *   outputSchemaText?: string
 * }} input
 * @returns {string}
 */
export function assembleTask(input) {
  const parts = []
  const argv = input.argvTask === '-' ? '' : (input.argvTask ?? '').trimEnd()
  if (argv.trim() !== '') parts.push(argv)
  const stdin = (input.stdinText ?? '').trimEnd()
  if (stdin.trim() !== '') parts.push(stdin)
  for (const file of input.files ?? []) {
    parts.push(`<file path="${file.path}">\n${file.body}\n</file>`)
  }
  if (input.outputSchemaText !== undefined) {
    parts.push(
      'Respond with a single JSON object that conforms to this JSON Schema. Do not wrap it in markdown fences.\n'
      + input.outputSchemaText,
    )
  }
  return parts.join('\n\n')
}
