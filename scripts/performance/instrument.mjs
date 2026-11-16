import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { build } from 'vite';

// Runs only in an isolated benchmark snapshot. Normal WXT builds never import it.
const prelude = `
globalThis.__lsperf={active:false,events:[],sync(label,receiver,fn,...args){const t=performance.now();try{return Reflect.apply(fn,receiver,args)}finally{if(this.active)this.events.push({label,ms:performance.now()-t})}},async api(label,fn){const t=performance.now();try{return await fn()}finally{if(this.active)this.events.push({label,ms:performance.now()-t})}},begin(){return this.active?performance.now():null},end(label,t){if(t!==null)this.events.push({label,ms:performance.now()-t})}};
for(const [namespace,methods] of [['storage.local',['get','set']],['tabs',['query','get','create','discard','remove']],['windows',['getLastFocused']],['alarms',['getAll','create','clear']],['notifications',['getAll','getPermissionLevel','create']],['bookmarks',['getTree']]]){const api=namespace.split('.').reduce((a,k)=>a[k],chrome);for(const method of methods){const original=api[method].bind(api);api[method]=(...args)=>globalThis.__lsperf.api('chrome.'+namespace+'.'+method,()=>original(...args));}}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{if(message.type==='PERF_START'){globalThis.__lsperf.events=[];globalThis.__lsperf.active=true;reply({success:true});}else if(message.type==='PERF_STOP'){globalThis.__lsperf.active=false;reply({success:true,events:globalThis.__lsperf.events});}else return false;});
`;

export async function instrumentBuild(extensionPath) {
  const printer = ts.createPrinter();
  const wrap = (label, expression) => ts.factory.createCallExpression(
    ts.factory.createPropertyAccessExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('globalThis'), '__lsperf'), 'sync'),
    undefined, [ts.factory.createStringLiteral(label), ts.isPropertyAccessExpression(expression.expression) ? expression.expression.expression : ts.factory.createNull(), expression.expression, ...expression.arguments]);
  const selected = /\/(storage\/repository|domain\/(schemas|backup)|features\/reminders\/reminder-(coordinator|service)|entrypoints\/background)\.ts$/;
  const plugin = { name: 'linkshelf-benchmark-only-timing', enforce: 'pre', transform(code, id) {
    id = id.replaceAll('\\', '/');
    if (!selected.test(id)) return;
    const source = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const edits = [];
    const visit = node => {
      if (ts.isCallExpression(node)) {
        const name = node.expression.getText(source);
        const labels = { structuredClone: 'cpu.clone', 'JSON.stringify': 'cpu.stringify', 'JSON.parse': 'cpu.jsonParse',
          storedValuesEqual: 'cpu.compare', getIntegrityDiagnostics: 'cpu.integrity',
          'LinkShelfDatabaseSchema.safeParse': 'schema.database', 'LinkShelfBackupSchema.parse': 'schema.backup',
          'LinkShelfBackupSchema.safeParse': 'schema.backup', migrateLinkShelfDatabaseStructure: 'schema.migration',
          parseSupportedLinkShelfBackup: 'schema.supportedBackup', groupPendingReminders: 'reminder.group',
          searchBookmarkTree: 'bookmark.search',
        };
        if (labels[name]) {
          edits.push({ start: node.getStart(source), end: node.end, text: printer.printNode(ts.EmitHint.Expression, wrap(labels[name], node), source) });
          return; // No overlapping nested replacement ranges.
        }
      }
      if (id.endsWith('/storage/repository.ts') && ts.isMethodDeclaration(node) && node.body) {
        const name = node.name.getText(source);
        const async = node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword);
        if (async || ['createImportPlan', 'countDatabase', 'parseBackup', 'invalidateCache'].includes(name)) {
          edits.push({ start: node.body.getStart(source) + 1, end: node.body.getStart(source) + 1, text: `const __lsToken=globalThis.__lsperf.begin();try{${async ? 'return await(async()=>{' : ''}` });
          edits.push({ start: node.body.end - 1, end: node.body.end - 1, text: `${async ? '})();' : ''}}finally{globalThis.__lsperf.end(${JSON.stringify('repo.' + name)},__lsToken);}` });
        }
      }
      if (ts.isFunctionDeclaration(node) && ['reconcile', 'reconcileReminderAlarms'].includes(node.name?.text) && node.body) {
        const label = node.name.text === 'reconcile' ? 'reminder.reconcile' : 'reminder.alarmReconcile';
        edits.push({ start: node.body.getStart(source) + 1, end: node.body.getStart(source) + 1, text: `const __lsToken=globalThis.__lsperf.begin();try{` });
        edits.push({ start: node.body.end - 1, end: node.body.end - 1, text: `}finally{globalThis.__lsperf.end(${JSON.stringify(label)},__lsToken);}` });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    for (const edit of edits.sort((a, b) => b.start - a.start)) code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
    return { code, map: null };
  } };
  const outDir = path.join(extensionPath, 'diagnostic-build');
  await build({ configFile: false, logLevel: 'error', mode: 'production', plugins: [plugin],
    resolve: { alias: { '@': process.cwd() } }, define: { browser: 'chrome', defineBackground: '(fn)=>fn()' },
    build: { outDir, emptyOutDir: true, target: 'esnext', minify: true, sourcemap: false,
      lib: { entry: path.resolve('entrypoints/background.ts'), name: 'LinkShelfDiagnosticWorker', formats: ['iife'], fileName: () => 'worker.js' } },
  });
  const worker = await fs.readFile(path.join(outDir, 'worker.js'), 'utf8');
  await fs.writeFile(path.join(extensionPath, 'background.js'), prelude + worker);
}
