module.exports = {
  '*.js,*.ts': ['eslint --fix', 'git add'],
  'package.json': ['format-package -w', 'git add']
}
