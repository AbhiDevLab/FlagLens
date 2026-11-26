import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {scanRepository} from "../src/scanner.js";
function repo(files,fn){const root=mkdtempSync(join(tmpdir(),"flaglens-"));try{for(const [name,data] of Object.entries(files)){const p=join(root,name);mkdirSync(join(p,".."),{recursive:true});writeFileSync(p,data);}fn(root);}finally{rmSync(root,{recursive:true,force:true});}}
test("detects known and unknown literal references with line numbers",()=>repo({"src/a.ts":'flagsmith.hasFeature("known");\nflagsmith.hasFeature("missing");'},root=>{const r=scanRepository(root,[{name:"known"}]);assert.equal(r.totalReferences,2);assert.equal(r.unknownReferences[0].feature,"missing");assert.equal(r.unknownReferences[0].locations[0].line,2);}));
test("resolves constant keys and template literals",()=>repo({"a.ts":'const key="known"; flagsmith.hasFeature(key); flagsmith.getValue(`missing`);'},root=>{const r=scanRepository(root,[{name:"known"}]);assert.equal(r.references.known.length,1);assert.equal(r.unknownReferences[0].feature,"missing");}));
test("detects aliased SDK methods",()=>repo({"a.js":'const check=flagsmith.hasFeature; check("known");'},root=>{const r=scanRepository(root,[{name:"known"}]);assert.equal(r.references.known.length,1);}));
test("detects supported one-parameter wrappers",()=>repo({"a.ts":'function enabled(key: string){return flagsmith.hasFeature(key)} enabled("known");'},root=>{const r=scanRepository(root,[{name:"known"}]);assert.equal(r.references.known.length,1);}));
test("reports unresolved dynamic keys separately",()=>repo({"a.ts":'declare const runtimeKey: string; flagsmith.hasFeature(runtimeKey);'},root=>{const r=scanRepository(root,[]);assert.equal(r.unknownReferences.length,0);assert.equal(r.dynamicReferences.length,1);}));
test("ignores comments and strings",()=>repo({"a.js":'// flagsmith.hasFeature("comment");\nconst text=\'flagsmith.hasFeature("string")\';'},root=>{assert.equal(scanRepository(root,[]).totalReferences,0);}));
test("reports unreferenced configured flags",()=>repo({"a.js":'flagsmith.hasFeature("used");'},root=>{const r=scanRepository(root,[{name:"used"},{name:"unused"}]);assert.equal(r.unreferencedFlags[0].feature,"unused");}));
test("ignores generated directories",()=>repo({"node_modules/a.js":'flagsmith.hasFeature("x")',"dist/a.js":'flagsmith.hasFeature("y")'},root=>{assert.equal(scanRepository(root,[]).filesScanned,0);}));
test("rejects missing repository paths",()=>assert.throws(()=>scanRepository(join(tmpdir(),"flaglens-no-such-dir"),[]),/does not exist/));
