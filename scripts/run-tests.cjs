const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = function transpileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      skipLibCheck: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const testsDir = path.join(__dirname, '..', 'tests');
for (const file of fs.readdirSync(testsDir).filter((name) => name.endsWith('.test.ts')).sort()) {
  require(path.join(testsDir, file));
}

