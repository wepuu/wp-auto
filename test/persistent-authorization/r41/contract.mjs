import assert from 'node:assert/strict';
import {verifyBuildReceipt} from '../r40/contract.mjs';
export const revision='2ab57076511732fb2b2fbb1c50a03ee6c59ece4d';
export const images=Object.freeze({authorization:'sha256:a5062dbc9f3fb52b9eeecd6ba5d8273cc5ac223a09fa3c07d632f48356a7eaaa',control:'sha256:93577d94ba77b0f1f6c5350ef29b8f8809e67c5dabb1b5589b16bd104d0ed937',test:'sha256:f22b9a507d6d713f678fe5d35a6c83b9324572503c1dbba28cd0433f5348d7c9'});
export const compiledSha='6179918471d90689ce8693ee1423488bfcb1fcd48b357ac01a8c7963cb86b35d';
export const buildReceiptPath='C:\\Users\\liulo\\AppData\\Local\\Temp\\wepuu-r40-build-EK99jY\\result.json';
export const buildReceiptSha='a822a61661024af9d3f05bcdebadba223b7cb3133acb2a95ba348ba03c65a619';
export function verifyCandidate(v){const accepted=verifyBuildReceipt(v,revision);assert.deepEqual(accepted.images,images,'R40_IMAGES_REQUIRED');assert.equal(accepted.compiled.sha256,compiledSha,'R40_COMPILED_REQUIRED');return accepted;}
