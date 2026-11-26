import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import ts from "typescript";

const EXTENSIONS = new Set([".js",".jsx",".ts",".tsx",".mjs",".cjs"]);
const IGNORED = new Set(["node_modules",".git","dist","build","coverage",".next",".vite"]);
const METHODS = new Set(["hasFeature","getValue","isFeatureEnabled"]);
const RECEIVERS = new Set(["flagsmith","featureFlags","flags"]);
const KINDS = {".js":ts.ScriptKind.JS,".mjs":ts.ScriptKind.JS,".cjs":ts.ScriptKind.JS,".jsx":ts.ScriptKind.JSX,".ts":ts.ScriptKind.TS,".tsx":ts.ScriptKind.TSX};

function methodOf(expr) {
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  if (ts.isElementAccessExpression(expr) && ts.isStringLiteral(expr.argumentExpression)) return expr.argumentExpression.text;
  return null;
}
function resolveString(node, constants, seen=new Set()) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node)) return resolveString(node.expression,constants,seen);
  if (ts.isIdentifier(node) && constants.has(node.text) && !seen.has(node.text)) {
    const next=new Set(seen); next.add(node.text); return resolveString(constants.get(node.text),constants,next);
  }
  return null;
}
function collect(source) {
  const constants=new Map(), aliases=new Map(), wrappers=new Map();
  function walk(n) {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      const name=n.name.text, init=n.initializer;
      if (ts.isPropertyAccessExpression(init) || ts.isElementAccessExpression(init)) {
        const receiver=init.expression, method=methodOf(init);
        if (METHODS.has(method) && ts.isIdentifier(receiver) && RECEIVERS.has(receiver.text)) aliases.set(name,method);
      }
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) wrappers.set(name,init);
      if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init) || ts.isIdentifier(init) || ts.isAsExpression(init) || ts.isParenthesizedExpression(init)) constants.set(name,init);
    }
    if (ts.isFunctionDeclaration(n) && n.name) wrappers.set(n.name.text,n);
    ts.forEachChild(n,walk);
  }
  walk(source); return {constants,aliases,wrappers};
}
function sdkCall(n,aliases) {
  if (!ts.isCallExpression(n)) return null;
  const e=n.expression;
  if (ts.isIdentifier(e) && aliases.has(e.text)) return aliases.get(e.text);
  if ((ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) && ts.isIdentifier(e.expression) && RECEIVERS.has(e.expression.text) && METHODS.has(methodOf(e))) return methodOf(e);
  if (ts.isIdentifier(e) && METHODS.has(e.text)) return e.text;
  return null;
}
function wrapperValue(call,wrappers,constants,aliases) {
  if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression) || !call.arguments.length) return null;
  const fn=wrappers.get(call.expression.text); if (!fn) return null;
  const params=fn.parameters.filter(p=>ts.isIdentifier(p.name)).map(p=>p.name.text);
  let used=false;
  function walk(n) {
    if (used) return;
    if (sdkCall(n,aliases) && n.arguments.length && ts.isIdentifier(n.arguments[0]) && params.includes(n.arguments[0].text)) used=true;
    ts.forEachChild(n,walk);
  }
  walk(fn.body);
  return used ? resolveString(call.arguments[0],constants) : null;
}

export function scanRepository(rootDirectory,features) {
  const root=resolve(rootDirectory);
  if (!existsSync(root)) throw new Error(`Repository path does not exist: ${root}`);
  const definitions=features.filter(f=>!f.is_archived), known=new Set(definitions.map(f=>f.name));
  const refs=new Map(), dynamicReferences=[], parseWarnings=[];
  let filesScanned=0;
  function visit(dir) {
    for (const entry of readdirSync(dir,{withFileTypes:true})) {
      const full=resolve(dir,entry.name);
      if (entry.isDirectory()) { if (!IGNORED.has(entry.name)) visit(full); continue; }
      if (!entry.isFile() || !EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
      filesScanned++;
      const source=readFileSync(full,"utf8"), file=relative(root,full).replace(/\\\\/g,"/");
      const sf=ts.createSourceFile(full,source,ts.ScriptTarget.Latest,true,KINDS[extname(entry.name).toLowerCase()]);
      if (sf.parseDiagnostics.length) {
        parseWarnings.push({file,message:sf.parseDiagnostics[0].messageText?.toString() ?? "Source parse error."});
        continue;
      }
      const {constants,aliases,wrappers}=collect(sf);
      function visitNode(n) {
        const method=sdkCall(n,aliases);
        if (method && n.arguments.length) {
          const name=resolveString(n.arguments[0],constants) ?? wrapperValue(n,wrappers,constants,aliases);
          const line=sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1;
          const location={file,line,method};
          if (name === null) dynamicReferences.push({expression:n.arguments[0].getText(sf),severity:"medium",locations:[location],message:"Feature key could not be resolved statically; manual review is required."});
          else { if (!refs.has(name)) refs.set(name,[]); refs.get(name).push(location); }
        }
        ts.forEachChild(n,visitNode);
      }
      visitNode(sf);
    }
  }
  visit(root);
  const names=new Set(refs.keys());
  const unknownReferences=[...refs].filter(([name])=>!known.has(name)).map(([feature,locations])=>({feature,severity:"high",locations,message:`Feature "${feature}" is referenced in code but does not exist in Flagsmith.`}));
  const unreferencedFlags=definitions.filter(f=>!names.has(f.name)).map(f=>({feature:f.name,severity:"medium",message:`Feature "${f.name}" exists in Flagsmith but was not found in the scanned repository.`}));
  return {repository:root,filesScanned,totalReferences:[...refs.values()].reduce((n,v)=>n+v.length,0),uniqueReferencedFlags:names.size,configuredFlags:definitions.length,unknownReferences,dynamicReferences,parseWarnings,unreferencedFlags,references:Object.fromEntries(refs),generatedAt:new Date().toISOString()};
}
