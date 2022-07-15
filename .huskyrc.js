/**
 * Husky git hooks
 *
 * @see https://github.com/typicode/husky
 *
 * Also uses lint-staged for pre-commit scripts
 *
 * @see https://github.com/okonet/lint-staged
 */
module.exports = {
  hooks: {
    'pre-commit': 'lint-staged',
    'pre-push': 'npm run test',
    'post-merge': 'npm install'
  }
}
