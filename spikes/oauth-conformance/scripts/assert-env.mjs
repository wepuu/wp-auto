for (const name of process.argv.slice(2)) {
  if (!process.env[name]) throw new Error(`${name} is required for this test tier`);
}
