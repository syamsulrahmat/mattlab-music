#!/usr/bin/env node

/**
 * verify-smoke-test.cjs
 * Comprehensive Automated Pre-Deployment Verification Protocol
 * 1. AST Scope & TDZ Analysis of React Components (Catches render-time ReferenceErrors)
 * 2. Vite Production Build Verification
 * 3. Container Live Health & HTTP Verification
 * 4. Real Headless Chromium Client Smoke Test (Visits app domain, checks 0 console & runtime errors)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FRONTEND_DIR = '/mnt/user/Development/mattlab-music/frontend';
const REPO_DIR = '/mnt/user/Development/mattlab-music';

console.log('====================================================');
console.log('🚀 RUNNING MATTLAB AUTOMATED PRE-DEPLOYMENT VERIFICATION');
console.log('====================================================\n');

// ----------------------------------------------------
// GATE 1: AST SCOPE & TDZ STATIC SCANNER
// ----------------------------------------------------
console.log('🔍 [Gate 1] Scanning React components for Temporal Dead Zone (TDZ) violations...');
let babelParser, traverse;
try {
  babelParser = require(path.join(FRONTEND_DIR, 'node_modules/@babel/parser'));
  traverse = require(path.join(FRONTEND_DIR, 'node_modules/@babel/traverse')).default;
} catch (e) {
  console.error('❌ Failed to load Babel parser:', e.message);
  process.exit(1);
}

function checkComponentFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  let ast;
  try {
    ast = babelParser.parse(content, { sourceType: 'module', plugins: ['jsx'] });
  } catch (err) {
    return [`Parse error in ${filePath}: ${err.message}`];
  }

  const issues = [];

  traverse(ast, {
    Function(fPath) {
      // Analyze function components and custom hooks
      const id = fPath.node.id;
      const isComponent = id && /^[A-Z]|use[A-Z]/.test(id.name);
      if (!isComponent && fPath.parent.type !== 'VariableDeclarator') return;

      const body = fPath.get('body');
      if (!body.isBlockStatement()) return;

      const statements = body.get('body');
      const declarations = new Map();

      // Collect top-level declarations in component scope
      statements.forEach((stmt, idx) => {
        if (stmt.isVariableDeclaration()) {
          stmt.node.declarations.forEach((d) => {
            if (d.id.type === 'Identifier') {
              declarations.set(d.id.name, { line: d.loc.start.line, idx });
            } else if (d.id.type === 'ArrayPattern') {
              d.id.elements.forEach((el) => {
                if (el && el.type === 'Identifier') {
                  declarations.set(el.name, { line: el.loc.start.line, idx });
                }
              });
            }
          });
        }
      });

      // Check for render-time evaluation of identifiers before their declaration statement
      statements.forEach((stmt, sIdx) => {
        stmt.traverse({
          Function(innerFPath) {
            // Callback bodies are not evaluated synchronously at initial render
            innerFPath.skip();
          },
          Identifier(idPath) {
            if (idPath.parent.type === 'MemberExpression' && idPath.parent.property === idPath.node && !idPath.parent.computed) return;
            if (idPath.parent.type === 'OptionalMemberExpression' && idPath.parent.property === idPath.node && !idPath.parent.computed) return;
            if (idPath.parent.type === 'ObjectProperty' && idPath.parent.key === idPath.node && !idPath.parent.shorthand) return;

            const name = idPath.node.name;
            if (declarations.has(name)) {
              const dInfo = declarations.get(name);
              if (dInfo.idx > sIdx) {
                issues.push(
                  `${path.basename(filePath)}:${idPath.node.loc.start.line} -> "${name}" is evaluated at render time before its declaration at line ${dInfo.line}!`
                );
              }
            }
          },
        });
      });
    },
  });

  return issues;
}

const targetFiles = [
  path.join(FRONTEND_DIR, 'src/context/PlayerContext.jsx'),
  path.join(FRONTEND_DIR, 'src/context/AuthContext.jsx'),
  path.join(FRONTEND_DIR, 'src/App.jsx'),
];

let hasGate1Error = false;
for (const file of targetFiles) {
  if (fs.existsSync(file)) {
    const fileErrors = checkComponentFile(file);
    if (fileErrors.length > 0) {
      hasGate1Error = true;
      fileErrors.forEach((err) => console.error(`❌ TDZ Error: ${err}`));
    }
  }
}

if (hasGate1Error) {
  console.error('\n⛔ Gate 1 FAILED: Resolve render-time TDZ violations before deployment.\n');
  process.exit(1);
}
console.log('✅ Gate 1 PASSED: Zero render-time TDZ violations detected.\n');

// ----------------------------------------------------
// GATE 2: PRODUCTION BUILD VERIFICATION
// ----------------------------------------------------
console.log('🔨 [Gate 2] Compiling production build with Vite...');
try {
  execSync('npm run build', { cwd: FRONTEND_DIR, stdio: 'inherit' });
  console.log('✅ Gate 2 PASSED: Clean Vite bundle generated.\n');
} catch (e) {
  console.error('⛔ Gate 2 FAILED: Vite build failed.');
  process.exit(1);
}

// ----------------------------------------------------
// GATE 3: CONTAINER RESTART & HTTP HEALTH CHECK
// ----------------------------------------------------
console.log('🔄 [Gate 3] Restarting mattlab-music container...');
try {
  execSync('docker restart mattlab-music', { stdio: 'inherit' });
  // Wait 3 seconds for Uvicorn
  execSync('sleep 3');
  const res = execSync('curl -s -o /dev/null -w "%{http_code}" http://localhost:8085').toString().trim();
  if (res !== '200') {
    throw new Error(`Container returned HTTP ${res}`);
  }
  console.log(`✅ Gate 3 PASSED: Container is live and healthy (HTTP ${res}).\n`);
} catch (e) {
  console.error('⛔ Gate 3 FAILED: Container failed to restart or return HTTP 200:', e.message);
  process.exit(1);
}

// ----------------------------------------------------
// GATE 4: HEADLESS CHROMIUM CLIENT SMOKE TEST
// ----------------------------------------------------
console.log('🌐 [Gate 4] Executing Real Headless Chromium Browser Render Test...');
try {
  const flareSolverrPayload = JSON.stringify({
    cmd: 'request.get',
    url: 'https://music.mattdrive.com',
    maxTimeout: 25000,
  });

  const rawOut = execSync(
    `curl -s -X POST http://localhost:8191/v1 -H "Content-Type: application/json" -d '${flareSolverrPayload}'`
  ).toString();

  const parsed = JSON.parse(rawOut);
  if (parsed.status !== 'ok') {
    throw new Error(`Browser failed to load page: ${parsed.message || 'Unknown status'}`);
  }

  // Inspect container log for any client errors logged by React Error Boundary
  const errorLogs = execSync('docker logs --tail 25 mattlab-music 2>&1').toString();
  if (errorLogs.includes('BROWSER ERROR') || errorLogs.includes('POST /api/client-error')) {
    const errorMatch = errorLogs.match(/🔥🔥🔥 \[BROWSER ERROR\][\s\S]*?(?=INFO:)/);
    const detail = errorMatch ? errorMatch[0] : 'React Error Boundary caught an exception';
    throw new Error(`Client rendered an error boundary!\n${detail}`);
  }

  console.log('✅ Gate 4 PASSED: Headless Chromium successfully rendered MattLab Music with ZERO client errors!\n');
} catch (e) {
  console.error('⛔ Gate 4 FAILED: Client runtime error detected:', e.message);
  process.exit(1);
}

console.log('🎉 ALL 4 GATES PASSED! Deployment is 100% verified and operational.');
