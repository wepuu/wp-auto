import assert from 'node:assert/strict';
export function declarationContext(ts, text, file, line, column) {
  const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const lines=text.split(/\r?\n/u);assert(Number.isSafeInteger(line)&&line>0&&line<=lines.length,'LINE_RANGE');
  const position=source.getPositionOfLineAndCharacter(line-1,column-1);
  let leaf=source;function visit(n){if(n.getStart(source)<=position&&position<n.end){leaf=n;ts.forEachChild(n,visit);}}visit(source);
  let module;
  for(let n=leaf;n;n=n.parent) {
    if(ts.isImportDeclaration(n)||ts.isExportDeclaration(n)) {if(n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier))module=n.moduleSpecifier.text;break;}
    if(ts.isImportTypeNode(n)&&ts.isLiteralTypeNode(n.argument)&&ts.isStringLiteral(n.argument.literal)){module=n.argument.literal.text;break;}
  }
  if(module!==undefined)assert(/^(?:(?:node|bun):)?[@a-zA-Z0-9_./-]+$/u.test(module),'PUBLIC_MODULE_SYNTAX');
  let indexed, generic;
  for(let n=leaf;n;n=n.parent) {
    if(!indexed && ts.isIndexedAccessTypeNode(n))indexed=n.getText(source).slice(0,12000);
    if(!generic && n.typeParameters)generic=n.typeParameters.map(p=>p.getText(source).slice(0,500));
  }
  return {line,column,syntaxKind:ts.SyntaxKind[leaf.kind],...(module?{module}:{}),
    ...(indexed?{indexedAccess:indexed}:{}),...(generic?{genericParameters:generic}:{}),
    publicExcerpt:lines.slice(Math.max(0,line-4),Math.min(lines.length,line+4)).join('\n').slice(0,4000)};
}
export function expectedDiagnostics(rows) {
 const counts={};for(const row of rows){const key=row.package+':'+row.code;counts[key]=(counts[key]??0)+1;}
 return counts;
}
