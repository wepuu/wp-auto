export const requiredStages = Object.freeze(['runtime','input_baseline','config_parse','prerequisite_build','focused_program','declaration_typecheck','full_database_test_typecheck','focused_typecheck','targeted_lint','mapping_tests','input_postcheck']);
export function allPass(stages) {
  return Array.isArray(stages) && stages.length === requiredStages.length
    && new Set(stages.map(s => s.stage)).size === stages.length
    && requiredStages.every(name => stages.some(s => s.stage === name && s.passed === true));
}
