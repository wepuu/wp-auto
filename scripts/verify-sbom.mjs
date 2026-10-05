import fs from 'node:fs';
import process from 'node:process';

const path = process.argv[2];
if (!path) throw new Error('sbom_path_required');
const bom = JSON.parse(fs.readFileSync(path, 'utf8'));
if (bom.bomFormat !== 'CycloneDX' || bom.specVersion !== '1.6') {
  throw new Error('sbom_format_invalid');
}
if (!Array.isArray(bom.components) || bom.components.length < 250) {
  throw new Error('sbom_component_count_invalid');
}
for (const component of bom.components) {
  if (typeof component.name !== 'string' || typeof component.version !== 'string'
    || typeof component.purl !== 'string') {
    throw new Error('sbom_component_identity_missing');
  }
  if (!Array.isArray(component.licenses) || component.licenses.length === 0) {
    throw new Error(`sbom_license_missing:${component.purl}`);
  }
}
process.stdout.write(`SBOM_VALID=True\nSBOM_COMPONENTS=${bom.components.length}\n`);
